"""Train a small speech model on the user's own voice: python -m server.finetune

It starts from Whisper tiny (39 million parameters, small enough for a phone) and goes
on training it with the phrases of `train.jsonl` (python -m server.dataset).

Two things are done, in this order:
1. A check. Is the trained model really better on words it never saw? Each text the
   user read is left out in turn: the model is trained on the others and measured on
   the one left out, before and after. This is the number to believe.
2. The model. Trained on everything in `train.jsonl`, measured on `test.jsonl`, and
   saved in the folder `models` next to the recordings. To use it in the app, set the
   variable DEZHEIMER_ASR_MODEL to that folder.

There is little data (minutes, not hours), so each phrase is heard several times, each
time a little different: faster or slower, louder or quieter, with some noise.
"""

import argparse
import json
import random
import re
from pathlib import Path

import numpy as np

from . import readings, recordings
from .accounts import DATA_DIR
from .dataset import DATASET_DIR
from .measure import own_words, words, wrong_words
from .transcriber import SAMPLE_RATE, Transcriber, _resample

MODELS_DIR = Path(DATA_DIR) / "models"
BASE = "openai/whisper-tiny.en"
BATCH = 8


def load(name: str) -> list[dict]:
    path = DATASET_DIR / f"{name}.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def sound(row: dict) -> np.ndarray:
    audio, rate = recordings.read(Path(row["audio"]))
    return audio if rate == SAMPLE_RATE else _resample(audio, rate)


def varied(audio: np.ndarray, rng: random.Random) -> np.ndarray:
    """The same phrase, a little different: speed, loudness, and some noise."""
    speed = rng.uniform(0.9, 1.1)
    positions = np.arange(0, len(audio) - 1, speed)
    audio = np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)
    audio = audio * rng.uniform(0.6, 1.3)
    noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(0, 0.004), len(audio))
    return np.clip(audio + noise.astype(np.float32), -1, 1)


