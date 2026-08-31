"""
db.py — SQLite mock database for document screening.

Tables:
  documents   — doc_number, status (valid/expired/blacklisted), expiry_date
  known_faces — doc_number, name, face_encoding (JSON serialized list)

The DB is auto-seeded on first import so the server always starts with test data.
"""
import json
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path("doc_screening.db")


# ---------------------------------------------------------------------------
# Schema + seeding
# ---------------------------------------------------------------------------
_CREATE_DOCUMENTS = """
CREATE TABLE IF NOT EXISTS documents (
    doc_number  TEXT PRIMARY KEY,
    status      TEXT NOT NULL CHECK(status IN ('valid', 'expired', 'blacklisted')),
    expiry_date TEXT NOT NULL
);
"""

_CREATE_KNOWN_FACES = """
CREATE TABLE IF NOT EXISTS known_faces (
    doc_number    TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    face_encoding TEXT
);
"""

_SEED_DOCUMENTS = [
    ("IND1234567", "valid",       "2030-12-31"),
    ("IND9999999", "expired",     "2020-01-01"),
    ("IND0000001", "blacklisted", "2028-06-15"),
]


def get_connection() -> sqlite3.Connection:
    """Return a connection to the SQLite database."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables and seed them if they don't already contain data."""
    with get_connection() as conn:
        conn.execute(_CREATE_DOCUMENTS)
        conn.execute(_CREATE_KNOWN_FACES)

        # Seed only if the table is empty
        existing = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        if existing == 0:
            conn.executemany(
                "INSERT OR IGNORE INTO documents (doc_number, status, expiry_date) VALUES (?, ?, ?)",
                _SEED_DOCUMENTS,
            )
            conn.commit()


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------
def check_document_status(doc_number: str) -> dict:
    """
    Look up a document number in the mock DB.

    Returns a dict with:
      found       bool
      doc_number  str
      status      'valid' | 'expired' | 'blacklisted' | 'not_found'
      expiry_date str | None
    """
    clean_doc = (doc_number or "").strip().upper()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT doc_number, status, expiry_date FROM documents WHERE UPPER(doc_number) = ?",
            (clean_doc,),
        ).fetchone()

    if row is None:
        return {
            "found": False,
            "doc_number": clean_doc,
            "status": "not_found",
            "expiry_date": None,
        }

    return {
        "found": True,
        "doc_number": row["doc_number"],
        "status": row["status"],
        "expiry_date": row["expiry_date"],
    }


def store_face_encoding(doc_number: str, name: str, encoding) -> None:
    """Serialize and store a face encoding (list or numpy array) for a document safely as JSON."""
    clean_doc = (doc_number or "").strip().upper()
    if hasattr(encoding, "tolist"):
        encoding = encoding.tolist()
    json_data = json.dumps(encoding)
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO known_faces (doc_number, name, face_encoding) VALUES (?, ?, ?)",
            (clean_doc, name, json_data),
        )
        conn.commit()


def get_face_encoding_from_db(doc_number: str) -> Optional[list]:
    """Retrieve and deserialize the face encoding list for a document number safely from JSON."""
    clean_doc = (doc_number or "").strip().upper()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT face_encoding FROM known_faces WHERE UPPER(doc_number) = ?",
            (clean_doc,),
        ).fetchone()

    if row is None or row["face_encoding"] is None:
        return None
    try:
        return json.loads(row["face_encoding"])
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Auto-initialise on import
# ---------------------------------------------------------------------------
init_db()

