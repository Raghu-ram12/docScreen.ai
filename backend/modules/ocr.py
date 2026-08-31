"""
modules/ocr.py — Robust Multi-Engine OCR & Key Field Extraction for Identity Documents.

Pipeline (Render free-tier friendly):
  1. PassportEye MRZ reader (passporteye + pytesseract)
  2. Pytesseract general text extraction (primary)
  3. EasyOCR fallback (optional — only if installed and pytesseract yields nothing)
  4. Structured Entity & MRZ Parser (Passport, Aadhaar, PAN, DL, Voter ID)
"""
from __future__ import annotations

import gc
import os
import re
import warnings
from pathlib import Path
from typing import Optional
import numpy as np
from PIL import Image, ImageOps

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", module="passporteye")
warnings.filterwarnings("ignore", module="skimage")
warnings.filterwarnings("ignore", module="torch")
warnings.filterwarnings("ignore", module="easyocr")

# ---------------------------------------------------------------------------
# Pytesseract binary path — set explicitly for Linux (Render/Docker)
# On Windows this auto-detects; on Linux we pin the standard Debian path.
# ---------------------------------------------------------------------------
import sys as _sys
if _sys.platform != "win32":
    try:
        import pytesseract as _pyt
        import shutil as _shutil
        _tess_path = _shutil.which("tesseract") or "/usr/bin/tesseract"
        _pyt.pytesseract.tesseract_cmd = _tess_path
        # Ensure tessdata prefix is set so English language pack is found
        if not os.environ.get("TESSDATA_PREFIX"):
            import subprocess as _sp
            try:
                # Ask tesseract where its data is
                _out = _sp.check_output([_tess_path, "--print-parameters"], stderr=_sp.STDOUT, timeout=5).decode()
            except Exception:
                pass
            # Common Debian/Ubuntu tessdata locations
            for _candidate in [
                "/usr/share/tesseract-ocr/4.00/tessdata",
                "/usr/share/tesseract-ocr/5/tessdata",
                "/usr/share/tessdata",
                "/usr/local/share/tessdata",
            ]:
                if os.path.isdir(_candidate) and os.path.exists(os.path.join(_candidate, "eng.traineddata")):
                    os.environ["TESSDATA_PREFIX"] = _candidate
                    break
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# Helper: MRZ string parser for TD1, TD2, TD3 (Passport) formats
# ---------------------------------------------------------------------------
def _parse_mrz_lines(lines: list[str]) -> dict:
    """Parse raw MRZ lines into structured fields."""
    mrz_lines = [
        re.sub(r"[^A-Z0-9<]", "", line.upper())
        for line in lines
        if "<" in line and len(re.sub(r"[^A-Z0-9<]", "", line)) >= 20
    ]

    if not mrz_lines:
        return {}

    parsed: dict = {"mrz_lines": mrz_lines}

    # TD3 format (2 lines of ~44 chars) - Standard Passport
    if len(mrz_lines) >= 2 and len(mrz_lines[0]) >= 28 and len(mrz_lines[1]) >= 28:
        l1 = mrz_lines[0].ljust(44, "<")[:44]
        l2 = mrz_lines[1].ljust(44, "<")[:44]

        # Line 1: Type (2), Issuing Country (3), Names (39)
        doc_type = "Passport" if l1.startswith("P") else "ID Card"
        country = l1[2:5].replace("<", "")
        name_part = l1[5:].strip("<")
        if "<<" in name_part:
            surname, given = name_part.split("<<", 1)
            parsed["surname"] = surname.replace("<", " ").strip()
            parsed["given_names"] = given.replace("<", " ").strip()
            parsed["full_name"] = f"{parsed['given_names']} {parsed['surname']}".strip()
        else:
            parsed["full_name"] = name_part.replace("<", " ").strip()

        # Line 2: Doc Number (9), Check (1), Nationality (3), DOB (6), Check (1), Sex (1), Expiry (6), Check (1)
        doc_num = l2[0:9].replace("<", "")
        nat = l2[10:13].replace("<", "")
        raw_dob = l2[13:19]
        sex = l2[20:21]
        raw_exp = l2[21:27]

        parsed["document_number"] = doc_num
        parsed["country"] = country or nat
        parsed["nationality"] = nat or country
        parsed["document_type"] = doc_type
        if sex in ("M", "F", "X"):
            parsed["sex"] = "Male" if sex == "M" else "Female" if sex == "F" else "Other"

        # Format dates (YYMMDD -> YYYY-MM-DD)
        if len(raw_dob) == 6 and raw_dob.isdigit():
            yy = int(raw_dob[:2])
            year = 2000 + yy if yy <= 40 else 1900 + yy
            parsed["date_of_birth"] = f"{year}-{raw_dob[2:4]}-{raw_dob[4:6]}"

        if len(raw_exp) == 6 and raw_exp.isdigit():
            yy = int(raw_exp[:2])
            year = 2000 + yy if yy <= 60 else 1900 + yy
            parsed["expiry_date"] = f"{year}-{raw_exp[2:4]}-{raw_exp[4:6]}"

    return parsed


