"""Accounts: sign in with an email and a password, and keep a backup of what the user added.

The backup lets the user get their data back on another device, or after losing one.
Everything is in one SQLite file, kept outside the project folder.

Passwords are never stored: only a salted scrypt hash. A sign-in gives the device a
random token; the database keeps only the hash of that token.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(os.environ.get("DEZHEIMER_DATA_DIR", Path.home() / ".dezheimer"))
MIN_PASSWORD = 8
MAX_DOC_BYTES = 2_000_000


class AccountError(Exception):
    """A problem to tell the user about."""


class Conflict(Exception):
    """The backup changed on another device since this one last read it."""

    def __init__(self, current):
        self.current = current


@contextmanager
def _db():
    """The database, in a transaction: committed at the end, or rolled back on an error, then closed."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA_DIR / "accounts.db")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL,
            created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS backups (
            user_id INTEGER PRIMARY KEY, doc TEXT NOT NULL, version INTEGER NOT NULL, updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS invites (
            code TEXT PRIMARY KEY, person_id INTEGER NOT NULL, person_name TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS links (
            person_id INTEGER NOT NULL, helper_id INTEGER NOT NULL, person_name TEXT NOT NULL,
            helper_name TEXT NOT NULL, created REAL NOT NULL, PRIMARY KEY (person_id, helper_id));
    """)
    try:
        with db:
            yield db
    finally:
        db.close()


def _hash_password(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _open_session(db, user_id, email):
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (_hash_token(token), user_id, time.time()))
    return {"token": token, "email": email}


def sign_up(email, password):
    email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise AccountError("This does not look like an email address.")
    if len(password) < MIN_PASSWORD:
        raise AccountError(f"The password needs at least {MIN_PASSWORD} characters.")
    salt = secrets.token_bytes(16)
    with _db() as db:
        try:
            cursor = db.execute(
                "INSERT INTO users (email, salt, hash, created) VALUES (?, ?, ?, ?)",
                (email, salt, _hash_password(password, salt), time.time()),
            )
        except sqlite3.IntegrityError:
            raise AccountError("There is already an account with this email. Sign in instead.")
        return _open_session(db, cursor.lastrowid, email)


def sign_in(email, password):
    email = email.strip().lower()
    with _db() as db:
        row = db.execute("SELECT id, salt, hash FROM users WHERE email = ?", (email,)).fetchone()
        # The same message whether the email or the password is wrong, so that nobody
        # can find out which emails have an account.
        if not row or not hmac.compare_digest(row[2], _hash_password(password, row[1])):
            raise AccountError("The email or the password is not right.")
        return _open_session(db, row[0], email)


def sign_out(token):
    with _db() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))


def user_for(token):
    """The id of the signed-in user, or None."""
    if not token:
        return None
    with _db() as db:
        row = db.execute("SELECT user_id FROM sessions WHERE token_hash = ?", (_hash_token(token),)).fetchone()
    return row[0] if row else None


def load(user_id):
    with _db() as db:
        row = db.execute("SELECT doc, version, updated FROM backups WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return {"doc": None, "version": 0, "updated": None}
    return {"doc": json.loads(row[0]), "version": row[1], "updated": row[2]}


def save(user_id, doc, base_version):
    """Save the backup. Raises Conflict when another device saved since `base_version`."""
    text = json.dumps(doc)
    if len(text.encode()) > MAX_DOC_BYTES:
        raise AccountError("The backup is too large.")
    with _db() as db:
        row = db.execute("SELECT doc, version, updated FROM backups WHERE user_id = ?", (user_id,)).fetchone()
        version = row[1] if row else 0
        if base_version != version:
            raise Conflict({"doc": json.loads(row[0]), "version": version, "updated": row[2]})
        now = time.time()
        db.execute(
            "INSERT INTO backups VALUES (?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, version = excluded.version, updated = excluded.updated",
            (user_id, text, version + 1, now),
        )
    return {"version": version + 1, "updated": now}


# ---- Links between the person with memory loss and the relatives who help them ----
#
# The person's app shows a code; a relative types it in their own app, and the two
# accounts are linked. A link says who is told when the person needs help.

INVITE_SECONDS = 30 * 60
MAX_WRONG_CODES = 10          # per relative and per hour, so that a code cannot be guessed
MAX_NAME = 40
_wrong_codes = {}             # helper id -> times of the wrong codes of the last hour


def _name(name):
    name = " ".join(str(name or "").split())[:MAX_NAME]
    if not name:
        raise AccountError("Please give a name.")
    return name


def invite(person_id, person_name):
    """A code of 6 digits that a relative types to be linked to this person, valid 30 minutes."""
    person_name = _name(person_name)
    now = time.time()
    with _db() as db:
        db.execute("DELETE FROM invites WHERE person_id = ? OR expires < ?", (person_id, now))
        while True:
            code = f"{secrets.randbelow(10**6):06d}"
            if not db.execute("SELECT 1 FROM invites WHERE code = ?", (code,)).fetchone():
                break
        db.execute("INSERT INTO invites VALUES (?, ?, ?, ?)", (code, person_id, person_name, now + INVITE_SECONDS))
    return {"code": code, "expires": now + INVITE_SECONDS}


def join(helper_id, code, helper_name):
    """Link the relative `helper_id` to the person whose code this is. Returns the person."""
    helper_name = _name(helper_name)
    now = time.time()
    tries = [t for t in _wrong_codes.get(helper_id, []) if now - t < 3600]
    if len(tries) >= MAX_WRONG_CODES:
        raise AccountError("Too many wrong codes. Try again in an hour.")
    code = re.sub(r"\D", "", str(code))
    with _db() as db:
        row = db.execute("SELECT person_id, person_name FROM invites WHERE code = ? AND expires >= ?",
                         (code, now)).fetchone()
        if not row:
            _wrong_codes[helper_id] = [*tries, now]
            raise AccountError("This code is not right, or it is too old. Ask for a new one.")
        person_id, person_name = row
        if person_id == helper_id:
            raise AccountError("This is the code of your own account. Type it on the phone of the relative.")
        db.execute("DELETE FROM invites WHERE code = ?", (code,))
        db.execute(
            "INSERT INTO links VALUES (?, ?, ?, ?, ?) ON CONFLICT(person_id, helper_id) "
            "DO UPDATE SET person_name = excluded.person_name, helper_name = excluded.helper_name",
            (person_id, helper_id, person_name, helper_name, now),
        )
    return {"id": person_id, "name": person_name}


def links(user_id):
    """The relatives who help this user, and the people this user helps."""
    with _db() as db:
        helpers = db.execute("SELECT helper_id, helper_name FROM links WHERE person_id = ? ORDER BY created",
                             (user_id,)).fetchall()
        people = db.execute("SELECT person_id, person_name FROM links WHERE helper_id = ? ORDER BY created",
                            (user_id,)).fetchall()
    return {
        "helpers": [{"id": i, "name": n} for i, n in helpers],
        "people": [{"id": i, "name": n} for i, n in people],
    }


def unlink(user_id, other_id):
    """Remove the link between this user and another, whichever of the two helps."""
    with _db() as db:
        db.execute("DELETE FROM links WHERE (person_id = ? AND helper_id = ?) OR (person_id = ? AND helper_id = ?)",
                   (user_id, other_id, other_id, user_id))
