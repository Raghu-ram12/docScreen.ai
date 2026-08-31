"""
generate_test_assets.py — Generate synthetic test images for verification.

Produces:
  test_assets/passport_clean.jpg   — synthetic passport with valid MRZ block
  test_assets/passport_tampered.jpg — same image with a text field edited
  test_assets/face_person_a.jpg    — synthetic face-like image (person A)
  test_assets/face_person_b.jpg    — synthetic face-like image (person B, different)
"""
import io
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path("test_assets")
OUT.mkdir(exist_ok=True)


def draw_passport(filename: str, doc_number: str, name: str, dob: str, expiry: str, country: str = "IND") -> None:
    """Draw a simplified passport-style document and save as JPEG."""
    W, H = 856, 540  # approximate passport card dimensions at 100 dpi
    img = Image.new("RGB", (W, H), color=(240, 240, 220))
    draw = ImageDraw.Draw(img)

    # Try to load a monospace font; fall back to default
    try:
        font_mrz  = ImageFont.truetype("cour.ttf", 22)   # Courier New — MRZ-like
        font_body = ImageFont.truetype("arial.ttf", 18)
        font_title = ImageFont.truetype("arialbd.ttf", 26)
    except OSError:
        font_mrz   = ImageFont.load_default()
        font_body  = ImageFont.load_default()
        font_title = ImageFont.load_default()

    # --- Document border ---
    draw.rectangle([(10, 10), (W - 10, H - 10)], outline=(0, 60, 120), width=4)

    # --- Header strip ---
    draw.rectangle([(10, 10), (W - 10, 70)], fill=(0, 60, 120))
    draw.text((20, 18), f"REPUBLIC OF {country}  —  PASSPORT", fill="white", font=font_title)

    # --- Photo placeholder ---
    draw.rectangle([(20, 85), (190, 310)], outline=(100, 100, 100), width=2)
    draw.text((55, 185), "PHOTO", fill=(150, 150, 150), font=font_body)

    # --- Text fields ---
    fields = [
        ("Surname",           name.split()[0] if name.split() else "TRAVELLER"),
        ("Given Names",       " ".join(name.split()[1:]) or "JOHN"),
        ("Nationality",       country),
        ("Date of Birth",     dob),
        ("Date of Expiry",    expiry),
        ("Document No.",      doc_number),
    ]
    y = 90
    for label, value in fields:
        draw.text((210, y),      f"{label}:", fill=(80, 80, 80),  font=font_body)
        draw.text((370, y),      value,        fill=(10, 10, 10),  font=font_body)
        draw.line([(210, y + 26), (640, y + 26)], fill=(200, 200, 200), width=1)
        y += 36

    # --- MRZ zone (bottom strip) ---
    draw.rectangle([(10, H - 100), (W - 10, H - 10)], fill=(230, 230, 210))
    draw.text((20, H - 95), "< MACHINE READABLE ZONE >", fill=(120, 120, 120), font=font_body)

    # Build MRZ-format lines
    # Line 1: P<CTRSURNAME<<GIVENNAMES
    surname    = name.split()[0].upper() if name.split() else "TRAVELLER"
    givennames = "".join(name.split()[1:]).upper() or "JOHN"
    line1 = f"P<{country}{surname}<<{givennames}".ljust(44, "<")[:44]

    # Line 2: DOCNUMBER<CHECK NATIONALITY DOB CHECKDOB EXPIRY CHECKEXPIRY M PERSONALNUM CHECK
    dn     = doc_number.upper().ljust(9, "<")[:9]
    dob_m  = dob.replace("-", "")[2:]          # YYMMDD
    exp_m  = expiry.replace("-", "")[2:]       # YYMMDD
    line2  = f"{dn}0{country}{dob_m}0M{exp_m}0<<<<<<<<<<<<<<<4"

    draw.text((20, H - 72), line1, fill=(0, 0, 0), font=font_mrz)
    draw.text((20, H - 44), line2, fill=(0, 0, 0), font=font_mrz)

    # Save through double JPEG compression so the clean image is already a proper
    # JPEG baseline (real photos are already compressed; ELA works on that assumption).
    # First pass at quality 85, then reload and save as the actual test file.
    buf_first = io.BytesIO()
    img.save(buf_first, format="JPEG", quality=85)
    buf_first.seek(0)
    precompressed = Image.open(buf_first).convert("RGB")
    precompressed.save(filename, format="JPEG", quality=95)
    print(f"  Saved: {filename}")


