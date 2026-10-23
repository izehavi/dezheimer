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
        CREATE TABLE IF NOT EXISTS subscriptions (
            endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
            created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, created REAL NOT NULL, lat REAL NOT NULL,
            lon REAL NOT NULL, accuracy REAL, street TEXT, title TEXT, place TEXT, start REAL, times INTEGER);
        CREATE TABLE IF NOT EXISTS routines (
            person_id INTEGER PRIMARY KEY, name TEXT NOT NULL, tasks TEXT NOT NULL, zone TEXT, offset INTEGER,
            updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS done (
            person_id INTEGER NOT NULL, task_id TEXT NOT NULL, day TEXT NOT NULL, at REAL NOT NULL, how TEXT,
            PRIMARY KEY (person_id, task_id, day));
        CREATE TABLE IF NOT EXISTS sent (
            person_id INTEGER NOT NULL, task_id TEXT NOT NULL, day TEXT NOT NULL, what TEXT NOT NULL,
            PRIMARY KEY (person_id, task_id, day, what));
        CREATE TABLE IF NOT EXISTS presence (user_id INTEGER PRIMARY KEY, at REAL NOT NULL);
    """)
    # Columns added after the tables were first made: the language of a phone, of a routine.
    for table in ("subscriptions", "routines"):
        if "lang" not in {row[1] for row in db.execute(f"PRAGMA table_info({table})")}:
            db.execute(f"ALTER TABLE {table} ADD COLUMN lang TEXT")
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


# ---- Alerts: the person seems lost, and the relatives are told ----

ALERTS_SHOWN_SECONDS = 24 * 3600


def subscribe(user_id, endpoint, p256dh, auth, lang="en"):
    """Keep where to send notifications to this user's phone (push.py), and in which language."""
    with _db() as db:
        db.execute(
            "INSERT INTO subscriptions (endpoint, user_id, p256dh, auth, created, lang) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, "
            "auth = excluded.auth, lang = excluded.lang",
            (endpoint, user_id, p256dh, auth, time.time(), lang),
        )


def subscriptions(user_id):
    with _db() as db:
        rows = db.execute("SELECT endpoint, p256dh, auth, lang FROM subscriptions WHERE user_id = ?", (user_id,)).fetchall()
    return [{"endpoint": e, "p256dh": k, "auth": a, "lang": lang or "en"} for e, k, a, lang in rows]


def unsubscribe(endpoint):
    with _db() as db:
        db.execute("DELETE FROM subscriptions WHERE endpoint = ?", (endpoint,))


def add_alert(person_id, alert):
    """Keep an alert: where the person is, and where they were going."""
    with _db() as db:
        cursor = db.execute(
            "INSERT INTO alerts (person_id, created, lat, lon, accuracy, street, title, place, start, times) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (person_id, time.time(), alert["lat"], alert["lon"], alert.get("accuracy"), alert.get("street"),
             alert.get("title"), alert.get("place"), alert.get("start"), alert.get("times")),
        )
    return cursor.lastrowid


def alerts_for(helper_id):
    """The alerts of the last day about the people this relative helps, the latest first."""
    with _db() as db:
        rows = db.execute(
            "SELECT a.id, a.person_id, l.person_name, a.created, a.lat, a.lon, a.accuracy, a.street, a.title, "
            "a.place, a.start, a.times FROM alerts a JOIN links l ON l.person_id = a.person_id "
            "WHERE l.helper_id = ? AND a.created >= ? ORDER BY a.created DESC",
            (helper_id, time.time() - ALERTS_SHOWN_SECONDS),
        ).fetchall()
    keys = ("id", "person_id", "name", "created", "lat", "lon", "accuracy", "street", "title", "place", "start", "times")
    return [dict(zip(keys, row)) for row in rows]


def person_name(person_id):
    """The name the person gave their relatives, or None when nobody is linked."""
    with _db() as db:
        row = db.execute("SELECT person_name FROM links WHERE person_id = ? ORDER BY created DESC LIMIT 1",
                         (person_id,)).fetchone()
    return row[0] if row else None


# ---- The things to do every day (routine.py) ----

KEEP_DAYS = 8


def set_routine(person_id, name, tasks, zone, offset, done, days, lang="en"):
    """Keep the person's things to do each day, and what was done on `days` ("YYYY-MM-DD").

    `done`: [{"task_id", "day", "at" (milliseconds since 1970), "how"}]. What is kept for
    those days is replaced, so that "not done" on the phone is "not done" here too.
    """
    with _db() as db:
        db.execute(
            "INSERT INTO routines (person_id, name, tasks, zone, offset, updated, lang) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(person_id) DO UPDATE SET name = excluded.name, tasks = excluded.tasks, zone = excluded.zone, "
            "offset = excluded.offset, updated = excluded.updated, lang = excluded.lang",
            (person_id, name, json.dumps(tasks), zone, offset, time.time(), lang),
        )
        for day in days:
            db.execute("DELETE FROM done WHERE person_id = ? AND day = ?", (person_id, day))
        db.executemany(
            "INSERT OR REPLACE INTO done VALUES (?, ?, ?, ?, ?)",
            [(person_id, d["task_id"], d["day"], d["at"], d.get("how")) for d in done if d["day"] in days],
        )
        # Only the last week is kept.
        oldest = time.strftime("%Y-%m-%d", time.localtime(time.time() - KEEP_DAYS * 86400))
        db.execute("DELETE FROM done WHERE person_id = ? AND day < ?", (person_id, oldest))
        db.execute("DELETE FROM sent WHERE person_id = ? AND day < ?", (person_id, oldest))


def routines():
    with _db() as db:
        rows = db.execute("SELECT person_id, name, tasks, zone, offset, lang FROM routines").fetchall()
    return [{"id": i, "name": n, "tasks": json.loads(t), "zone": z, "offset": o, "lang": lang or "en"}
            for i, n, t, z, o, lang in rows]


def routine_of(person_id):
    return next((r for r in routines() if r["id"] == person_id), None)


def done_on(person_id, day):
    """{task id: {"at", "how"}} for what was done on that day."""
    with _db() as db:
        rows = db.execute("SELECT task_id, at, how FROM done WHERE person_id = ? AND day = ?", (person_id, day)).fetchall()
    return {t: {"at": a, "how": h} for t, a, h in rows}


def sent_on(person_id, day):
    with _db() as db:
        rows = db.execute("SELECT task_id, what FROM sent WHERE person_id = ? AND day = ?", (person_id, day)).fetchall()
    return set(rows)


def claim(person_id, task_id, day, what):
    """Note that a reminder is sent. False when it already was."""
    with _db() as db:
        cursor = db.execute("INSERT OR IGNORE INTO sent VALUES (?, ?, ?, ?)", (person_id, task_id, day, what))
    return cursor.rowcount == 1


def seen(user_id):
    """The app of this user is open and showing."""
    with _db() as db:
        db.execute("INSERT OR REPLACE INTO presence VALUES (?, ?)", (user_id, time.time()))


def seen_within(user_id, seconds):
    with _db() as db:
        row = db.execute("SELECT at FROM presence WHERE user_id = ?", (user_id,)).fetchone()
    return bool(row) and time.time() - row[0] < seconds
