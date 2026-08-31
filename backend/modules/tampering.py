"""
modules/tampering.py — Document tampering/forgery detection.

Three complementary checks are combined into a single `tampering_score` in [0, 1]:

  1. Error Level Analysis (ELA)
     Re-saves the image at a lower JPEG quality, computes the pixel-level
     difference from the original, and measures the mean absolute deviation.
     Authentic JPEG images re-compress evenly; tampered regions compress
     differently and show elevated error levels.

  2. EXIF / metadata inspection
     Checks for suspicious editing-software tags (Photoshop, GIMP, etc.) and
     missing or inconsistent metadata that shouldn't be present on a camera image.

  3. Block-level noise-variance (Laplacian variance) inconsistency
     Divides the image into blocks and computes local Laplacian variance.
     A tampered block (e.g. pasted text) often has a sharply different noise
     profile from surrounding regions.  High inter-block variance coefficient
     of variation indicates inconsistency.
"""
from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ExifTags, ImageFilter


# ---------------------------------------------------------------------------
# 1. Error Level Analysis
# ---------------------------------------------------------------------------
def compute_ela(image_path: str, quality: int = 90) -> dict:
    """
    Perform Error Level Analysis on `image_path`.

    Key insight: authentic JPEG images have UNIFORM error distribution when
    re-compressed. Tampered regions have LOCALLY ELEVATED error compared to
    the rest of the image — even if the global mean is similar.

    Method:
    - Re-save at quality=90 and compute pixel diff
    - Divide image into 16×16 blocks, compute mean error per block
    - Compute the IQR (interquartile range) of block errors
    - Count blocks with error > Q3 + 2.0 × IQR (high outliers)
    - Fraction of such outlier blocks is the ELA signal

    Returns:
        ela_score    float [0, 1] — higher means more likely tampered
        heatmap_path str  — absolute path to the saved ELA heatmap image
        mean_ela     float — raw mean pixel error (for diagnostics)
        outlier_fraction float — fraction of blocks above IQR fence
    """
    try:
        original = Image.open(image_path).convert("RGB")
        orig_arr = np.array(original, dtype=np.float32)

        # Re-save at target quality and compute per-pixel diff
        buf = io.BytesIO()
        original.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        recomp_arr = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)
        diff = np.abs(orig_arr - recomp_arr)

        mean_ela = float(diff.mean())

        # Vectorized block-level analysis with 16x16 blocks
        block_size = 16
        h, w = diff.shape[:2]
        h_crop = (h // block_size) * block_size
        w_crop = (w // block_size) * block_size

        if h_crop > 0 and w_crop > 0:
            diff_cropped = diff[:h_crop, :w_crop]
            arr_bm = diff_cropped.reshape(
                h_crop // block_size, block_size,
                w_crop // block_size, block_size,
                diff.shape[2]
            ).mean(axis=(1, 3, 4)).flatten()
        else:
            arr_bm = np.array([mean_ela])

        # If overall error is minimal across the entire image (clean authentic image),
        # don't trigger false positive outliers due to flat background collapsing IQR to 0.
        if mean_ela < 1.0:
            ela_score = 0.0
            outlier_count = 0
            outlier_fraction = 0.0
            fence = 5.0
        else:
            q1 = float(np.percentile(arr_bm, 25))
            q3 = float(np.percentile(arr_bm, 75))
            iqr = max(q3 - q1, 2.0)
            # Baseline minimum fence so standard text edges aren't flagged as tampered
            fence = max(q3 + 2.5 * iqr, 8.0)

            # Count outlier blocks and compute fraction
            outlier_count = int(np.sum(arr_bm > fence))
            outlier_fraction = outlier_count / len(arr_bm)

            # Score: calibrated so that isolated genuine tampered sections produce proportional risk score
            ela_score = min(outlier_fraction / 0.08, 1.0)

        # Build and save heatmap (amplified for visibility)
        diff_vis = np.clip(diff * 10, 0, 255).astype(np.uint8)
        heatmap_img = Image.fromarray(diff_vis)
        static_dir = Path("static")
        static_dir.mkdir(exist_ok=True)
        stem = Path(image_path).stem
        heatmap_path = str(static_dir / f"ela_{stem}.jpg")
        heatmap_img.save(heatmap_path, format="JPEG", quality=95)

        return {
            "ela_score":         round(ela_score, 4),
            "mean_ela":          round(mean_ela, 4),
            "outlier_fraction":  round(outlier_fraction, 4),
            "outlier_blocks":    outlier_count,
            "total_blocks":      len(arr_bm),
            "iqr_fence":         round(fence, 4),
            "heatmap_path":      heatmap_path,
        }

    except Exception as exc:
        return {
            "ela_score": 0.0, "mean_ela": 0.0, "outlier_fraction": 0.0,
            "heatmap_path": "", "error": str(exc)
        }


# ---------------------------------------------------------------------------
# 2. EXIF / metadata inspection
# ---------------------------------------------------------------------------
# Known editing software tags (lowercase fragments for substring matching)
_SUSPICIOUS_SOFTWARE = [
    "photoshop", "gimp", "paint", "inkscape", "affinity",
    "snapseed", "lightroom", "pixelmator", "canva", "corel",
    "illustrator", "acrobat",
]

def check_metadata(image_path: str) -> dict:
    """
    Inspect EXIF metadata for evidence of editing software.

    Returns:
        metadata_score  float [0, 1]
        suspicious_tags list of str
        has_exif        bool
    """
    try:
        img = Image.open(image_path)
        exif_data = img._getexif() if hasattr(img, "_getexif") else None

        if not exif_data:
            # No EXIF at all — mildly suspicious (real camera photos have EXIF)
            return {
                "metadata_score":  0.2,
                "suspicious_tags": [],
                "has_exif":        False,
                "note":            "No EXIF data found",
            }

        # Map tag IDs to human-readable names
        tag_map = {v: k for k, v in ExifTags.TAGS.items()}
        human_tags: dict = {}
        for tag_id, value in exif_data.items():
            tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
            human_tags[tag_name] = str(value)

        suspicious: list[str] = []
        for tag_name, value in human_tags.items():
            val_lower = value.lower()
            for sw in _SUSPICIOUS_SOFTWARE:
                if sw in val_lower:
                    suspicious.append(f"{tag_name}={value}")

        # Penalise for each suspicious tag found
        metadata_score = min(len(suspicious) * 0.35, 1.0)

        return {
            "metadata_score":  metadata_score,
            "suspicious_tags": suspicious,
            "has_exif":        True,
        }

    except Exception as exc:
        return {
            "metadata_score":  0.0,
            "suspicious_tags": [],
            "has_exif":        False,
            "error":           str(exc),
        }


# ---------------------------------------------------------------------------
# 3. Block-level noise-variance inconsistency
# ---------------------------------------------------------------------------
def block_noise_check(image_path: str, block_size: int = 64) -> dict:
    """
    Divide the image into `block_size`×`block_size` blocks and measure the
    Laplacian variance (sharpness proxy) of each block.

    Authentic documents have relatively uniform noise across the page.
    Pasted or edited regions often have markedly different noise characteristics.

    Returns:
        noise_score      float [0, 1] — higher = more suspicious
        cv_of_variance   float — coefficient of variation of block variances
        num_outlier_blocks int
    """
    try:
        import cv2  # type: ignore

        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"noise_score": 0.0, "cv_of_variance": 0.0, "num_outlier_blocks": 0, "error": "cv2 could not read image"}

        # Compute Laplacian once across entire image for maximum performance
        lap = cv2.Laplacian(img, cv2.CV_64F)
        h, w = lap.shape
        h_crop = (h // block_size) * block_size
        w_crop = (w // block_size) * block_size

        if h_crop > 0 and w_crop > 0:
            blocks = lap[:h_crop, :w_crop].reshape(
                h_crop // block_size, block_size,
                w_crop // block_size, block_size
            )
            arr = blocks.var(axis=(1, 3)).flatten()
        else:
            arr = np.array([lap.var()])

        if len(arr) < 2:
            return {"noise_score": 0.0, "cv_of_variance": 0.0, "num_outlier_blocks": 0}

        mean_v = arr.mean()
        std_v  = arr.std()
        cv     = std_v / (mean_v + 1e-9)  # coefficient of variation

        # Identify outlier blocks (> 2.5 std from mean)
        outliers = int(np.sum(np.abs(arr - mean_v) > 2.5 * std_v))

        # Normalise CV to [0, 1]: empirically CV>1 is highly suspicious
        noise_score = min(cv / 2.0, 1.0)

        return {
            "noise_score":        noise_score,
            "cv_of_variance":     float(cv),
            "num_outlier_blocks": outliers,
            "num_blocks":         len(arr),
        }

    except ImportError:
        return {"noise_score": 0.0, "cv_of_variance": 0.0, "num_outlier_blocks": 0, "error": "opencv not installed"}
    except Exception as exc:
        return {"noise_score": 0.0, "cv_of_variance": 0.0, "num_outlier_blocks": 0, "error": str(exc)}


# ---------------------------------------------------------------------------
# Heatmap cleanup utility
# ---------------------------------------------------------------------------
def cleanup_old_heatmaps(max_files: int = 50) -> None:
    """Keep only the `max_files` most recently created ELA heatmaps in static/."""
    try:
        static_dir = Path("static")
        if not static_dir.exists():
            return
        heatmaps = sorted(static_dir.glob("ela_*.jpg"), key=os.path.getmtime)
        if len(heatmaps) > max_files:
            for old_file in heatmaps[:-max_files]:
                try:
                    old_file.unlink()
                except OSError:
                    pass
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Combined runner
# ---------------------------------------------------------------------------
def run_tampering_checks(image_path: str) -> dict:
    """
    Run all three tampering checks and return a combined `tampering_score` in [0, 1].

    Weights:
      ELA             0.45  (primary signal for JPEG forgeries)
      Metadata        0.25  (corroborating evidence)
      Noise variance  0.30  (catches paste/splice artefacts)

    Also returns the raw sub-scores and the heatmap path.
    """
    cleanup_old_heatmaps()

    ela      = compute_ela(image_path)
    metadata = check_metadata(image_path)
    noise    = block_noise_check(image_path)

    ela_score      = ela.get("ela_score",      0.0)
    metadata_score = metadata.get("metadata_score", 0.0)
    noise_score    = noise.get("noise_score",   0.0)

    # Weighted aggregate
    tampering_score = (
        0.45 * ela_score
        + 0.25 * metadata_score
        + 0.30 * noise_score
    )
    tampering_score = round(min(tampering_score, 1.0), 4)

    return {
        "tampering_score":     tampering_score,
        "ela_score":           round(ela_score, 4),
        "metadata_score":      round(metadata_score, 4),
        "noise_score":         round(noise_score, 4),
        "suspicious_tags":     metadata.get("suspicious_tags", []),
        "num_outlier_blocks":  noise.get("num_outlier_blocks", 0),
        "heatmap_path":        ela.get("heatmap_path", ""),
        "mean_ela":            ela.get("mean_ela", 0.0),
        "ela_outlier_fraction": ela.get("outlier_fraction", 0.0),
        "cv_of_variance":      noise.get("cv_of_variance", 0.0),
    }

