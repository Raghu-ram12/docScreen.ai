"""
modules/face_match.py — High-accuracy Face Verification for Document Screening.

Uses OpenCV's official Deep Learning models:
  1. YuNet (cv2.FaceDetectorYN) — fast & accurate face detection with 5-point landmarks
  2. SFace (cv2.FaceRecognizerSF) — 128-dimensional deep face feature extraction and cosine matching

Automatically downloads models on first run if not present.
Falls back gracefully if models cannot be initialized.
"""
from __future__ import annotations

import os
import urllib.request
import warnings
from pathlib import Path
from typing import Optional
import numpy as np

# Suppress OpenCV DNN target notices
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"
import cv2
if hasattr(cv2, "utils") and hasattr(cv2.utils, "logging"):
    cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)

from PIL import Image, ImageOps

MODELS_DIR = Path("models")
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface_2021dec.onnx"

_detector = None
_recognizer = None


def _ensure_models() -> bool:
    """Ensure ONNX models exist, downloading if necessary."""
    global _detector, _recognizer
    if _detector is not None and _recognizer is not None:
        return True

    try:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

        if not YUNET_PATH.exists():
            print("[face_match] Downloading YuNet face detection model...")
            urllib.request.urlretrieve(YUNET_URL, str(YUNET_PATH))

        if not SFACE_PATH.exists():
            print("[face_match] Downloading SFace face recognition model...")
            urllib.request.urlretrieve(SFACE_URL, str(SFACE_PATH))

        _detector = cv2.FaceDetectorYN.create(
            str(YUNET_PATH), "", (320, 320), score_threshold=0.5, nms_threshold=0.3, top_k=5000
        )
        _recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
        return True
    except Exception as exc:
        print(f"[face_match] Model initialization warning: {exc}")
        return False


def _load_image_rgb(image_path: str) -> Optional[np.ndarray]:
    """Load image from disk, handle EXIF orientation, and return BGR numpy array for OpenCV."""
    try:
        with Image.open(image_path) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            arr = np.array(img)
            # Convert RGB to BGR for OpenCV
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def get_face_encoding(image_path: str) -> Optional[list]:
    """
    Extract 128-dimensional face encoding vector for the primary face in image_path.
    Returns list of floats, or None if no face is detected.
    """
    if not _ensure_models():
        return None

    img = _load_image_rgb(image_path)
    if img is None:
        return None

    h, w, _ = img.shape
    _detector.setInputSize((w, h))
    _, faces = _detector.detect(img)

    if faces is None or len(faces) == 0:
        return None

    # Use first detected face (or largest area)
    aligned = _recognizer.alignCrop(img, faces[0])
    feature = _recognizer.feature(aligned)
    return feature.flatten().tolist()


def _match_with_face_recognition(
    doc_image_path: str,
    live_image_path: Optional[str] = None,
    doc_number: Optional[str] = None,
    threshold: float = 0.60,
) -> dict:
    """Fallback face matching using the face_recognition library (dlib)."""
    try:
        import face_recognition

        doc_img = face_recognition.load_image_file(doc_image_path)
        doc_encs = face_recognition.face_encodings(doc_img)
        if not doc_encs:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "no_face_in_doc",
                "note": "No face detected in document image (face_recognition fallback)",
            }
        doc_enc = doc_encs[0]

        if live_image_path:
            live_img = face_recognition.load_image_file(live_image_path)
            live_encs = face_recognition.face_encodings(live_img)
            if not live_encs:
                return {
                    "matched": None,
                    "distance": None,
                    "threshold": threshold,
                    "match_status": "no_face_in_selfie",
                    "note": "No face detected in selfie capture (face_recognition fallback)",
                }
            live_enc = live_encs[0]
        elif doc_number:
            from db import get_face_encoding_from_db
            db_enc = get_face_encoding_from_db(doc_number)
            if db_enc is not None:
                live_enc = np.array(db_enc, dtype=np.float64)
            else:
                return {
                    "matched": None,
                    "distance": None,
                    "threshold": threshold,
                    "match_status": "no_selfie",
                    "note": "No selfie provided and no face record in database",
                }
        else:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "no_selfie",
                "note": "No selfie provided",
            }

        dist = float(face_recognition.face_distance([live_enc], doc_enc)[0])
        matched = bool(dist <= threshold)

        return {
            "matched": matched,
            "distance": round(dist, 4),
            "threshold": threshold,
            "match_status": "ok",
            "note": f"Face match confirmed via face_recognition (distance: {round(dist, 3)})" if matched else f"Face mismatch via face_recognition (distance: {round(dist, 3)})",
        }
    except Exception as exc:
        return {
            "matched": None,
            "distance": None,
            "threshold": threshold,
            "match_status": "error",
            "note": f"Face match fallback error: {exc}",
        }


