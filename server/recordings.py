"""Recordings of the user's own requests, kept to measure the speech model.

Nothing is kept unless the user switched on "keep the sound of my voice" in the app.
Each phrase said to the assistant is then saved as a sound file, with what the speech
model heard and the vocabulary it was given. `python -m server.measure` uses them.

They are kept with the accounts, outside the project folder, and never leave this computer.
"""

import datetime as dt
import json
import secrets
import wave
from pathlib import Path

import numpy as np

from .accounts import DATA_DIR

RECORDINGS_DIR = Path(DATA_DIR) / "recordings"


def keep(audio: np.ndarray, sample_rate: int, heard: str, vocabulary: str, model: str) -> str:
    """Save one phrase, and return its name."""
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{dt.datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
    with wave.open(str(RECORDINGS_DIR / f"{name}.wav"), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(sample_rate)
        file.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    write_note(name, {"heard": heard, "said": None, "vocabulary": vocabulary, "model": model})
    return name


def write_note(name: str, note: dict) -> None:
    (RECORDINGS_DIR / f"{name}.json").write_text(json.dumps(note, ensure_ascii=False, indent=1), encoding="utf-8")


def all_recordings() -> list[dict]:
    """Every kept phrase, oldest first: {"name", "path", "heard", "said", "vocabulary", "model"}.

    "said" is what was really said, written by the tester (None until then).
    """
    found = []
    for path in sorted(RECORDINGS_DIR.glob("*.wav")):
        try:
            note = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            note = {}
        found.append({"heard": "", "said": None, "vocabulary": "", "model": "", **note, "name": path.stem, "path": path})
    return found


def read(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as file:
        samples = np.frombuffer(file.readframes(file.getnframes()), dtype="<i2")
        return (samples.astype(np.float32) / 32768), file.getframerate()


def delete(name: str) -> None:
    for suffix in (".wav", ".json"):
        (RECORDINGS_DIR / f"{name}{suffix}").unlink(missing_ok=True)
