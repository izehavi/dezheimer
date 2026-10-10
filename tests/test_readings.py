"""Tests of the long texts read aloud: receiving them, cutting them, finding the words of each piece."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from server import readings, recordings

RATE = readings.SAMPLE_RATE
TEXT = ("Good morning. Today is Sunday, and the week starts in Tel Aviv. What do I have today? "
        "At nine I have a coffee with Elinor at Carmel coffee. Elinor is my sister. She lives in Givatayim.")


def voice(seconds):
    return (np.sin(np.arange(int(seconds * RATE)) / 20) * 0.3).astype(np.float32)


def silence(seconds):
    return np.zeros(int(seconds * RATE), dtype=np.float32)


class Receiving(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        for module, name in ((readings, "READINGS_DIR"), (recordings, "RECORDINGS_DIR")):
            patch = mock.patch.object(module, name, Path(folder.name) / name.lower())
            patch.start()
            self.addCleanup(patch.stop)

    def piece(self, seconds):
        return (voice(seconds) * 32767).astype("<i2").tobytes()

    def test_the_pieces_become_one_recording_with_its_text(self):
        readings.add_piece("session0001", 1, RATE, self.piece(2))
        readings.add_piece("session0001", 0, RATE, self.piece(3))
        readings.add_piece("session0001", 1, RATE, self.piece(2))   # sent twice: kept once
        self.assertEqual(readings.finish("session0001", 2, "Part 1", TEXT), 5.0)
        kept = readings.all_readings()
        self.assertEqual([(r["title"], r["text"], r["cut"]) for r in kept], [("Part 1", TEXT, False)])
        self.assertEqual(readings.summary(), {"readings": 1, "minutes": 0.1})
        self.assertEqual(list(readings.READINGS_DIR.glob("*.pcm")), [])

    def test_a_reading_with_a_missing_piece_is_refused(self):
        readings.add_piece("session0001", 0, RATE, self.piece(1))
        with self.assertRaises(ValueError):
            readings.finish("session0001", 2, "Part 1", TEXT)

    def test_only_a_reading_is_accepted(self):
        for session, index, body in (("../outside", 0, b"ab"), ("session0001", -1, b"ab"), ("session0001", 0, b"abc")):
            with self.assertRaises(ValueError):
                readings.add_piece(session, index, RATE, body)

    def test_a_reading_is_cut_into_kept_phrases_with_the_words_of_the_text(self):
        sound = np.concatenate([voice(10), silence(0.6), voice(10), silence(0.6), voice(8)])
        readings.add_piece("session0001", 0, RATE, (sound * 32767).astype("<i2").tobytes())
        readings.finish("session0001", 1, "Part 1", TEXT)

        class Model:   # writes the three pieces down, with the mistakes a real model makes
            heard = iter(["good morning today is Sunday and the week starts in Tel Aviv",
                          "What do I have today? At 9 I have a coffee with Eleanor at caramel coffee.",
                          "Elinor is my sister, she lives in Givat Ayim"])

            def transcribe(self, audio, rate, vocabulary):
                return next(self.heard)

        made = readings.cut(readings.all_readings()[0], Model(), "a-model")
        self.assertEqual(made, {"pieces": 3, "kept": 3})
        kept = recordings.all_recordings()
        self.assertEqual(sorted(r["said"] for r in kept), sorted([
            "Good morning. Today is Sunday, and the week starts in Tel Aviv.",
            "What do I have today? At nine I have a coffee with Elinor at Carmel coffee.",
            "Elinor is my sister. She lives in Givatayim.",
        ]))
        self.assertEqual({r["source"] for r in kept}, {"read"})
        self.assertTrue(readings.all_readings()[0]["cut"])


class Cutting(unittest.TestCase):
    def test_the_sound_is_cut_at_the_pauses(self):
        sound = np.concatenate([silence(1), voice(7), silence(0.5), voice(9), silence(0.1), voice(4), silence(0.7), voice(6)])
        cuts = readings.pieces(sound)
        self.assertEqual(len(cuts), 3)
        self.assertEqual(cuts[0][0], RATE)                                # the silence before is left out
        self.assertAlmostEqual(cuts[0][1] / RATE, 8.25, delta=0.1)        # in the middle of the first pause
        self.assertAlmostEqual(cuts[1][1] / RATE, 21.95, delta=0.1)       # the longer pause, not the 0.1 second gap
        self.assertEqual(cuts[-1][1], len(sound))

    def test_without_any_pause_no_piece_is_too_long(self):
        cuts = readings.pieces(voice(50))
        self.assertTrue(all(b - a <= readings.MAX_PIECE_S * RATE for a, b in cuts))
        self.assertEqual((cuts[0][0], cuts[-1][1]), (0, 50 * RATE))


class Words(unittest.TestCase):
    def test_words_added_by_the_reader_are_left_out(self):
        found = readings.align(TEXT, [
            "Good morning. Today is Sunday and the week starts in Tel Aviv.",
            "Sorry, I lost my place, where was I. What do I have today?",
            "At nine I have a coffee with Elinor at Carmel coffee.",
        ])
        self.assertEqual([f["keep"] for f in found], [True, False, True])
        self.assertEqual(found[2]["said"], "At nine I have a coffee with Elinor at Carmel coffee.")

    def test_a_reading_stopped_half_way_keeps_what_was_read(self):
        found = readings.align(TEXT, ["Good morning. Today is Sunday, and the week starts in Tel Aviv."])
        self.assertEqual(found[0]["said"], "Good morning. Today is Sunday, and the week starts in Tel Aviv.")
        self.assertTrue(found[0]["keep"])

    def test_something_else_than_the_text_is_not_kept(self):
        found = readings.align(TEXT, ["Hello, can you bring me the newspaper please", ""])
        self.assertEqual([f["keep"] for f in found], [False, False])

    def test_the_names_of_a_text(self):
        self.assertEqual(readings.names_in(TEXT), "Sunday, Tel Aviv, Elinor, Carmel, Givatayim")


if __name__ == "__main__":
    unittest.main()
