"""Tests of how the server keeps the feedback: one line per exchange, nothing lost."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from server import app as server


class Feedback(unittest.TestCase):
    def setUp(self):
        # Not in the real file of the tester's feedback.
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.file = Path(folder.name) / "feedback" / "feedback.jsonl"
        patch = mock.patch.object(server, "FEEDBACK_FILE", self.file)
        patch.start()
        self.addCleanup(patch.stop)
        self.client = TestClient(server.app)   # not started: the models are not needed

    def send(self, **record):
        self.assertEqual(self.client.post("/api/feedback", json={"record": record}).status_code, 200)

    def kept(self):
        return [json.loads(line) for line in self.file.read_text(encoding="utf-8").splitlines()]

    def test_the_verdict_replaces_the_unanswered_exchange(self):
        self.send(id="a", verdict="unanswered", turns=[{"who": "you", "text": "Who is Rose?"}])
        self.send(id="b", verdict="unanswered")
        self.send(id="a", verdict="no", comment="I said Ross", turns=[{"who": "you", "text": "Who is Rose?"}])
        kept = self.kept()
        self.assertEqual([(r["id"], r["verdict"]) for r in kept], [("b", "unanswered"), ("a", "no")])
        self.assertEqual(kept[1]["comment"], "I said Ross")

    def test_sent_twice_is_kept_once(self):
        self.send(id="a", verdict="yes")
        self.send(id="a", verdict="yes")
        self.assertEqual(len(self.kept()), 1)

    def test_exchanges_without_an_id_are_all_kept(self):
        # The first two rounds of practice were saved without one.
        self.file.parent.mkdir(parents=True)
        self.file.write_text('{"verdict": "yes"}\n{"verdict": "no"}\n', encoding="utf-8")
        self.send(id="a", verdict="yes")
        self.send(verdict="no")
        self.assertEqual([r["verdict"] for r in self.kept()], ["yes", "no", "yes", "no"])


if __name__ == "__main__":
    unittest.main()
