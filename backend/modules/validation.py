"""
modules/validation.py — Document validation against the mock SQLite database.
"""
from __future__ import annotations


def validate_document(doc_number: str) -> dict:
    """
    Look up `doc_number` in the mock database and return a structured result.

    Returns a dict with:
        doc_number  str
        found       bool
        status      'valid' | 'expired' | 'blacklisted' | 'not_found'
        expiry_date str | None
        is_valid    bool  — True only when status == 'valid'
        message     str   — human-readable summary
    """
    from db import check_document_status

    result = check_document_status(doc_number)

    status   = result["status"]
    is_valid = status == "valid"

    messages = {
        "valid":       "Document is valid.",
        "expired":     "Document has expired.",
        "blacklisted": "Document is blacklisted — immediate flag.",
        "not_found":   "Document number not found in registry.",
    }

    return {
        "doc_number":  result["doc_number"],
        "found":       result["found"],
        "status":      status,
        "expiry_date": result["expiry_date"],
        "is_valid":    is_valid,
        "message":     messages.get(status, "Unknown status."),
    }