def train(base: str, rows: list[dict], epochs: int, rate: float, seed: int = 0):
    """Go on training `base` with `rows`. Returns (processor, model)."""
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    torch.manual_seed(seed)
    rng = random.Random(seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = WhisperProcessor.from_pretrained(base)
    # Parts of the sound are hidden and some connections dropped while training, so that
    # the model does not learn these few phrases by heart.
    model = WhisperForConditionalGeneration.from_pretrained(
        base, dropout=0.1, apply_spec_augment=True, mask_time_prob=0.05, mask_feature_prob=0.05,
    ).to(device)
    sounds = [sound(row) for row in rows]
    start = model.config.decoder_start_token_id
    # The model adds the first token itself.
    labels = [[t for i, t in enumerate(processor.tokenizer(row["text"]).input_ids) if i or t != start] for row in rows]

    steps = epochs * -(-len(rows) // BATCH)
    optimizer = torch.optim.AdamW(model.parameters(), lr=rate, weight_decay=0.01)
    warm = max(1, steps // 10)
    schedule = torch.optim.lr_scheduler.LambdaLR(
        optimizer, lambda step: (step + 1) / warm if step < warm else max(0.0, (steps - step) / (steps - warm)))

    model.train()
    for _ in range(epochs):
        order = list(range(len(rows)))
        rng.shuffle(order)
        for at in range(0, len(order), BATCH):
            batch = order[at:at + BATCH]
            features = processor.feature_extractor(
                [varied(sounds[i], rng) for i in batch], sampling_rate=SAMPLE_RATE, return_tensors="pt",
                return_attention_mask=True)
            longest = max(len(labels[i]) for i in batch)
            target = torch.tensor([labels[i] + [-100] * (longest - len(labels[i])) for i in batch])
            loss = model(
                input_features=features.input_features.to(device),
                attention_mask=features.attention_mask.to(device), labels=target.to(device),
            ).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            schedule.step()
            optimizer.zero_grad()
    return processor, model.eval()


def as_transcriber(name: str, processor=None, model=None) -> Transcriber:
    transcriber = Transcriber(name)
    if model is None:
        transcriber._load()
    else:
        transcriber._processor, transcriber._model = processor, model
        transcriber.device, transcriber.ready = str(model.device), True
    return transcriber


def score(transcriber: Transcriber, rows: list[dict], with_vocabulary: bool) -> dict:
    """How well a model writes these phrases: the share of words wrong, and of the user's names right."""
    wrong = total = names = right = 0
    for row in rows:
        said = words(row["text"])
        heard = words(transcriber.transcribe(sound(row), SAMPLE_RATE, row["vocabulary"] if with_vocabulary else ""))
        own = own_words(row["vocabulary"], said)
        wrong += wrong_words(said, heard)
        total += len(said)
        names += len(own)
        right += sum(1 for name in own if re.search(rf"\b{re.escape(name)}\b", " ".join(heard)))
    return {"wrong": wrong / max(1, total), "names": right / names if names else None, "words": total}


def show(label: str, before: dict, after: dict) -> None:
    def names(result):
        return "  -" if result["names"] is None else f"{result['names']:4.0%}"
    print(f"  {label:<34} words wrong {before['wrong']:4.0%} -> {after['wrong']:4.0%}    "
          f"names right {names(before)} -> {names(after)}")


def text_of(row: dict, texts: list[dict]) -> str | None:
    """The reading a phrase comes from."""
    for reading in texts:
        if row["text"] in " ".join(reading["text"].split()):
            return reading["title"]
    return None


def check(base: str, rows: list[dict], epochs: int, rate: float) -> None:
    """Leave each text out in turn: train on the others, measure on the one left out."""
    texts = readings.all_readings()
    groups = {}
    for row in rows:
        if row["kind"] != "auto":
            groups.setdefault(text_of(row, texts), []).append(row)
    groups.pop(None, None)
    if len(groups) < 2:
        print("The check needs phrases from at least two different texts read aloud. It is skipped.")
        return
    print(f"Check: each text left out in turn, {epochs} passes over the others.")
    plain = as_transcriber(base)
    sums = {key: [0.0, 0.0, 0] for key in ("with", "without")}
    for title, left_out in groups.items():
        others = [row for row in rows if row not in left_out]
        trained = as_transcriber(base, *train(base, others, epochs, rate))
        for key, vocabulary in (("with", True), ("without", False)):
            before, after = score(plain, left_out, vocabulary), score(trained, left_out, vocabulary)
            show(f"{title[:22]} ({key} vocabulary)", before, after)
            sums[key][0] += before["wrong"] * before["words"]
            sums[key][1] += after["wrong"] * after["words"]
            sums[key][2] += before["words"]
    for key, (before, after, count) in sums.items():
        print(f"  All texts, {key} vocabulary: words wrong {before / count:.0%} -> {after / count:.0%}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a small speech model on the user's own voice.")
    parser.add_argument("--base", default=BASE, help="the model to start from")
    parser.add_argument("--epochs", type=int, default=10, help="how many times each phrase is heard")
    parser.add_argument("--rate", type=float, default=1e-5, help="the learning rate")
    parser.add_argument("--name", default="whisper-tiny-mine", help="the name of the folder of the trained model")
    parser.add_argument("--no-check", action="store_true", help="only train and save the model")
    args = parser.parse_args()

    rows, held_out = load("train"), load("test")
    if not rows:
        print("There is nothing to train on yet. Read the texts aloud in the app, then run: python -m server.dataset")
        raise SystemExit(0)
    seconds = sum(len(sound(row)) for row in rows) / SAMPLE_RATE
    print(f"{len(rows)} phrases to train on, {seconds / 60:.1f} minutes. Starting from {args.base}.")
    if not args.no_check:
        check(args.base, rows + held_out, args.epochs, args.rate)

    print("Training the model on every phrase to train on.")
    processor, model = train(args.base, rows, args.epochs, args.rate)
    folder = MODELS_DIR / args.name
    folder.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(folder)
    processor.save_pretrained(folder)
    if held_out:
        print(f"On the {len(held_out)} phrases kept aside to measure with:")
        plain, trained = as_transcriber(args.base), as_transcriber(args.base, processor, model)
        for key, vocabulary in (("with", True), ("without", False)):
            show(f"{key} vocabulary", score(plain, held_out, vocabulary), score(trained, held_out, vocabulary))
    print(f"Saved in {folder}")
    print(f"To use it in the app: set DEZHEIMER_ASR_MODEL={folder}")