def make_tampered_version(src: str, dst: str) -> None:
    """
    Create a 'tampered' copy by:
      1. Extracting a region of the document
      2. Heavily re-compressing that region (simulates copy-paste from different source)
      3. Pasting a new text value over the document number field
      4. Saving the result

    This creates the JPEG block-quality mismatch that ELA is designed to detect:
    the pasted region has different compression history from the rest of the image.
    """
    img = Image.open(src).convert("RGB")
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()

    # --- Simulate copy-paste tampering ---
    # Region covering the document number value area (empirically from draw_passport layout)
    # At y=198 (6th field row at 90 + 5*36 = 270... let's use 258-290 for the doc number row)
    tamper_box = (370, 252, 640, 288)

    # Extract the region, compress it heavily (quality 30), and re-paste
    region = img.crop(tamper_box)
    buf = io.BytesIO()
    region.save(buf, format="JPEG", quality=15)   # extreme compression = strong ELA signal
    buf.seek(0)
    degraded_region = Image.open(buf).convert("RGB")
    img.paste(degraded_region, tamper_box[:2])

    # Now paint a white rectangle and write the fake document number on top
    draw.rectangle(list(tamper_box), fill=(240, 240, 220))
    draw.text((tamper_box[0] + 2, tamper_box[1] + 4), "ZZZ9999999", fill=(10, 10, 10), font=font)

    # Re-save at same quality as original so the splice stands out in ELA
    img.save(dst, format="JPEG", quality=95)
    print(f"  Saved tampered: {dst}")



def make_face_images() -> None:
    """Generate two distinct simple face-like synthetic images."""
    for i, (bg, circle_col, label) in enumerate([
        ((200, 180, 160), (160, 100, 80), "A"),   # warm tones — person A
        ((170, 200, 210), (100, 140, 160), "B"),  # cool tones — person B
    ], start=1):
        W, H = 200, 200
        img  = Image.new("RGB", (W, H), color=bg)
        draw = ImageDraw.Draw(img)

        # Rough oval for face
        draw.ellipse([(40, 30), (160, 170)], fill=circle_col)
        # Eyes
        draw.ellipse([(65,  80), (85,  100)], fill=(30, 20, 15))
        draw.ellipse([(115, 80), (135, 100)], fill=(30, 20, 15))
        # Nose
        draw.ellipse([(93, 110), (107, 124)], fill=(140, 90, 70))
        # Mouth
        draw.arc([(70, 128), (130, 155)], start=10, end=170, fill=(90, 50, 40), width=3)

        path = OUT / f"face_person_{label.lower()}.jpg"
        img.save(str(path), format="JPEG", quality=92)
        print(f"  Saved: {path}")


if __name__ == "__main__":
    print("Generating synthetic test assets...")

    # Clean passport — doc number matches the 'valid' DB record
    draw_passport(
        filename=str(OUT / "passport_clean.jpg"),
        doc_number="IND1234567",
        name="SHARMA PRIYA",
        dob="1990-05-20",
        expiry="2030-12-31",
        country="IND",
    )

    # Tampered copy
    make_tampered_version(
        src=str(OUT / "passport_clean.jpg"),
        dst=str(OUT / "passport_tampered.jpg"),
    )

    # Face images
    make_face_images()

    print("Pre-downloading AI models for fast runtime response...")
    try:
        import urllib.request
        MODELS_DIR = Path("models")
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        yunet_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        sface_path = MODELS_DIR / "face_recognition_sface_2021dec.onnx"
        if not yunet_path.exists():
            print("  Downloading YuNet model...")
            urllib.request.urlretrieve("https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx", str(yunet_path))
        if not sface_path.exists():
            print("  Downloading SFace model...")
            urllib.request.urlretrieve("https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx", str(sface_path))
    except Exception as e:
        print(f"  Warning downloading face models: {e}")

    print("Done. Contents of test_assets/:")
    for f in sorted(Path("test_assets").iterdir()):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name}  ({size_kb} KB)")
