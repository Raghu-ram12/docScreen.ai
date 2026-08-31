# syntax=docker/dockerfile:1

# ── Stage 1: Build React Frontend ───────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python Backend Runtime ─────────────────────────────────────────
FROM python:3.10-slim

LABEL maintainer="SIH Hackathon Team"
LABEL description="Document Screening Console — Full Stack AI Screening Application"

# Lightweight system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        tesseract-ocr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (CPU-only, no C++ dlib compilation)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY backend/ .

# Copy built frontend dist from Stage 1 into backend/dist
COPY --from=frontend-builder /frontend/dist ./dist

# Create runtime directories and pre-download / generate test assets
RUN mkdir -p static uploads test_assets models
RUN python -c "
import urllib.request, os
os.makedirs('models', exist_ok=True)
yunet_url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
sface_url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'
urllib.request.urlretrieve(yunet_url, 'models/face_detection_yunet_2023mar.onnx')
urllib.request.urlretrieve(sface_url, 'models/face_recognition_sface_2021dec.onnx')
"
RUN python generate_test_assets.py

# Expose server port
EXPOSE 7860

# Run FastAPI serving both API and Frontend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