# ---------------------------------------------------------------------------
# Helper: Pattern-based entity & key field extraction
# ---------------------------------------------------------------------------
def _extract_entities_from_text(raw_lines: list[str]) -> dict:
    """Extract key identity fields from OCR recognized text lines."""
    full_text = "\n".join(raw_lines)
    upper_text = full_text.upper()
    fields: dict = {}

    # 1. Detect Document Type
    if "PASSPORT" in upper_text:
        fields["document_type"] = "Passport"
    elif any(k in upper_text for k in ["AADHAAR", "UIDAI", "UNIQUE IDENTIFICATION"]):
        fields["document_type"] = "Aadhaar Card"
    elif any(k in upper_text for k in ["INCOME TAX", "PERMANENT ACCOUNT NUMBER", "PAN CARD"]):
        fields["document_type"] = "PAN Card"
    elif any(k in upper_text for k in ["DRIVING LICENCE", "DRIVING LICENSE", "UNION OF INDIA DRIVING"]):
        fields["document_type"] = "Driving License"
    elif any(k in upper_text for k in ["ELECTION COMMISSION", "VOTER ID", "IDENTITY CARD"]):
        fields["document_type"] = "Voter ID"
    else:
        fields["document_type"] = "Identity Document"

    # 2. Extract Document Number via strict regex
    pan_match = re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", upper_text)
    aadhaar_match = re.search(r"\b[0-9]{4}\s[0-9]{4}\s[0-9]{4}\b", upper_text) or re.search(r"\b[0-9]{12}\b", upper_text)
    passport_match = re.search(r"\b[A-Z]{1,3}[0-9]{6,8}\b", upper_text)
    dl_match = re.search(r"\b[A-Z]{2}[-\s]?[0-9]{2,15}\b", upper_text)

    if pan_match:
        fields["document_number"] = pan_match.group(0)
    elif aadhaar_match:
        fields["document_number"] = aadhaar_match.group(0).replace(" ", "")
    elif passport_match:
        fields["document_number"] = passport_match.group(0)
    elif dl_match and fields["document_type"] == "Driving License":
        fields["document_number"] = dl_match.group(0)

    # 3. Line-by-line label matching
    for i, line in enumerate(raw_lines):
        clean = line.strip()
        if not clean:
            continue

        lbl, val = "", ""
        if ":" in clean:
            parts = clean.split(":", 1)
            lbl = parts[0].strip().lower()
            val = parts[1].strip()
        elif "=" in clean:
            parts = clean.split("=", 1)
            lbl = parts[0].strip().lower()
            val = parts[1].strip()
        elif "-" in clean and len(clean.split()) > 1 and not re.search(r"\d{4}-\d{2}-\d{2}", clean):
            parts = clean.split("-", 1)
            lbl = parts[0].strip().lower()
            val = parts[1].strip()
        else:
            lbl = clean.lower()

        if not val and i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            if not any(k in nxt.lower() for k in ["date", "name", "number", "sex", "no.", "republic", "photo", "mrz", "passport", "card"]):
                val = nxt

        if any(k in lbl for k in ["surname", "last name"]) and val and not fields.get("surname"):
            fields["surname"] = val.upper()
        elif any(k in lbl for k in ["given names", "given name", "first name"]) and val and not fields.get("given_names"):
            fields["given_names"] = val.upper()
        elif any(k in lbl for k in ["name", "holder name", "cardholder"]) and val and not fields.get("full_name") and not any(k in lbl for k in ["father", "mother", "guardian", "republic", "given", "sur"]):
            fields["full_name"] = val.upper()
        elif any(k in lbl for k in ["nationality", "citizen", "citizenship"]) and val and not fields.get("nationality"):
            fields["nationality"] = val.upper()
            fields["country"] = val.upper()
        elif any(k in lbl for k in ["date of birth", "dob", "birth date", "born on"]) and val and not fields.get("date_of_birth"):
            fields["date_of_birth"] = val
        elif any(k in lbl for k in ["date of expiry", "expiry date", "valid until", "expiration date", "valid upto"]) and val and not fields.get("expiry_date"):
            fields["expiry_date"] = val
        elif any(k in lbl for k in ["date of issue", "issue date", "issued on"]) and val and not fields.get("issue_date"):
            fields["issue_date"] = val
        elif any(k in lbl for k in ["sex", "gender"]) and val and not fields.get("sex"):
            v_up = val.upper()
            if "FEMALE" in v_up or v_up.startswith("F"):
                fields["sex"] = "Female"
            elif "MALE" in v_up or v_up.startswith("M"):
                fields["sex"] = "Male"
            else:
                fields["sex"] = val
        elif any(k in lbl for k in ["father", "s/o", "d/o", "w/o", "guardian"]) and val and not fields.get("father_name"):
            fields["father_name"] = val.upper()
        elif any(k in lbl for k in ["doc no", "document no", "passport no", "id no", "card no"]) and val and not fields.get("document_number"):
            fields["document_number"] = val.upper().replace(" ", "")

    # 4. Standard Date Regex extraction fallback
    date_patterns = re.findall(r"\b(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\b", full_text)
    if date_patterns:
        if not fields.get("date_of_birth") and len(date_patterns) >= 1:
            fields["date_of_birth"] = date_patterns[0]
        if not fields.get("expiry_date") and len(date_patterns) >= 2:
            fields["expiry_date"] = date_patterns[1]

    if not fields.get("full_name") and (fields.get("given_names") or fields.get("surname")):
        given = fields.get("given_names", "")
        sur = fields.get("surname", "")
        fields["full_name"] = f"{given} {sur}".strip()

    return fields


