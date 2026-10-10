"""Tests of the sentences read aloud and of the dataset made from the kept phrases."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from server import dataset, recordings

SOUND = (np.sin(np.arange(16000) / 20) * 0.5).astype(np.float32)   # one second


class Dataset(unittest.TestCase):
    def setUp(self):
        # Not in the real folders of the tester's recordings.
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        for module, name, value in (
            (recordings, "RECORDINGS_DIR", Path(folder.name) / "recordings"),
            (dataset, "DATASET_DIR", Path(folder.name) / "dataset"),
        ):
            patch = mock.patch.object(module, name, value)
            patch.start()
            self.addCleanup(patch.stop)

    def keep(self, heard, said=None):
        return recordings.keep(SOUND, 16000, heard, "Elinor.", "a-model", said)

    def test_a_sentence_read_aloud_keeps_its_exact_words(self):
        name = self.keep("Who is Eleanor?", said="Who is Elinor?")
        kept = recordings.all_recordings()[0]
        self.assertEqual((kept["name"], kept["said"], kept["source"]), (name, "Who is Elinor?", "read"))
        self.assertEqual(recordings.summary(), {"phrases": 1, "read": 1, "minutes": 0.0})

    def test_only_a_recording_can_be_deleted(self):
        name = self.keep("Hello.")
        outside = recordings.RECORDINGS_DIR.parent / "other.json"
        outside.write_text("{}")
        recordings.delete("../other")
        self.assertTrue(outside.exists())
        recordings.delete(name)
        self.assertEqual(recordings.all_recordings(), [])

    def test_each_phrase_gets_its_words_from_the_best_source(self):
        read = self.keep("Who is Eleanor?", said="Who is Elinor?")
        corrected = self.keep("Add a mimo.")
        recordings.update(corrected, said="Add a memo.", source="corrected")
        agreed = self.keep("What do I have today?")
        recordings.update(agreed, auto="What do I have today", auto_model="big")
        differs = self.keep("I remember that it rains.")
        recordings.update(differs, auto="Remember that it rains.", auto_model="big")
        self.keep("Nobody wrote this one down.")

        made = dataset.build()
        rows = {Path(r["audio"]).stem: r for r in made["train"] + made["test"]}
        self.assertEqual(len(rows), 4)   # the last one has no words yet
        self.assertEqual((rows[read]["kind"], rows[read]["text"]), ("read", "Who is Elinor?"))
        self.assertEqual((rows[corrected]["kind"], rows[corrected]["text"]), ("corrected", "Add a memo."))
        self.assertEqual((rows[agreed]["kind"], rows[agreed]["agree"]), ("auto", True))
        self.assertEqual((rows[differs]["kind"], rows[differs]["agree"]), ("auto", False))
        written = (dataset.DATASET_DIR / "train.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(written), len(made["train"]))
        self.assertIn("text", json.loads(written[0]))

    def test_the_test_set_is_only_what_a_person_is_sure_of_and_stays_the_same(self):
        for i in range(40):
            self.keep(f"Read {i}.", said=f"Read {i}.")
            recordings.update(self.keep(f"Said {i}."), auto=f"Said {i}.", auto_model="big")
        first = dataset.build()
        self.assertTrue(first["test"])
        self.assertTrue(all(r["kind"] == "read" for r in first["test"]))
        self.assertEqual(sum(r["kind"] == "auto" for r in first["train"]), 40)
        self.assertEqual([r["audio"] for r in dataset.build()["test"]], [r["audio"] for r in first["test"]])


if __name__ == "__main__":
    unittest.main()
