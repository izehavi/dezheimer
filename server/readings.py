"""Long texts read aloud by the user, and how they become training phrases.

On the "Teach the app my voice" screen the user reads a text of a few minutes without
stopping. The app sends the sound in pieces while they read; at the end the pieces
become one long recording, kept with the text that was on the screen.

A speech model learns from short phrases, each with its exact words. `cut` makes them:
1. the recording is cut where the reader paused, into pieces of a few seconds;
2. a large speech model writes each piece down;
3. what it wrote is laid along the text, word by word, to find which words of the text
   were read in each piece. The piece is kept with the words of the *text*: the names
   are then spelled right even where the model misheard them;
4. a piece that does not match the text (a slip, a cough, words added) is left out.

Kept with the accounts, outside the project folder.
"""

import datetime as dt
import difflib
import json
import re
import wave
from pathlib import Path

import numpy as np

from . import recordings
from .accounts import DATA_DIR
from .measure import words, wrong_words
from .transcriber import SAMPLE_RATE, _resample

READINGS_DIR = Path(DATA_DIR) / "readings"
SESSION = re.compile(r"[a-z0-9]{8,32}")
MAX_PIECES = 400                 # about 50 minutes
MAX_PIECE_BYTES = 30 * 48000 * 2

# Cutting at the pauses.
FRAME_S = 0.02
MIN_PAUSE_S = 0.2                # shorter gaps are inside a word or between two words
MIN_PIECE_S = 4
MAX_PIECE_S = 18                 # well under the 30 seconds a speech model reads at once
# Above this share of wrong words, a piece does not say what the text says.
TOO_DIFFERENT = 0.4
# A piece must begin and end on words of the text: at most this many heard words may
# come before the first word that matches, or after the last. Otherwise the reader said
# something else there, and the sound would not go with the words.
LOOSE_EDGE = 2
# This many words in a row that stand for nothing in the text: the reader added something.
ADDED_WORDS = 4


# ---- Receiving a reading ----

def _piece(session: str, index: int) -> Path:
    return READINGS_DIR / f"{session}.{index:04d}.pcm"


def add_piece(session: str, index: int, sample_rate: int, body: bytes) -> None:
    """Keep one piece of a reading going on. Sent twice, it is kept once."""
    if not SESSION.fullmatch(session) or not 0 <= index < MAX_PIECES:
        raise ValueError("Not a reading.")
    if not body or len(body) % 2 or len(body) > MAX_PIECE_BYTES:
        raise ValueError("Body must be 16-bit samples.")
    READINGS_DIR.mkdir(parents=True, exist_ok=True)
    samples = np.frombuffer(body, dtype="<i2")
    if sample_rate != SAMPLE_RATE:
        samples = (_resample(samples.astype(np.float32) / 32768, sample_rate) * 32767).astype("<i2")
    _piece(session, index).write_bytes(samples.tobytes())