# ---------------------------------------------------------------------------
# MRZ extraction via passporteye (if Tesseract binary is available)
# ---------------------------------------------------------------------------
def extract_mrz(image_path: str) -> Optional[dict]:
    """
    Attempt to read a Machine Readable Zone from `image_path` using passporteye.
    """
    try:
        from passporteye import read_mrz  # type: ignore

        mrz = read_mrz(image_path)
        if mrz is None:
            return None

        data = mrz.to_dict()
        cleaned = {k: (v if v is not None else "") for k, v in data.items()}

        surname = cleaned.get("surname", "")
        names = cleaned.get("names", "")
        full_name = f"{names} {surname}".strip() if names or surname else ""

        dob = cleaned.get("date_of_birth", "")
        if len(dob) == 6 and dob.isdigit():
            yy = int(dob[:2])
            year = 2000 + yy if yy <= 40 else 1900 + yy
            dob = f"{year}-{dob[2:4]}-{dob[4:6]}"

        exp = cleaned.get("expiration_date", "")
        if len(exp) == 6 and exp.isdigit():
            yy = int(exp[:2])
            year = 2000 + yy if yy <= 60 else 1900 + yy
            exp = f"{year}-{exp[2:4]}-{exp[4:6]}"

        sex_val = cleaned.get("sex", "")
        if sex_val == "M":
            sex_display = "Male"
        elif sex_val == "F":
            sex_display = "Female"
        else:
            sex_display = sex_val

        return {
            "document_type": "Passport",
            "document_number": cleaned.get("number", ""),
            "full_name": full_name,
            "surname": surname,
            "given_names": names,
            "nationality": cleaned.get("nationality", "") or cleaned.get("country", ""),
            "date_of_birth": dob,
            "expiry_date": exp,
            "sex": sex_display,
            "country": cleaned.get("country", ""),
            "mrz_type": cleaned.get("type", "TD3"),
            "valid_score": cleaned.get("valid_score", None),
        }

    except Exception:
        return None


