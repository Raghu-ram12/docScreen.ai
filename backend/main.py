"""
main.py — FastAPI entry point for the Document Screening Backend.

Wires together OCR, validation, tampering detection, face matching,
and risk scoring into a single /analyze-document endpoint.
"""
import os
import shutil
import uuid
import warnings
from pathlib import Path

# Suppress 3rd party deprecation and backend warnings (passporteye, skimage, torch, easyocr)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", module="passporteye")
warnings.filterwarnings("ignore", module="skimage")
warnings.filterwarnings("ignore", module="torch")
warnings.filterwarnings("ignore", module="easyocr")

# Suppress OpenCV DNN backend warnings
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"
try:
    import cv2
    if hasattr(cv2, "utils") and hasattr(cv2.utils, "logging"):
        cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)
    elif hasattr(cv2, "setLogLevel"):
        cv2.setLogLevel(0)
except Exception:
    pass

from contextlib import asynccontextmanager
import threading
from PIL import Image, ImageOps

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# App lifespan (pre-warm AI models in background during boot)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    def _warmup():
        try:
            from modules.ocr import warmup_ocr
            warmup_ocr()
        except Exception as e:
            print(f"[Startup] OCR warmup info: {e}")
        try:
            from modules.face_match import _ensure_models
            _ensure_models()
        except Exception as e:
            print(f"[Startup] Face model info: {e}")

    threading.Thread(target=_warmup, daemon=True).start()
    yield


app = FastAPI(
    title="Document Screening API",
    description="AI-powered identity-document screening for border checkpoints (SIH MVP)",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _optimize_uploaded_image(file_path: Path, max_dim: int = 1400) -> None:
    """Downscale large camera images (e.g. 4000x3000) for 10x faster OCR and tampering inference."""
    try:
        with Image.open(file_path) as img:
            img = ImageOps.exif_transpose(img)
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                new_size = (int(w * scale), int(h * scale))
                img = img.resize(new_size, Image.Resampling.BILINEAR)
            img = img.convert("RGB")
            img.save(file_path, format="JPEG", quality=90)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Health check & Root status
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"])
@app.head("/health", tags=["meta"])
def health_check():
    """Liveness probe — returns ok when the server is running."""
    return {"status": "ok"}


@app.get("/", tags=["meta"])
@app.head("/", tags=["meta"])
def root_status():
    """Root endpoint for status check and API navigation."""
    # If React frontend dist is present, let the SPA handler serve index.html
    if (Path("dist") / "index.html").exists() or (Path("../frontend/dist") / "index.html").exists():
        from fastapi.responses import FileResponse
        dist_path = Path("dist") if (Path("dist") / "index.html").exists() else Path("../frontend/dist")
        return FileResponse(dist_path / "index.html")

    return {
        "status": "ok",
        "service": "Document Screening API",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_url": "/health",
        "analyze_endpoint": "/analyze-document"
    }


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def validate_upload(file: UploadFile, label: str = "file") -> None:
    """Validate uploaded file format and size."""
    if not file.filename:
        raise HTTPException(status_code=400, detail=f"Invalid {label}: missing filename.")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format for {label} '{file.filename}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )


# ---------------------------------------------------------------------------
# /analyze-document
# ---------------------------------------------------------------------------
@app.post("/analyze-document", tags=["screening"])
async def analyze_document(
    document: UploadFile = File(..., description="Photo of the identity document"),
    selfie: UploadFile = File(None, description="Optional live selfie for face verification"),
):
    """
    Full document screening pipeline:
      1. OCR — extract fields / MRZ
      2. Validation — check against mock DB
      3. Tampering — ELA + metadata + noise checks
      4. Face verification — compare document photo to selfie or DB record
      5. Risk scoring — weighted aggregate
    """
    validate_upload(document, "document")
    if selfie and selfie.filename:
        validate_upload(selfie, "selfie")

    # ---- save uploads to temp paths ----------------------------------------
    doc_path = UPLOAD_DIR / f"{uuid.uuid4()}_{Path(document.filename).name}"
    with doc_path.open("wb") as f:
        content = await document.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Document file size exceeds 10MB limit.")
        f.write(content)

    selfie_path = None
    if selfie and selfie.filename:
        selfie_path = UPLOAD_DIR / f"{uuid.uuid4()}_{Path(selfie.filename).name}"
        with selfie_path.open("wb") as f:
            content = await selfie.read()
            if len(content) > MAX_FILE_SIZE:
                if doc_path.exists():
                    doc_path.unlink()
                raise HTTPException(status_code=400, detail="Selfie file size exceeds 10MB limit.")
    # Optimize image dimensions for sub-second CPU inference
    _optimize_uploaded_image(doc_path, max_dim=1400)
    if selfie_path and selfie_path.exists():
        _optimize_uploaded_image(selfie_path, max_dim=900)

    try:
        # ---- 1. OCR --------------------------------------------------------
        from modules.ocr import extract_mrz, extract_general_text

        mrz_fields = extract_mrz(str(doc_path))
        if mrz_fields:
            extracted_fields = mrz_fields
            ocr_method = "passporteye_mrz"
        else:
            extracted_fields = extract_general_text(str(doc_path))
            ocr_method = "easyocr_fallback"

        # ---- 2. Validation -------------------------------------------------
        from modules.validation import validate_document

        doc_number = (
            extracted_fields.get("document_number")
            or extracted_fields.get("doc_number")
            or "UNKNOWN"
        )
        validation_result = validate_document(doc_number)

        # ---- 3. Tampering --------------------------------------------------
        from modules.tampering import run_tampering_checks

        tampering_result = run_tampering_checks(str(doc_path))

        # Expose ELA heatmap as a static URL if one was produced
        heatmap_url = None
        heatmap_src = Path(tampering_result.get("heatmap_path", ""))
        if heatmap_src.exists():
            heatmap_url = f"/static/{heatmap_src.name}"

        # ---- 4. Face verification ------------------------------------------
        from modules.face_match import match_faces

        face_result = match_faces(
            doc_image_path=str(doc_path),
            live_image_path=str(selfie_path) if selfie_path and selfie_path.exists() else None,
            doc_number=doc_number,
        )

        # ---- 5. Risk scoring -----------------------------------------------
        from modules.risk_engine import compute_risk

        blacklist_flag = validation_result.get("status") == "blacklisted"
        risk_result = compute_risk(
            validation_result=validation_result,
            tampering_score=tampering_result.get("tampering_score", 0.0),
            face_score=face_result.get("distance"),
            blacklist_flag=blacklist_flag,
            face_match_status=face_result.get("match_status", ""),
        )

        # ---- Build response ------------------------------------------------
        return {
            "extracted_fields": extracted_fields,
            "ocr_method": ocr_method,
            "validation": validation_result,
            "tampering": {
                **tampering_result,
                "heatmap_url": heatmap_url,
            },
            "face_verification": face_result,
            "risk": risk_result,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    finally:
        # Clean up uploads (keep heatmaps in static/)
        if doc_path.exists():
            doc_path.unlink()
        if selfie_path and selfie_path.exists():
            selfie_path.unlink()


# ---------------------------------------------------------------------------
# Serve React Frontend (Single-Port Production Deployment)
# ---------------------------------------------------------------------------
FRONTEND_DIST = Path("dist")
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path("../frontend/dist")

if FRONTEND_DIST.exists():
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("static/") or full_path.startswith("docs") or full_path.startswith("openapi.json") or full_path.startswith("health") or full_path.startswith("analyze-document"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")

