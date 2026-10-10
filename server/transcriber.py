"""Speech-to-text with a pretrained Whisper model from Hugging Face.

Two things help it with the user's own words:
- the size of the model: "tiny" misheard too many words in practice ("Mimo" for memo),
  so the default is "small". On a phone, "base" is the realistic size;
- a vocabulary: the names of the user's people and places are given to the model
  before each phrase, so that it writes "Elinor" and not "Eleanor" or "Edynore".
"""

import os
import re
import threading

import numpy as np

# English-only models, by size: tiny.en (39 M), base.en (74 M), small.en (244 M).
# For other languages, drop the ".en".
MODEL_NAME = os.environ.get("DEZHEIMER_ASR_MODEL", "openai/whisper-small.en")
MAX_VOCABULARY_CHARS = 600
SAMPLE_RATE = 16000
MAX_SECONDS = 30  # Whisper reads at most 30 seconds at a time.

# Whisper sometimes describes non-speech instead of staying silent: "[BLANK_AUDIO]", "(music)".
_NON_SPEECH = re.compile(r"^\s*[\[\(].*[\]\)]\s*$")


class Transcriber:
    def __init__(self, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self.ready = False
        self.error = None
        self.device = None
        self._lock = threading.Lock()
        self._processor = None
        self._model = None

    def load_in_background(self):
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        with self._lock:
            if self.ready:
                return
            try:
                # Imported here because torch takes several seconds to import;
                # the web server can start answering in the meantime.
                import torch
                from transformers import WhisperForConditionalGeneration, WhisperProcessor

                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                self._processor = WhisperProcessor.from_pretrained(self.model_name)
                self._model = (
                    WhisperForConditionalGeneration.from_pretrained(self.model_name).to(self.device).eval()
                )
                self.ready = True
                self.error = None
            except Exception as exc:
                self.error = str(exc)
                raise

    def transcribe(self, audio: np.ndarray, sample_rate: int = SAMPLE_RATE, vocabulary: str = "") -> str:
        """Return the text spoken in `audio`, a mono float32 signal in [-1, 1].

        `vocabulary` is a short text with the names and words the user is likely to say.
        """
        import torch

        if not self.ready:
            self._load()

        if sample_rate != SAMPLE_RATE:
            audio = _resample(audio, sample_rate)
        audio = audio[-MAX_SECONDS * SAMPLE_RATE:]

        with self._lock:
            inputs = self._processor(
                audio, sampling_rate=SAMPLE_RATE, return_tensors="pt", return_attention_mask=True
            )
            options = {}
            if not self.model_name.endswith(".en"):
                # A model for every language must be told which one, or it guesses from the accent.
                options.update(language="en", task="transcribe")
            vocabulary = vocabulary.strip()[:MAX_VOCABULARY_CHARS]
            if vocabulary:
                # Whisper reads this as what was said just before: it then prefers these spellings.
                options["prompt_ids"] = self._processor.get_prompt_ids(vocabulary, return_tensors="pt").to(self.device)
            with torch.no_grad():
                ids = self._model.generate(
                    # Some large models are stored in half precision: the sound must be given the same way.
                    inputs.input_features.to(self.device, dtype=self._model.dtype),
                    attention_mask=inputs.attention_mask.to(self.device),
                    **options,
                )
            text = self._processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            if vocabulary and text.startswith(vocabulary):
                text = text[len(vocabulary):].strip()   # some versions return the prompt with the answer

        return "" if _NON_SPEECH.match(text) else text


def _resample(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    # Linear interpolation: crude, but only used when the browser cannot record at 16 kHz.
    duration = len(audio) / sample_rate
    target = np.linspace(0, duration, int(duration * SAMPLE_RATE), endpoint=False)
    source = np.arange(len(audio)) / sample_rate
    return np.interp(target, source, audio).astype(np.float32)