# ---------------------------------------------------------------------------
# General Text OCR Engine — Pytesseract primary, EasyOCR optional fallback
# ---------------------------------------------------------------------------
_easyocr_reader = None
_EASYOCR_AVAILABLE: Optional[bool] = None  # None = not yet checked


def _is_easyocr_available() -> bool:
    """Check once whether easyocr is importable (it may not be installed on free tier)."""
    global _EASYOCR_AVAILABLE
    if _EASYOCR_AVAILABLE is None:
        try:
            import easyocr  # noqa: F401
            _EASYOCR_AVAILABLE = True
        except ImportError:
            _EASYOCR_AVAILABLE = False
    return _EASYOCR_AVAILABLE


def _get_easyocr_reader():
    """Lazily initialise the EasyOCR reader. Returns None if not available."""
    global _easyocr_reader
    if not _is_easyocr_available():
        return None
    if _easyocr_reader is None:
        try:
            num_threads = min(os.cpu_count() or 2, 2)
            os.environ["OMP_NUM_THREADS"] = str(num_threads)
            try:
                import torch
                torch.set_num_threads(num_threads)
                torch.set_grad_enabled(False)
            except Exception:
                pass
            import easyocr
            try:
                _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False, download_enabled=True, quantize=True)
            except Exception:
                _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False, download_enabled=True)
        except Exception as exc:
            print(f"[OCR] EasyOCR initialisation failed: {exc}")
            _easyocr_reader = None
    return _easyocr_reader


def warmup_ocr() -> None:
    """
    Pre-warm OCR engine during server startup.
    Uses pytesseract if available (lightweight). EasyOCR warmup is skipped
    on free-tier deployments where it's not installed.
    """
    try:
        import pytesseract
        dummy = Image.new("L", (200, 60), color=255)
        result = pytesseract.image_to_string(dummy, lang="eng", config="--oem 3 --psm 6")
        print(f"[Startup] pytesseract warmed up OK (tesseract cmd: {pytesseract.pytesseract.tesseract_cmd})")
        return
    except Exception as exc:
        print(f"[Startup] pytesseract warmup FAILED: {exc}")

    if not _is_easyocr_available():
        print("[Startup] EasyOCR not installed — pytesseract-only mode active.")
        return

    try:
        reader = _get_easyocr_reader()
        if reader is not None:
            dummy_img = np.full((64, 256, 3), 255, dtype=np.uint8)
            reader.readtext(dummy_img, detail=0)
            print("[Startup] EasyOCR warmed up successfully.")
    except Exception as exc:
        print(f"[Startup] EasyOCR warmup notice: {exc}")


