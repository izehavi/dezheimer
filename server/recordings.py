"""Recordings of the user's own requests, kept to measure the speech model.

Nothing is kept unless the user switched on "keep the sound of my voice" in the app.
Each phrase said to the assistant is then saved as a sound file, with what the speech
model heard and the vocabulary it was given. The pieces of a text the user read aloud
(server/readings.py) are kept here too, with their exact words. `python -m server.measure`
and `python -m server.dataset` use them.

They are kept with the accounts, outside the project folder, and never leave this computer.
"""

import datetime as dt
import json
import re
import secrets
import wave
from pathlib import Path

import numpy as np

from .accounts import DATA_DIR

RECORDINGS_DIR = Path(DATA_DIR) / "recordings"


def keep(audio: np.ndarray, sample_rate: int, heard: str, vocabulary: str, model: str, said: str | None = None) -> str:
    """Save one phrase, and return its name.

    `said` is given when the phrase is a piece of a text read aloud: its exact words are known.
    """
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    while True:
        name = f"{dt.datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
        if not (RECORDINGS_DIR / f"{name}.wav").exists():   # many are kept in the same second
            break
    with wave.open(str(RECORDINGS_DIR / f"{name}.wav"), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(sample_rate)
        file.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    write_note(name, {
        "heard": heard, "said": said, "vocabulary": vocabulary, "model": model,
        # Where the words in "said" come from: read aloud, or (later) written by the tester.
        "source": "read" if said else "assistant",
    })
    return name


NAME = re.compile(r"\d{8}-\d{6}-[0-9a-f]{4}")


def summary() -> dict:
    """How much is kept: the phrases, how many were read aloud, and the minutes of sound."""
    phrases = read_aloud = 0
    seconds = 0.0
    for path in RECORDINGS_DIR.glob("*.wav"):
        phrases += 1
        try:
            with wave.open(str(path), "rb") as file:
                seconds += file.getnframes() / file.getframerate()
            read_aloud += json.loads(path.with_suffix(".json").read_text(encoding="utf-8")).get("source") == "read"
        except (OSError, ValueError, wave.Error):
            pass
    return {"phrases": phrases, "read": read_aloud, "minutes": round(seconds / 60, 1)}


def write_note(name: str, note: dict) -> None:
    (RECORDINGS_DIR / f"{name}.json").write_text(json.dumps(note, ensure_ascii=False, indent=1), encoding="utf-8")


def update(name: str, **fields) -> None:
    """Change or add something in what is known about a kept phrase."""
    path = RECORDINGS_DIR / f"{name}.json"
    try:
        note = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        note = {}
    write_note(name, {**note, **fields})


def all_recordings() -> list[dict]:
    """Every kept phrase, oldest first: {"name", "path", "heard", "said", "source", "vocabulary", "model"}.

    "said" is what was really said: the sentence read aloud, or what the tester wrote
    (None until then). "source" tells which: "read", "corrected", or "assistant" when
    nobody checked. "auto" is there when a large model wrote the phrase down (server/dataset.py).
    """
    found = []
    for path in sorted(RECORDINGS_DIR.glob("*.wav")):
        try:
            note = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            note = {}
        found.append({
            "heard": "", "said": None, "vocabulary": "", "model": "", "source": "assistant",
            **note, "name": path.stem, "path": path,
        })
    return found


def read(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as file:
        samples = np.frombuffer(file.readframes(file.getnframes()), dtype="<i2")
        return (samples.astype(np.float32) / 32768), file.getframerate()


def delete(name: str) -> None:
    if not NAME.fullmatch(name):
        return
    for suffix in (".wav", ".json"):
        (RECORDINGS_DIR / f"{name}{suffix}").unlink(missing_ok=True)
