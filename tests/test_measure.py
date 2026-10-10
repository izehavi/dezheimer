"""Tests of the kept recordings and of how the speech model is scored."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from server import recordings
from server.measure import own_words, words, wrong_words


class Scoring(unittest.TestCase):
    def test_words_ignore_capitals_and_punctuation(self):
        self.assertEqual(words("It's Elinor, at Carmel coffee."), ["its", "elinor", "at", "carmel", "coffee"])

    def test_a_time_is_the_same_however_it_is_written(self):
        for text in ("at 3 p.m.", "at 3pm", "at 3 p m", "at 3 PM."):
            self.assertEqual(words(text), ["at", "3", "pm"])
        self.assertEqual(words("I am Sam"), ["i", "am", "sam"])

    def test_wrong_words(self):
        said = words("add a coffee with Elinor")
        self.assertEqual(wrong_words(said, said), 0)
        self.assertEqual(wrong_words(said, words("add a coffee with Eleanor")), 1)   # replaced
        self.assertEqual(wrong_words(said, words("add coffee with Elinor")), 1)      # missed
        self.assertEqual(wrong_words(said, words("add a a coffee with Elinor")), 1)  # added
        self.assertEqual(wrong_words(said, []), 5)

    def test_own_words_are_the_ones_said(self):
        said = words("A coffee with Elinor at Carmel coffee")
        self.assertEqual(own_words("Elinor, Lothan. Carmel coffee. Memo, agenda.", said), ["elinor", "carmel coffee"])


class Kept(unittest.TestCase):
    def setUp(self):
        # Not in the real folder of the tester's recordings.
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        patch = mock.patch.object(recordings, "RECORDINGS_DIR", Path(folder.name))
        patch.start()
        self.addCleanup(patch.stop)

    def test_a_phrase_is_kept_read_back_and_deleted(self):
        audio = (np.sin(np.arange(16000) / 20) * 0.5).astype(np.float32)
        name = recordings.keep(audio, 16000, "Hello Elinor.", "Elinor.", "a-model")
        kept = next(r for r in recordings.all_recordings() if r["name"] == name)
        self.assertEqual((kept["heard"], kept["said"], kept["vocabulary"]), ("Hello Elinor.", None, "Elinor."))
        samples, rate = recordings.read(kept["path"])
        self.assertEqual(rate, 16000)
        self.assertLess(np.abs(samples - audio).max(), 0.001)
        recordings.delete(name)
        self.assertFalse([r for r in recordings.all_recordings() if r["name"] == name])


if __name__ == "__main__":
    unittest.main()
