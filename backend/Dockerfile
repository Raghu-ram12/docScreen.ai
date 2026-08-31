# syntax=docker/dockerfile:1
FROM python:3.10-slim

LABEL maintainer="SIH Hackathon Team"
LABEL description="Document Screening Backend — Lightweight AI-powered identity document analysis"

# System dependencies (lightweight OpenCV & OCR runtimes, no C++ compiler required)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        tesseract-ocr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (CPU-only wheels, fast install < 1 min, < 500MB RAM)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Ensure runtime directories exist & download face models
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

RUN chmod -R 777 /app
EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