def _preprocess_for_ocr(img: Image.Image) -> Image.Image:
    """
    Preprocess a PIL image for maximum pytesseract accuracy on document photos.

    Steps:
      1. EXIF-correct orientation
      2. Convert to grayscale (tesseract works best on grayscale)
      3. Upscale if too small — tesseract is calibrated for ~300 DPI; phone document
         photos are often 150-200 DPI equivalent. Scaling to at least 1800px on the
         long edge gives enough resolution for the LSTM engine.
      4. CLAHE contrast enhancement via OpenCV — boosts faint text on glare/shadows
      5. Mild unsharp-mask sharpening — counteracts camera blur
    """
    img = ImageOps.exif_transpose(img).convert("L")  # grayscale

    # Upscale small images — tesseract struggles below ~200px text height
    w, h = img.size
    min_long_edge = 1800
    if max(w, h) < min_long_edge:
        scale = min_long_edge / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    # CLAHE — adaptive histogram equalisation for local contrast
    try:
        import cv2
        arr = np.array(img)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        arr = clahe.apply(arr)
        img = Image.fromarray(arr)
    except Exception:
        # Fallback: global auto-contrast if cv2 unavailable
        img = ImageOps.autocontrast(img, cutoff=1)

    # Mild sharpening to counteract camera/scanner blur
    img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=3))

    return img


def extract_general_text(image_path: str) -> dict:
    """
    Extract text and key fields using:
      1. Pytesseract with preprocessing (primary — fast, low memory)
      2. EasyOCR (optional fallback — only if installed and pytesseract yields nothing)
    """
    raw_text: list[str] = []
    full_text = ""

    # ── Strategy A: Pytesseract (primary engine) ──────────────────────────────
    try:
        import pytesseract

        with Image.open(image_path) as src:
            processed = _preprocess_for_ocr(src)

        # --oem 3  → LSTM engine (most accurate)
        # --psm 3  → fully automatic page segmentation (best for documents)
        tess_config = "--oem 3 --psm 3"

        # Point tesseract at the language data directory
        tessdata_dir = os.environ.get("TESSDATA_PREFIX", "")
        if tessdata_dir:
            tess_config += f" --tessdata-dir {tessdata_dir}"

        full_text = pytesseract.image_to_string(processed, lang="eng", config=tess_config)
        raw_text = [line.strip() for line in full_text.split("\n") if line.strip()]

        print(f"[OCR] pytesseract extracted {len(raw_text)} lines from {image_path}")

    except Exception as exc:
        print(f"[OCR] pytesseract failed: {exc}")
        raw_text = []
        full_text = ""

    # ── Strategy B: EasyOCR fallback (only if pytesseract returned nothing) ──
    if not raw_text and _is_easyocr_available():
        try:
            reader = _get_easyocr_reader()
            if reader is not None:
                with Image.open(image_path) as img:
                    img = ImageOps.exif_transpose(img)
                    w, h = img.size
                    if max(w, h) > 1000:
                        scale = 1000 / max(w, h)
                        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)
                    ocr_img = np.array(img.convert("RGB"))

                try:
                    import torch
                    with torch.inference_mode():
                        results = reader.readtext(ocr_img, detail=1, paragraph=False,
                                                  batch_size=1, canvas_size=800, mag_ratio=1.0)
                except Exception:
                    results = reader.readtext(ocr_img, detail=1, paragraph=False,
                                              batch_size=1, canvas_size=800, mag_ratio=1.0)

                raw_text = [r[1].strip() for r in results if r[1].strip()]
                full_text = "\n".join(raw_text)
                print(f"[OCR] EasyOCR fallback extracted {len(raw_text)} lines")
        except Exception as exc:
            print(f"[OCR] EasyOCR fallback failed: {exc}")

    # ── Structured parsing ────────────────────────────────────────────────────
    mrz_parsed = _parse_mrz_lines(raw_text)
    entity_parsed = _extract_entities_from_text(raw_text)

    combined_fields = {**entity_parsed, **mrz_parsed}
    combined_fields["raw_text"] = raw_text
    combined_fields["full_text"] = full_text

    if not combined_fields.get("document_number"):
        all_tokens = re.findall(r"[A-Z0-9]{6,14}", full_text.upper())
        candidates = [t for t in all_tokens if re.search(r"[0-9]", t)]
        if candidates:
            combined_fields["document_number"] = candidates[0]

    return combined_fields
