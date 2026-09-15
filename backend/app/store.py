"""SQLite persistence.

Deliberately boring: two tables, no ORM, no migrations. A hackathon does not
need Alembic, and a corrupted demo database at 3 a.m. is fixed by deleting the
file.
"""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).resolve().parent.parent / "spoon.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id     TEXT    NOT NULL,
    label         TEXT,
    started_at    TEXT    NOT NULL,
    ended_at      TEXT,
    serving_ml    REAL    NOT NULL DEFAULT 240.0,
    -- Filled in when the session closes, from trustworthy samples only.
    salinity_g_l  REAL,
    salt_pct      REAL,
    sodium_mg     REAL,
    temp_c        REAL,
    sample_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS samples (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    received_at  TEXT    NOT NULL,
    payload      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_session ON samples(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def start_session(device_id: str, serving_ml: float, label: Optional[str] = None) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO sessions (device_id, label, started_at, serving_ml) VALUES (?, ?, ?, ?)",
            (device_id, label, utcnow(), serving_ml),
        )
        return int(cur.lastrowid)


def end_session(session_id: int, summary: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            """UPDATE sessions
                  SET ended_at = ?, salinity_g_l = ?, salt_pct = ?,
                      sodium_mg = ?, temp_c = ?, sample_count = ?
                WHERE id = ?""",
            (
                utcnow(),
                summary.get("salinity_g_l"),
                summary.get("salt_pct"),
                summary.get("sodium_mg"),
                summary.get("temp_c"),
                summary.get("sample_count", 0),
                session_id,
            ),
        )


def insert_sample(session_id: Optional[int], payload: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO samples (session_id, received_at, payload) VALUES (?, ?, ?)",
            (session_id, utcnow(), json.dumps(payload)),
        )


def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_session(session_id: int) -> Optional[dict[str, Any]]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return dict(row) if row else None


def get_session_samples(session_id: int) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT received_at, payload FROM samples WHERE session_id = ? ORDER BY id",
            (session_id,),
        ).fetchall()
        return [{"received_at": r["received_at"], **json.loads(r["payload"])} for r in rows]


def sodium_since(iso_timestamp: str) -> dict[str, Any]:
    """Total sodium from completed sessions since a timestamp."""
    with connect() as conn:
        row = conn.execute(
            """SELECT COALESCE(SUM(sodium_mg), 0) AS total, COUNT(*) AS n
                 FROM sessions
                WHERE ended_at IS NOT NULL AND sodium_mg IS NOT NULL
                  AND started_at >= ?""",
            (iso_timestamp,),
        ).fetchone()
        return {"total_sodium_mg": row["total"], "session_count": row["n"]}