def match_faces(
    doc_image_path: str,
    live_image_path: Optional[str] = None,
    doc_number: Optional[str] = None,
    threshold: float = 0.60,
) -> dict:
    """
    Compare the face in the document photo against a live selfie or database record.

    Uses OpenCV's YuNet & SFace models by default, with automatic fallback to
    the face_recognition library if ONNX models fail to initialize.

    Returns:
        matched       bool | None   — True/False, or None if unavailable
        distance      float | None  — Normalized distance (0 = identical, 1 = completely different)
        threshold     float         — Decision threshold (default 0.60, tunable by caller)
        match_status  str           — 'ok', 'no_selfie', 'no_face_in_doc', 'no_face_in_selfie', 'library_unavailable', 'error'
        note          str           — Descriptive status note
    """
    if not _ensure_models():
        try:
            import face_recognition  # type: ignore
            return _match_with_face_recognition(
                doc_image_path=doc_image_path,
                live_image_path=live_image_path,
                doc_number=doc_number,
                threshold=threshold,
            )
        except ImportError:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "library_unavailable",
                "note": "Face recognition models could not be loaded and fallback library is unavailable",
            }

    try:
        from db import get_face_encoding_from_db

        doc_img = _load_image_rgb(doc_image_path)
        if doc_img is None:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "no_face_in_doc",
                "note": "Could not read document image",
            }

        dh, dw, _ = doc_img.shape
        _detector.setInputSize((dw, dh))
        _, doc_faces = _detector.detect(doc_img)

        if doc_faces is None or len(doc_faces) == 0:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "no_face_in_doc",
                "note": "No face detected in document image",
            }

        doc_aligned = _recognizer.alignCrop(doc_img, doc_faces[0])
        doc_feat = _recognizer.feature(doc_aligned)

        live_feat = None

        if live_image_path:
            live_img = _load_image_rgb(live_image_path)
            if live_img is None:
                return {
                    "matched": None,
                    "distance": None,
                    "threshold": threshold,
                    "match_status": "no_face_in_selfie",
                    "note": "Could not read selfie image",
                }

            lh, lw, _ = live_img.shape
            _detector.setInputSize((lw, lh))
            _, live_faces = _detector.detect(live_img)

            if live_faces is None or len(live_faces) == 0:
                return {
                    "matched": None,
                    "distance": None,
                    "threshold": threshold,
                    "match_status": "no_face_in_selfie",
                    "note": "No face detected in selfie capture",
                }

            live_aligned = _recognizer.alignCrop(live_img, live_faces[0])
            live_feat = _recognizer.feature(live_aligned)

        elif doc_number:
            db_enc = get_face_encoding_from_db(doc_number)
            if db_enc is not None:
                live_feat = np.array(db_enc, dtype=np.float32).reshape(1, -1)
            else:
                return {
                    "matched": None,
                    "distance": None,
                    "threshold": threshold,
                    "match_status": "no_selfie",
                    "note": "No selfie provided and no face record in database",
                }
        else:
            return {
                "matched": None,
                "distance": None,
                "threshold": threshold,
                "match_status": "no_selfie",
                "note": "No selfie provided",
            }

        # Match using Cosine Similarity (SFace cosine score is between -1 and 1)
        cosine_sim = float(_recognizer.match(doc_feat, live_feat, cv2.FaceRecognizerSF_FR_COSINE))

        # Map cosine similarity [-1, 1] monotonically to normalized distance [0, 1]:
        # cosine = 1.0 (identical) -> distance = 0.0
        # cosine = 0.363 (standard SFace threshold) -> distance = ~0.467
        # cosine <= -0.363 -> distance = 1.0
        norm_distance = round(max(0.0, min(1.0, (1.0 - cosine_sim) / 1.363)), 4)
        # Decision is determined strictly by the threshold parameter
        matched = bool(norm_distance <= threshold)

        return {
            "matched": matched,
            "distance": norm_distance,
            "threshold": threshold,
            "match_status": "ok",
            "note": f"Face match confirmed (similarity: {round(max(0.0, cosine_sim)*100, 1)}%)" if matched else f"Face mismatch (distance: {norm_distance})",
        }

    except Exception as exc:
        return {
            "matched": None,
            "distance": None,
            "threshold": threshold,
            "match_status": "error",
            "note": f"Face match error: {exc}",
        }