def finish(session: str, pieces: int, title: str, text: str) -> float:
    """Put the pieces together as one recording, kept with the text. Returns its length in seconds."""
    if not SESSION.fullmatch(session) or not 0 < pieces <= MAX_PIECES:
        raise ValueError("Not a reading.")
    paths = [_piece(session, index) for index in range(pieces)]
    if not all(path.exists() for path in paths):
        raise ValueError("A part of the sound did not arrive.")
    sound = b"".join(path.read_bytes() for path in paths)
    name = f"{dt.datetime.now():%Y%m%d-%H%M%S}-{session[-6:]}"
    with wave.open(str(READINGS_DIR / f"{name}.wav"), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(SAMPLE_RATE)
        file.writeframes(sound)
    _write(name, {"title": title, "text": text, "cut": False})
    for path in paths:
        path.unlink()
    return len(sound) / 2 / SAMPLE_RATE


def _write(name: str, note: dict) -> None:
    (READINGS_DIR / f"{name}.json").write_text(json.dumps(note, ensure_ascii=False, indent=1), encoding="utf-8")


def all_readings() -> list[dict]:
    """Every reading kept, oldest first: {"name", "path", "title", "text", "cut"}."""
    found = []
    for path in sorted(READINGS_DIR.glob("*.wav")):
        try:
            note = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue   # without its text, a reading cannot be used
        found.append({"cut": False, **note, "name": path.stem, "path": path})
    return found


def summary() -> dict:
    """How much reading aloud is kept: the readings, and the minutes of sound."""
    count = 0
    seconds = 0.0
    for path in READINGS_DIR.glob("*.wav"):
        try:
            with wave.open(str(path), "rb") as file:
                seconds += file.getnframes() / file.getframerate()
            count += 1
        except (OSError, wave.Error):
            pass
    return {"readings": count, "minutes": round(seconds / 60, 1)}


# ---- From one long recording to phrases ----

def pauses(audio: np.ndarray) -> list[tuple[int, int]]:
    """Where the reader paused: (first sample, last sample) of each silence, in order."""
    frame = int(FRAME_S * SAMPLE_RATE)
    count = len(audio) // frame
    if not count:
        return []
    level = np.sqrt((audio[:count * frame].reshape(count, frame) ** 2).mean(axis=1))
    # Quiet means close to the quietest moments of this recording, whatever the microphone,
    # and far below the voice: a reader who never pauses has no quiet moment at all.
    quiet = level < max(0.002, min(3 * np.percentile(level, 10), 0.25 * np.percentile(level, 90)))
    found = []
    start = None
    for i, silent in enumerate([*quiet, False]):
        if silent and start is None:
            start = i
        elif not silent and start is not None:
            if (i - start) * FRAME_S >= MIN_PAUSE_S:
                found.append((start * frame, i * frame))
            start = None
    return found


def pieces(audio: np.ndarray) -> list[tuple[int, int]]:
    """Cut the recording at pauses into pieces of a few seconds: (first sample, last sample)."""
    gaps = pauses(audio)
    speech_start = gaps[0][1] if gaps and gaps[0][0] == 0 else 0
    cuts = []
    start = speech_start
    while len(audio) - start > MAX_PIECE_S * SAMPLE_RATE:
        earliest, latest = start + MIN_PIECE_S * SAMPLE_RATE, start + MAX_PIECE_S * SAMPLE_RATE
        inside = [(b - a, (a + b) // 2) for a, b in gaps if earliest <= (a + b) // 2 <= latest]
        # The longest pause is the most likely end of a sentence. Without any pause, cut anyway.
        cut = max(inside)[1] if inside else latest
        cuts.append((start, cut))
        start = cut
    if len(audio) - start > 0.5 * SAMPLE_RATE:
        cuts.append((start, len(audio)))
    return cuts


def _token(word: str) -> str:
    """A written word as it is compared: "Elinor," and "elinor" are the same; "5:30" is "530"."""
    return "".join(words(word))


def _tokens(text: str) -> list[tuple[str, str]]:
    """(as written, as compared) for each word of a text."""
    # "3 p.m." and "3 pm" must give the same words.
    text = re.sub(r"\b([ap])\.\s?m\b\.?", r"\1m", text, flags=re.I)
    return [(word, _token(word)) for word in text.split() if _token(word)]


def names_in(text: str) -> str:
    """The names of a text, to help the model that writes the pieces down: capitalized words inside sentences."""
    found = []
    for match in re.finditer(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-z]+(?: [A-Z][a-z]+)*", text):
        if match.group(0) not in found:
            found.append(match.group(0))
    return ", ".join(found)[:600]


def align(text: str, heard: list[str]) -> list[dict]:
    """Find which words of `text` were read in each piece.

    `heard` is what the model wrote for each piece, in order. Returns one entry per piece:
    {"said": the words of the text for this piece, "different": the share of them the
    model wrote otherwise, "keep": whether the sound and these words go together}.
    "said" is empty when nothing of the text matches the piece.
    """
    script = _tokens(text)
    spoken = [_tokens(piece) for piece in heard]
    flat = [compared for piece in spoken for _, compared in piece]
    # For each heard word: where its matching words of the text start and end.
    starts, ends = [0] * len(flat), [0] * len(flat)
    same, added = [False] * len(flat), [False] * len(flat)
    matcher = difflib.SequenceMatcher(None, [compared for _, compared in script], flat, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        for j in range(j1, j2):
            if tag == "equal":
                starts[j], ends[j] = i1 + (j - j1), i1 + (j - j1) + 1
                same[j] = True
            elif tag == "replace":
                # Misheard words: shared out evenly over the words of the text they stand for.
                starts[j] = i1 + (j - j1) * (i2 - i1) // (j2 - j1)
                ends[j] = i1 + (j - j1 + 1) * (i2 - i1) // (j2 - j1)
            else:   # a word the reader added: it stands for nothing in the text
                starts[j] = ends[j] = i1
                added[j] = True

    nothing = {"said": "", "different": 1.0, "keep": False}
    out = []
    position = 0
    for piece in spoken:
        first, last = position, position + len(piece) - 1
        position += len(piece)
        span = script[starts[first]:ends[last]] if piece else []
        if not span:
            out.append(nothing)
            continue
        wrong = wrong_words([compared for _, compared in span], [compared for _, compared in piece])
        different = wrong / len(span)
        matches = [j for j in range(first, last + 1) if same[j]]
        loose = not matches or matches[0] - first > LOOSE_EDGE or last - matches[-1] > LOOSE_EDGE
        run = longest = 0
        for j in range(first, last + 1):
            run = run + 1 if added[j] else 0
            longest = max(longest, run)
        out.append({
            "said": " ".join(written for written, _ in span), "different": different,
            "keep": different <= TOO_DIFFERENT and not loose and longest < ADDED_WORDS,
        })
    return out


def cut(reading: dict, transcriber, model: str) -> dict:
    """Turn one reading into kept phrases (server/recordings.py). Returns {"pieces", "kept"}."""
    audio, rate = recordings.read(reading["path"])
    if rate != SAMPLE_RATE:
        audio = _resample(audio, rate)
    vocabulary = names_in(reading["text"])
    spans = pieces(audio)
    heard = [transcriber.transcribe(audio[a:b], SAMPLE_RATE, vocabulary) for a, b in spans]
    kept = 0
    for (a, b), written, found in zip(spans, heard, align(reading["text"], heard)):
        if found["keep"]:
            recordings.keep(audio[a:b], SAMPLE_RATE, written, vocabulary, model, said=found["said"])
            kept += 1
    note = json.loads(reading["path"].with_suffix(".json").read_text(encoding="utf-8"))
    _write(reading["name"], {**note, "cut": True, "pieces": len(spans), "kept": kept})
    return {"pieces": len(spans), "kept": kept}
