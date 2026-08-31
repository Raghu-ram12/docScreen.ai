# syntax=docker/dockerfile:1
FROM python:3.10-slim

LABEL maintainer="SIH Hackathon Team"
LABEL description="Document Screening Backend — Lightweight AI-powered identity document analysis"

# System dependencies (lightweight OpenCV & OCR runtimes)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        tesseract-ocr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Create runtime directories (models download lazily on first request — no build-time network calls)
RUN mkdir -p static uploads test_assets models

RUN chmod -R 777 /app

# Render injects $PORT (default 10000). Fallback to 10000 for consistency.
EXPOSE 10000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-keep-alive 120"]
