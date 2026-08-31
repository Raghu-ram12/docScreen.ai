---
title: Document Screening Backend
emoji: 🛂
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Document Screening Backend

AI-powered identity-document screening API for border checkpoints — SIH hackathon MVP.

## Features

| Module | Description |
|--------|-------------|
| **OCR** | MRZ extraction via `passporteye`; EasyOCR fallback for non-MRZ documents |
| **Validation** | Mock SQLite registry check (valid / expired / blacklisted) |
| **Tampering Detection** | ELA + EXIF metadata + block-level noise-variance inconsistency |
| **Face Verification** | `face_recognition` (dlib) — document photo vs live selfie |
| **Risk Scoring** | Weighted aggregate score + LOW / MEDIUM / HIGH band |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness probe |
| `POST` | `/analyze-document` | Full screening pipeline |
| `GET`  | `/static/{filename}` | Serve ELA heatmaps |
| `GET`  | `/docs` | Swagger UI |

### `POST /analyze-document`

**Form fields:**
- `document` (required) — image of the identity document
- `selfie` (optional) — live selfie for face verification

**Response shape:**
```json
{
  "extracted_fields": { "document_number": "...", ... },
  "ocr_method": "passporteye_mrz | easyocr_fallback",
  "validation": { "status": "valid|expired|blacklisted|not_found", ... },
  "tampering": {
    "tampering_score": 0.12,
    "ela_score": 0.08,
    "metadata_score": 0.2,
    "noise_score": 0.05,
    "heatmap_url": "/static/ela_passport_clean.jpg"
  },
  "face_verification": { "matched": true, "distance": 0.32, ... },
  "risk": { "score": 0.18, "band": "LOW", "breakdown": { ... } }
}
```

## Tech Stack

- **Python 3.10**, **FastAPI**, **Uvicorn**
- **passporteye** (MRZ) + **EasyOCR** (general text)
- **Pillow** + **opencv-python-headless** + **numpy** (tampering)
- **face_recognition** / **dlib** (face verification)
- **SQLite** (mock registry — no ORM)
- **Docker** (Hugging Face Spaces deployment)

## Seeded Test Documents

| Document Number | Status |
|-----------------|--------|
| `IND1234567` | ✅ valid |
| `IND9999999` | ⏳ expired |
| `IND0000001` | 🚫 blacklisted |

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Generate test assets
python generate_test_assets.py

# Run the server
uvicorn main:app --reload

# Test health
curl http://localhost:8000/health
```

## Docker

```bash
# Build
docker build -t doc-screening-backend .

# Run
docker run -p 7860:7860 doc-screening-backend

# Test
curl http://localhost:7860/health
```

## Non-Goals (MVP Scope)

- No custom ML model training
- No authentication or persistent cloud database
- No frontend (separate repo)
