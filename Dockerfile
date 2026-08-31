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

# Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY backend/ .

# Copy built frontend dist from Stage 1 into backend/dist
COPY --from=frontend-builder /frontend/dist ./dist

# Create runtime directories (models are downloaded lazily on first request)
RUN mkdir -p static uploads test_assets models

# Ensure writable at runtime
RUN chmod -R 777 /app

# Render injects $PORT (default 10000). Fallback to 7860 for other platforms.
EXPOSE 10000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-keep-alive 120"]
