"""Measure the speech model on the tester's own voice.

    python -m server.measure label     write what was really said in each kept phrase
    python -m server.measure           compare the model sizes on the phrases that have it

The phrases are the ones kept by the app when "keep the sound of my voice" is on
(server/recordings.py). Two numbers are given for each model:
- the share of words it got wrong (substituted, missed or added), lower is better;
- the share of the user's own names and places it wrote right, higher is better.
Each model is tried with and without the user's vocabulary.
"""

import argparse
import re
import time

from . import recordings
from .transcriber import Transcriber

MODELS = ["openai/whisper-tiny.en", "openai/whisper-base.en", "openai/whisper-small.en", "openai/whisper-small"]


def words(text: str) -> list[str]:
    """The words of a sentence, without capitals or punctuation: "It's 3 pm." -> its, 3, pm."""
    # "3 p.m.", "3pm" and "3 p m" are all "3 pm".
    text = re.sub(r"(\d)\s*([ap])\.?\s?m\b\.?", r"\1 \2m", text.lower())
    return re.findall(r"[a-z0-9à-ÿ]+", text.replace("'", "").replace("’", ""))


def wrong_words(said: list[str], heard: list[str]) -> int:
    """How many words must be replaced, removed or added to turn `heard` into `said`."""
    row = list(range(len(heard) + 1))
    for i, s in enumerate(said, 1):
        previous, row[0] = row[0], i
        for j, h in enumerate(heard, 1):
            previous, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, previous + (s != h))
    return row[-1]


def own_words(vocabulary: str, said: list[str]) -> list[str]:
    """The user's names and places that were said in this phrase, each as its list of words."""
    spoken = " ".join(said)
    found = []
    for entry in re.split(r"[,.]", vocabulary):
        entry = " ".join(words(entry))
        if entry and re.search(rf"\b{re.escape(entry)}\b", spoken):
            found.append(entry)
    return found


def label(play: bool) -> None:
    todo = [r for r in recordings.all_recordings() if r["said"] is None]
    if not todo:
        print("Every kept phrase already has what was really said.")
        return
    print(f"{len(todo)} phrases to check. For each one:")
    print("  Enter      what was heard is right")
    print("  or type what was really said, then Enter")
    print("  r  hear it again     s  skip     d  delete the recording     q  stop\n")
    for i, r in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] heard: {r['heard']}")
        while True:
            if play:
                import winsound
                winsound.PlaySound(str(r["path"]), winsound.SND_FILENAME)
            try:
                answer = input("  said: ").strip()
            except EOFError:
                return
            if answer.lower() != "r":
                break
        if answer.lower() == "q":
            return
        if answer.lower() == "s":
            continue
        if answer.lower() == "d":
            recordings.delete(r["name"])
            continue
        recordings.update(r["name"], said=answer or r["heard"], source="corrected")


def compare(models: list[str], show_misses: bool = False) -> None:
    kept = recordings.all_recordings()
    phrases = [r for r in kept if r["said"]]
    if not phrases:
        print(f"No phrase to measure yet: {len(kept)} kept in {recordings.RECORDINGS_DIR}, none with what was really said.")
        print("Switch on \"Keep the sound of my voice\" in the app, use it, then run: python -m server.measure label")
        return
    audio = [recordings.read(r["path"]) for r in phrases]
    said = [words(r["said"]) for r in phrases]
    names = [own_words(r["vocabulary"], s) for r, s in zip(phrases, said)]
    total_words, total_names = sum(map(len, said)), sum(map(len, names))
    print(f"{len(phrases)} phrases, {total_words} words, {total_names} of the user's own names and places.\n")
    print(f"{'model':<26}{'vocabulary':<12}{'words wrong':>12}{'names right':>13}{'phrases right':>15}{'per phrase':>12}")

    for model in models:
        transcriber = Transcriber(model)
        transcriber.transcribe(audio[0][0], audio[0][1])   # loads the model, so that the times are fair
        for with_vocabulary in (True, False):
            wrong = right_names = right_phrases = 0
            started = time.perf_counter()
            misses = []
            for r, (samples, rate), s, own in zip(phrases, audio, said, names):
                heard = words(transcriber.transcribe(samples, rate, r["vocabulary"] if with_vocabulary else ""))
                errors = wrong_words(s, heard)
                wrong += errors
                right_phrases += errors == 0
                right_names += sum(1 for name in own if re.search(rf"\b{re.escape(name)}\b", " ".join(heard)))
                if errors:
                    misses.append((" ".join(s), " ".join(heard)))
            seconds = (time.perf_counter() - started) / len(phrases)
            print(f"{model.removeprefix('openai/'):<26}{'yes' if with_vocabulary else 'no':<12}"
                  f"{wrong / max(1, total_words):>11.0%} "
                  f"{(f'{right_names / total_names:.0%}' if total_names else '-'):>12} "
                  f"{f'{right_phrases}/{len(phrases)}':>14} {seconds:>10.2f}s")
            if with_vocabulary and show_misses:
                for expected, got in misses:
                    print(f"      said:  {expected}\n      heard: {got}")
        del transcriber


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Measure the speech model on the kept phrases.")
    parser.add_argument("action", nargs="?", choices=["compare", "label"], default="compare")
    parser.add_argument("--models", nargs="+", default=MODELS, help="Hugging Face names of Whisper models")
    parser.add_argument("--misses", action="store_true", help="show each phrase a model got wrong (with the vocabulary)")
    parser.add_argument("--quiet", action="store_true", help="label without playing the sound")
    args = parser.parse_args()
    if args.action == "label":
        label(play=not args.quiet)
    else:
        compare(args.models, args.misses)
