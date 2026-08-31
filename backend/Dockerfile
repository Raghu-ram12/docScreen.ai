# syntax=docker/dockerfile:1
FROM python:3.10-slim

LABEL maintainer="SIH Hackathon Team"
LABEL description="Document Screening Backend — AI-powered identity document analysis"

# ── System dependencies ────────────────────────────────────────────────────
# cmake       — required to compile dlib (face_recognition dependency)
# build-essential — C++ compiler for dlib
# libgl1      — OpenCV headless runtime
# libglib2.0-0 — glib runtime (OpenCV dependency)
# tesseract-ocr — required by pytesseract (passporteye dependency)
RUN apt-get update && apt-get install -y --no-install-recommends \
        cmake \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        tesseract-ocr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ──────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies ────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ───────────────────────────────────────────────────────
COPY . .

# Ensure runtime directories exist
RUN mkdir -p static uploads test_assets

# Pre-generate the test assets so they're available inside the container
RUN python generate_test_assets.py

# ── Hugging Face Spaces port ───────────────────────────────────────────────
EXPOSE 7860

# ── Entry point ────────────────────────────────────────────────────────────
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
