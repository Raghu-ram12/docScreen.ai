"""
modules/ocr.py — Optical Character Recognition & Key Field Extraction for Identity Documents.

Extracts and structures key identity fields from any document:
  - Document Type (Passport, Driving License, National ID, Aadhaar, PAN Card, etc.)
  - Document Number / ID
  - Full Name / Surname / Given Names
  - Date of Birth (DOB)
  - Date of Expiry (DOE) / Date of Issue
  - Sex / Gender
  - Nationality / Country
  - Father's / Guardian's Name
  - MRZ Lines & Decoded Checksums
  - Raw OCR lines (retained for inspection)
"""
from __future__ import annotations

import os
import re
import warnings
from pathlib import Path
from typing import Optional

# Suppress internal passporteye, skimage, torch and easyocr deprecation notices
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", module="passporteye")
warnings.filterwarnings("ignore", module="skimage")
warnings.filterwarnings("ignore", module="torch")
warnings.filterwarnings("ignore", module="easyocr")


# ---------------------------------------------------------------------------
# Helper: MRZ string parser for TD1, TD2, TD3 (Passport) formats
# ---------------------------------------------------------------------------
def _parse_mrz_lines(lines: list[str]) -> dict:
    """Parse raw MRZ lines into structured fields."""
    mrz_lines = [
        re.sub(r"[^A-Z0-9<]", "", line.upper())
        for line in lines
        if "<" in line and len(re.sub(r"[^A-Z0-9<]", "", line)) >= 24
    ]

    if not mrz_lines:
        return {}

    parsed: dict = {"mrz_lines": mrz_lines}

    # TD3 format (2 lines of 44 chars) - Standard Passport
    if len(mrz_lines) >= 2 and len(mrz_lines[0]) >= 40 and len(mrz_lines[1]) >= 40:
        l1 = mrz_lines[0][:44]
        l2 = mrz_lines[1][:44]

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
    # PAN: 5 letters + 4 digits + 1 letter
    pan_match = re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", upper_text)
    # Aadhaar: 12 digits (with optional spaces)
    aadhaar_match = re.search(r"\b[0-9]{4}\s[0-9]{4}\s[0-9]{4}\b", upper_text) or re.search(r"\b[0-9]{12}\b", upper_text)
    # Passport standard: 1-3 letters + 6-8 digits (e.g. IND1234567, Z1234567, L1234567)
    passport_match = re.search(r"\b[A-Z]{1,3}[0-9]{6,8}\b", upper_text)
    # Driving license: DL followed by state code and digits
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

        # Look for colon-separated labels or multi-line label-value
        lbl, val = "", ""
        if ":" in clean:
            parts = clean.split(":", 1)
            lbl = parts[0].strip().lower()
            val = parts[1].strip()
        elif "-" in clean and len(clean.split()) > 1:
            parts = clean.split("-", 1)
            lbl = parts[0].strip().lower()
            val = parts[1].strip()
        else:
            lbl = clean.lower()

        # If value is empty or on next line, check next line
        if not val and i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            # Ensure next line isn't another header
            if not any(k in nxt.lower() for k in ["date", "name", "number", "sex", "no.", "republic", "photo", "mrz"]):
                val = nxt

        # Match labels
        if any(k in lbl for k in ["surname", "last name"]) and val and not fields.get("surname"):
            fields["surname"] = val.upper()
        elif any(k in lbl for k in ["given names", "given name", "first name"]) and val and not fields.get("given_names"):
            fields["given_names"] = val.upper()
        elif any(k in lbl for k in ["name", "holder name", "cardholder"]) and val and not fields.get("full_name") and not any(k in lbl for k in ["father", "mother", "guardian"]):
            fields["full_name"] = val.upper()
        elif any(k in lbl for k in ["nationality", "citizen", "citizenship"]) and val and not fields.get("nationality"):
            fields["nationality"] = val.upper()
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

    # 4. Standard Date Regex extraction fallback for DOB and Expiry
    date_patterns = re.findall(r"\b(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\b", full_text)
    if date_patterns:
        if not fields.get("date_of_birth") and len(date_patterns) >= 1:
            fields["date_of_birth"] = date_patterns[0]
        if not fields.get("expiry_date") and len(date_patterns) >= 2:
            fields["expiry_date"] = date_patterns[1]

    # Combine surname & given_names into full_name if missing
    if not fields.get("full_name") and (fields.get("given_names") or fields.get("surname")):
        given = fields.get("given_names", "")
        sur = fields.get("surname", "")
        fields["full_name"] = f"{given} {sur}".strip()

    return fields


# ---------------------------------------------------------------------------
# MRZ extraction via passporteye
# ---------------------------------------------------------------------------
def extract_mrz(image_path: str) -> Optional[dict]:
    """
    Attempt to read a Machine Readable Zone from `image_path`.
    Returns a dict of decoded MRZ fields on success, or None if no MRZ is found.
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

        # Format dates (YYMMDD -> YYYY-MM-DD)
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
# General-text fallback via EasyOCR with Deep Key Field Parsing
# ---------------------------------------------------------------------------
_easyocr_reader = None


def _get_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr  # type: ignore
        import torch
        try:
            torch.set_num_threads(1)
            torch.set_grad_enabled(False)
        except Exception:
            pass
        _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False, download_enabled=True)
    return _easyocr_reader


def warmup_ocr() -> None:
    """Pre-load OCR reader into RAM during server boot."""
    try:
        _get_reader()
    except Exception as e:
        print(f"[OCR] Warmup warning: {e}")


def extract_general_text(image_path: str) -> dict:
    """
    Extract all text and structure key identity fields using EasyOCR + heuristic regex parsing.
    Protected with low-memory CPU constraints for 512MB RAM cloud environments.
    """
    import gc
    try:
        reader = _get_reader()

        # Try running inside torch.inference_mode if available to eliminate all autograd allocations
        try:
            import torch
            with torch.inference_mode():
                results = reader.readtext(
                    image_path,
                    detail=1,
                    paragraph=False,
                    batch_size=1,
                    canvas_size=1024,
                    mag_ratio=1.0,
                )
        except Exception:
            results = reader.readtext(
                image_path,
                detail=1,
                paragraph=False,
                batch_size=1,
                canvas_size=1024,
                mag_ratio=1.0,
            )

        raw_text = [r[1].strip() for r in results if r[1].strip()]
        full_text = "\n".join(raw_text)

        # Free temporary tensor memory immediately
        gc.collect()

        # First, check if text contains MRZ lines that can be parsed directly
        mrz_parsed = _parse_mrz_lines(raw_text)

        # Extract entity key fields from regular text lines
        entity_parsed = _extract_entities_from_text(raw_text)

        # Merge MRZ fields with entity parsed fields (MRZ takes priority for standard fields)
        combined_fields = {**entity_parsed, **mrz_parsed}

        # Add raw text for inspection
        combined_fields["raw_text"] = raw_text
        combined_fields["full_text"] = full_text

        # Ensure document_number is present if possible
        if not combined_fields.get("document_number"):
            all_tokens = re.findall(r"[A-Z0-9]{6,14}", full_text.upper())
            candidates = [t for t in all_tokens if re.search(r"[0-9]", t)]
            if candidates:
                combined_fields["document_number"] = candidates[0]

        return combined_fields

    except Exception as exc:
        gc.collect()
        return {
            "document_type": "Unknown",
            "document_number": "",
            "raw_text": [],
            "full_text": "",
            "error": str(exc),
        }


