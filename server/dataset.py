"""Turn the kept phrases into a dataset to train a small speech model: python -m server.dataset

First, the long texts the user read aloud on the "Teach the app my voice" screen are
cut into phrases (server/readings.py). Then every kept phrase (server/recordings.py)
gets the words that were said, from the best source there is:
- "read": a piece of a text read aloud, with the words of the text;
- "corrected": the tester wrote what was really said (python -m server.measure label);
- "auto": nobody checked it, so a much larger speech model writes it down here. This is
  right most of the time, and wrong mostly on the names the small model also gets wrong.

Two files are written next to the recordings, one phrase per line:
- train.jsonl: to train on. All three sources.
- test.jsonl: to measure with, never trained on. Only phrases a person is sure of
  ("read" and "corrected"), one in five of them, always the same ones.
"""

import argparse
import hashlib
import json
from pathlib import Path

from . import readings, recordings
from .accounts import DATA_DIR
from .measure import words
from .transcriber import Transcriber

DATASET_DIR = Path(DATA_DIR) / "dataset"
LABELLER = "openai/whisper-large-v3-turbo"   # 809 million parameters: far too big for a phone, fine on this computer
TEST_ONE_IN = 5


def label_with(model: str) -> None:
    """With a large model: cut the readings into phrases, and write down the phrases nobody checked."""
    to_cut = [r for r in readings.all_readings() if not r["cut"]]
    to_write = [r for r in recordings.all_recordings() if not r["said"] and r.get("auto_model") != model]
    if not to_cut and not to_write:
        return
    print(f"Using {model}. The first time, the model is downloaded.")
    transcriber = Transcriber(model)
    for r in to_cut:
        made = readings.cut(r, transcriber, model)
        print(f"  {r['title']}: {made['kept']} phrases kept out of {made['pieces']} pieces.")
    if to_write:
        print(f"  Writing down {len(to_write)} phrases said to the assistant.")
    for r in to_write:
        audio, rate = recordings.read(r["path"])
        recordings.update(r["name"], auto=transcriber.transcribe(audio, rate, r["vocabulary"]), auto_model=model)


def in_test(name: str) -> bool:
    """Always the same phrases, whenever the dataset is built again."""
    return int(hashlib.sha256(name.encode()).hexdigest(), 16) % TEST_ONE_IN == 0


def build() -> dict:
    train, test = [], []
    for r in recordings.all_recordings():
        text = r["said"] or r.get("auto")
        if not text:
            continue
        kind = (r["source"] if r["source"] in ("read", "corrected") else "corrected") if r["said"] else "auto"
        row = {"audio": str(r["path"]), "text": text, "kind": kind, "vocabulary": r["vocabulary"]}
        if kind == "auto":
            # The two models wrote the same words: very likely right.
            row["agree"] = words(text) == words(r["heard"])
        (test if kind != "auto" and in_test(r["name"]) else train).append(row)

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train", train), ("test", test)):
        (DATASET_DIR / f"{name}.jsonl").write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    return {"train": train, "test": test}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the dataset to train a small speech model.")
    parser.add_argument("--model", default=LABELLER, help="the large model that cuts the readings and writes down unchecked phrases")
    parser.add_argument("--no-auto", action="store_true", help="do not run the large model: only what is already written down")
    args = parser.parse_args()

    if not args.no_auto:
        label_with(args.model)
    made = build()
    rows = made["train"] + made["test"]
    if not rows:
        print(f"Nothing is kept yet in {recordings.RECORDINGS_DIR}.")
        print('In the app, open "Teach the app my voice" and read the texts aloud.')
        raise SystemExit(0)

    minutes = recordings.summary()["minutes"]
    count = {kind: sum(r["kind"] == kind for r in rows) for kind in ("read", "corrected", "auto")}
    agree = sum(bool(r.get("agree")) for r in rows)
    print(f"{len(rows)} phrases, about {minutes} minutes of sound kept.")
    print(f"  read aloud: {count['read']}   corrected by hand: {count['corrected']}   "
          f"written by the large model: {count['auto']} ({agree} where both models agree)")
    print(f"  to train on:     {len(made['train'])}  {DATASET_DIR / 'train.jsonl'}")
    print(f"  to measure with: {len(made['test'])}  {DATASET_DIR / 'test.jsonl'}")
