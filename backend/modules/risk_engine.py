"""
modules/risk_engine.py — Weighted risk scoring for document screening.

Combines:
  - Validation result  (weight 0.25)
  - Tampering score    (weight 0.35)
  - Face match score   (weight 0.25)
  - Blacklist flag     (weight 0.15, and forces HIGH band regardless of numeric)

Numeric score is in [0, 1] (higher = riskier).
Band is one of: LOW / MEDIUM / HIGH
"""
from __future__ import annotations

from typing import Optional


# Band thresholds (inclusive upper bound)
_BANDS = [
    (0.35, "LOW"),
    (0.65, "MEDIUM"),
    (1.00, "HIGH"),
]


from datetime import datetime, date


def _check_is_expired(expiry_str: Optional[str]) -> bool:
    """Parse expiry string (YYYY-MM-DD or YYMMDD) and return True if expired."""
    if not expiry_str:
        return False
    s = expiry_str.replace("-", "").strip()
    try:
        if len(s) == 8:  # YYYYMMDD
            exp_date = datetime.strptime(s, "%Y%m%d").date()
        elif len(s) == 6:  # YYMMDD (MRZ standard format)
            # Assume 20xx for YY <= 50, else 19xx
            year = 2000 + int(s[:2]) if int(s[:2]) <= 50 else 1900 + int(s[:2])
            exp_date = date(year, int(s[2:4]), int(s[4:6]))
        else:
            return False
        return exp_date < date.today()
    except ValueError:
        return False


def _validation_to_score(validation_result: dict, expiry_override: Optional[str] = None) -> float:
    """Convert a validation result dict to a risk sub-score in [0, 1]."""
    status = validation_result.get("status", "not_found")
    expiry_date = validation_result.get("expiry_date") or expiry_override
    if status == "valid" and _check_is_expired(expiry_date):
        status = "expired"

    mapping = {
        "valid":       0.0,
        "not_found":   0.5,
        "expired":     0.7,
        "blacklisted": 1.0,
    }
    return mapping.get(status, 0.5)


def _face_distance_to_score(distance: Optional[float], match_status: str = "") -> float:
    """
    Convert a face verification result to a risk sub-score [0, 1].

    match_status context:
      "ok"                  → use distance calculation (0 = perfect, 1 = no match)
      "no_selfie"           → 0.5 neutral (officer chose not to capture selfie)
      "library_unavailable" → 0.85 HIGH — cannot verify = unacceptable at border checkpoint
      "error"               → 0.85 HIGH — same reasoning
      "no_face_in_doc"      → 0.75 HIGH — document should have a face photo
      "no_face_in_selfie"   → 0.75 HIGH — selfie was provided but unusable
      (unknown/empty)       → 0.5 neutral fallback
    """
    _STATUS_SCORES: dict = {
        "no_selfie":           0.5,
        "library_unavailable": 0.85,
        "error":               0.85,
        "no_face_in_doc":      0.75,
        "no_face_in_selfie":   0.75,
    }
    if match_status and match_status != "ok":
        return _STATUS_SCORES.get(match_status, 0.5)

    if distance is None:
        return 0.5  # legacy fallback — no status provided
    # Normalise so that distance=0 → 0, distance=0.6 → ~0.83, distance≥1.0 → 1.0
    return min(distance / 0.7, 1.0)


def compute_risk(
    validation_result: dict,
    tampering_score: float,
    face_score: Optional[float],
    blacklist_flag: bool,
    face_match_status: str = "",
) -> dict:
    """
    Compute a combined risk score and band.

    Parameters
    ----------
    validation_result   : dict   — from modules.validation.validate_document()
    tampering_score     : float  — from modules.tampering.run_tampering_checks()
    face_score          : float | None — Euclidean face distance; None if unavailable
    blacklist_flag      : bool   — True if the document is blacklisted
    face_match_status   : str    — match_status from face_match.match_faces()

    Returns
    -------
    dict with:
        score      float  — weighted risk score [0, 1]
        band       str    — "LOW" | "MEDIUM" | "HIGH"
        breakdown  dict   — per-component sub-scores and weights
        forced_high bool  — True if blacklist forced the HIGH band
    """
    v_score  = _validation_to_score(validation_result)
    t_score  = float(min(max(tampering_score, 0.0), 1.0))
    f_score  = _face_distance_to_score(face_score, match_status=face_match_status)

    weighted_score = (
        0.25 * v_score
        + 0.35 * t_score
        + 0.25 * f_score
        + 0.15 * float(blacklist_flag)
    )
    weighted_score = round(min(weighted_score, 1.0), 4)

    # Determine band
    forced_high = blacklist_flag
    if forced_high:
        band = "HIGH"
    else:
        band = "HIGH"  # default fallback
        for threshold, label in _BANDS:
            if weighted_score <= threshold:
                band = label
                break

    return {
        "score":       weighted_score,
        "band":        band,
        "forced_high": forced_high,
        "breakdown": {
            "validation": {
                "sub_score": round(v_score, 4),
                "weight":    0.25,
                "weighted":  round(0.25 * v_score, 4),
                "status":    validation_result.get("status", "unknown"),
            },
            "tampering": {
                "sub_score": round(t_score, 4),
                "weight":    0.35,
                "weighted":  round(0.35 * t_score, 4),
            },
            "face": {
                "sub_score":  round(f_score, 4),
                "weight":     0.25,
                "weighted":   round(0.25 * f_score, 4),
                "distance":   face_score,
            },
            "blacklist": {
                "sub_score": 1.0 if blacklist_flag else 0.0,
                "weight":    0.15,
                "weighted":  round(0.15 * float(blacklist_flag), 4),
                "flag":      blacklist_flag,
            },
        },
    }
