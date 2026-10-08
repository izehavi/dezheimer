"""Reads a transcript with a small language model and proposes what to remember:
a short summary for the diary, and memos about people and things.

The model does the reading. Plain code then checks every memo against the
transcript, because a small model sometimes invents: a memo is kept only if the
words it quotes were really said.
"""

import difflib
import json
import os
import re
import threading
import time

from .commands import _match_person

MODEL_NAME = os.environ.get("DEZHEIMER_LLM_MODEL", "Qwen/Qwen2.5-3B-Instruct")
MAX_TRANSCRIPT_CHARS = 6000

SYSTEM_PROMPT = """You help {user}, a person with memory loss, remember what was said around her.
You read the transcript of a conversation. It comes from a microphone: there are no speaker names, and some words may be wrong.

People {user} knows: {people}

Answer with JSON only, in this exact form:
{{
  "summary": "2 or 3 short sentences telling {user} what happened in this conversation, written to her with 'you'",
  "memos": [
    {{"about": "name of the person, or the thing, that the news is about", "news": "one short sentence", "quote": "the exact words of the transcript that say it"}}
  ]
}}

Rules:
- A memo is lasting news, worth remembering in a few weeks: about a person's life (work, studies, family, health, projects, travels, tastes) or about a thing (the house, the car, a pet, an object).
- Greetings, small talk and appointments are not memos.
- One memo for each piece of news. "about" is one name only.
- Only write what is in the transcript. Never invent. If there is no news, "memos" is an empty list."""

# Worked examples shown to the model before the real transcript. Small models follow
# an example much better than a rule.
EXAMPLES = [
    (
        "Hello, it's Marc. How are you? Fine thank you. I will pick you up on Tuesday at 10 for the dentist. "
        "Good. You know, Julie passed her driving test last week, and she bought a small red car. Oh lovely. "
        "And the washing machine is broken, the repairman said we need a new one. Okay. Well, have a nice day. You too.",
        {
            "summary": "Marc called you. He will pick you up on Tuesday at 10 for the dentist. "
                       "He told you that Julie passed her driving test and that the washing machine is broken.",
            "memos": [
                {"about": "Julie", "news": "Julie passed her driving test last week.",
                 "quote": "Julie passed her driving test last week"},
                {"about": "Julie", "news": "Julie bought a small red car.",
                 "quote": "she bought a small red car"},
                {"about": "Washing machine", "news": "The washing machine is broken and must be replaced.",
                 "quote": "the washing machine is broken, the repairman said we need a new one"},
            ],
        },
    ),
    (
        "Good evening. Good evening. It is raining again. Yes. Would you like some soup? Yes please. Good night.",
        {"summary": "You had a short chat in the evening and you were offered some soup.", "memos": []},
    ),
]


class Reader:
    """The language model, loaded the first time it is needed."""

    def __init__(self):
        self.ready = False
        self._lock = threading.Lock()

    def _load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if self.device == "cuda" else torch.float32
        self._tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self._model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, dtype=dtype).to(self.device).eval()
        self.ready = True

    def ask(self, messages, max_new_tokens=600):
        """`messages` is a chat: [{"role": "system" | "user" | "assistant", "content": ...}]."""
        import torch

        with self._lock:
            if not self.ready:
                self._load()
            inputs = self._tokenizer.apply_chat_template(
                messages, add_generation_prompt=True, return_tensors="pt", return_dict=True,
            ).to(self.device)
            with torch.no_grad():
                output = self._model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
            answer = output[0][inputs["input_ids"].shape[1]:]
            return self._tokenizer.decode(answer, skip_special_tokens=True)


reader = Reader()


# ---- Checks ----


def _parse_json(raw):
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The model did not answer with JSON.")
    return json.loads(raw[start:end + 1])


def _plain(text):
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _was_said(quote, transcript):
    """True when the quote is in the transcript, allowing small copying differences."""
    quote, transcript = _plain(quote), _plain(transcript)
    if len(quote) < 8:
        return False
    if quote in transcript:
        return True
    match = difflib.SequenceMatcher(None, quote, transcript, autojunk=False).find_longest_match()
    return match.size >= 0.6 * len(quote)


def _is_named(person, transcript):
    """True when the person's name is heard in the transcript, even misspelled ("Sara")."""
    name = _plain(re.sub(r"^(dr\.?|doctor)\s+", "", person["name"], flags=re.I))
    words = set(_plain(transcript).split())
    return bool(difflib.get_close_matches(name, words, n=1, cutoff=0.8))


def understand(text, people, user_name="Helen", ask=None):
    """Return {"summary", "memos", "rejected", "seconds", "model"} for a transcript.

    `people` are the known people: dicts with "id", "name" and optionally "relationship".
    Each memo is {"personId", "about", "news", "quote"}; personId is None for a thing
    or for someone who is not a known person.
    """
    ask = ask or reader.ask
    text = text.strip()[-MAX_TRANSCRIPT_CHARS:]
    known = ", ".join(
        f"{p['name']} ({re.sub(r'^your ', '', (p.get('relationship') or 'known person').lower())})"
        for p in people
    ) or "nobody yet"

    started = time.time()
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(user=user_name, people=known)}]
    for example, expected in EXAMPLES:
        messages.append({"role": "user", "content": f"Transcript:\n{example}"})
        messages.append({"role": "assistant", "content": json.dumps(expected, indent=1)})
    messages.append({"role": "user", "content": f"Transcript:\n{text}"})
    answer = _parse_json(ask(messages))

    memos, rejected = [], 0
    for item in answer.get("memos") or []:
        if not isinstance(item, dict):
            rejected += 1
            continue
        about, news, quote = (str(item.get(k) or "").strip() for k in ("about", "news", "quote"))
        person = _match_person(about, people) if about else None
        if not (about and news and _was_said(quote, text)) or (person and not _is_named(person, text)):
            rejected += 1
            continue
        memo = {
            "personId": person["id"] if person else None,
            "about": person["name"] if person else about[0].upper() + about[1:],
            "news": news,
            "quote": quote,
        }
        if memo not in memos:
            memos.append(memo)

    summary = answer.get("summary")
    return {
        "summary": summary.strip() if isinstance(summary, str) else "",
        "memos": memos,
        "rejected": rejected,
        "seconds": round(time.time() - started, 1),
        "model": MODEL_NAME,
    }
