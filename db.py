"""
db.py - the "memory" of SafeCircle.

Everything that touches the SQLite database lives here, so the rest of the
app never has to write SQL. The database is a single file (safecircle.db)
that sits next to this script. Nothing is sent over the internet.
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

# Where the database file lives. Tests change this to a temporary file.
DB_PATH = Path(__file__).parent / "safecircle.db"

# One text format for every timestamp we store, e.g. "2026-10-16 09:12:00".
TS_FORMAT = "%Y-%m-%d %H:%M:%S"

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),   -- only ever one row
    user_name           TEXT    NOT NULL DEFAULT 'Friend',
    checkin_time        TEXT    NOT NULL DEFAULT '09:00',     -- "HH:MM"
    paused              INTEGER NOT NULL DEFAULT 0,           -- 0 = active, 1 = paused
    grace_minutes       INTEGER NOT NULL DEFAULT 30,
    prompt_gap_minutes  INTEGER NOT NULL DEFAULT 15,
    next_action         TEXT    NOT NULL DEFAULT 'notify_contacts',
    demo_offset_minutes INTEGER NOT NULL DEFAULT 0,           -- demo clock shift
    cycle_date          TEXT,                                 -- which day we are tracking
    escalation_stage    INTEGER NOT NULL DEFAULT 0,           -- 0..4, see logic.py
    skip_date           TEXT                                  -- day with no required check-in
);

CREATE TABLE IF NOT EXISTS contacts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    method                TEXT    NOT NULL DEFAULT '',        -- optional, typed by the user
    include_in_escalation INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checkins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    checkin_date TEXT NOT NULL UNIQUE,   -- UNIQUE = at most one check-in per day
    checked_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    kind    TEXT NOT NULL,
    message TEXT NOT NULL
);
"""

# Only these settings columns may be changed through update_settings().
SETTINGS_FIELDS = {
    "user_name", "checkin_time", "paused", "grace_minutes", "prompt_gap_minutes",
    "next_action", "demo_offset_minutes", "cycle_date", "escalation_stage", "skip_date",
}


@contextmanager
def connect():
    """Open the database, save changes if all went well, undo them if not."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create the tables (if missing) and make sure the settings row exists."""
    with connect() as conn:
        conn.executescript(SCHEMA)
        ensure_settings(conn)


def ensure_settings(conn):
    conn.execute("INSERT OR IGNORE INTO settings (id) VALUES (1)")


# ---------------------------------------------------------------- settings
def get_settings(conn):
    row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    return dict(row)


def update_settings(conn, **fields):
    if not fields:
        return
    unknown = set(fields) - SETTINGS_FIELDS
    if unknown:
        raise ValueError(f"Unknown settings: {sorted(unknown)}")
    assignments = ", ".join(f"{name} = ?" for name in fields)
    conn.execute(f"UPDATE settings SET {assignments} WHERE id = 1", list(fields.values()))


# ---------------------------------------------------------------- contacts
def list_contacts(conn):
    rows = conn.execute("SELECT * FROM contacts ORDER BY LOWER(name)").fetchall()
    return [dict(r) for r in rows]


def get_contact(conn, contact_id):
    row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    return dict(row) if row else None


def find_contact_by_name(conn, name, exclude_id=None):
    rows = conn.execute(
        "SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)", (name,)
    ).fetchall()
    for row in rows:
        if exclude_id is None or row["id"] != exclude_id:
            return dict(row)
    return None


def insert_contact(conn, name, method, include):
    cur = conn.execute(
        "INSERT INTO contacts (name, method, include_in_escalation) VALUES (?, ?, ?)",
        (name, method, 1 if include else 0),
    )
    return cur.lastrowid


def update_contact(conn, contact_id, name, method, include):
    conn.execute(
        "UPDATE contacts SET name = ?, method = ?, include_in_escalation = ? WHERE id = ?",
        (name, method, 1 if include else 0, contact_id),
    )


def delete_contact(conn, contact_id):
    cur = conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    return cur.rowcount == 1


# ---------------------------------------------------------------- check-ins
def insert_checkin(conn, date_str, ts):
    """Save a check-in. Returns False (and saves nothing) if that day already has one."""
    cur = conn.execute(
        "INSERT OR IGNORE INTO checkins (checkin_date, checked_at) VALUES (?, ?)",
        (date_str, ts),
    )
    return cur.rowcount == 1


def get_checkin_for_date(conn, date_str):
    row = conn.execute(
        "SELECT * FROM checkins WHERE checkin_date = ?", (date_str,)
    ).fetchone()
    return dict(row) if row else None


def get_last_checkin(conn):
    row = conn.execute(
        "SELECT * FROM checkins ORDER BY checkin_date DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def delete_checkin_for_date(conn, date_str):
    cur = conn.execute("DELETE FROM checkins WHERE checkin_date = ?", (date_str,))
    return cur.rowcount == 1


# ---------------------------------------------------------------- activity
def log_activity(conn, ts, kind, message):
    conn.execute(
        "INSERT INTO activity (ts, kind, message) VALUES (?, ?, ?)", (ts, kind, message)
    )


def get_activity(conn, limit=200):
    """Newest first. We sort by id (not time) because the demo clock can jump around."""
    rows = conn.execute(
        "SELECT * FROM activity ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- wipe
def wipe_all(conn):
    """Delete everything, then recreate the single default settings row."""
    for table in ("activity", "checkins", "contacts", "settings"):
        conn.execute(f"DELETE FROM {table}")
    ensure_settings(conn)
