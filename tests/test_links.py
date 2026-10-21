"""Links between the person with memory loss and the relatives who help them."""

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from server import accounts


class Links(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        patch = mock.patch.object(accounts, "DATA_DIR", Path(folder.name))
        patch.start()
        self.addCleanup(patch.stop)
        accounts._wrong_codes.clear()
        self.helen = accounts.user_for(accounts.sign_up("helen@example.com", "password1")["token"])
        self.sarah = accounts.user_for(accounts.sign_up("sarah@example.com", "password2")["token"])

    def test_a_relative_joins_with_the_code(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        self.assertRegex(code, r"^\d{6}$")
        self.assertEqual(accounts.join(self.sarah, code, "Sarah"), {"id": self.helen, "name": "Helen"})
        self.assertEqual(accounts.links(self.helen), {"helpers": [{"id": self.sarah, "name": "Sarah"}], "people": []})
        self.assertEqual(accounts.links(self.sarah), {"helpers": [], "people": [{"id": self.helen, "name": "Helen"}]})

    def test_a_code_works_once(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        accounts.join(self.sarah, code, "Sarah")
        with self.assertRaises(accounts.AccountError):
            accounts.join(self.sarah, code, "Sarah")

    def test_a_code_typed_with_spaces(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        accounts.join(self.sarah, f"{code[:3]} {code[3:]}", "Sarah")
        self.assertEqual(len(accounts.links(self.helen)["helpers"]), 1)

    def test_a_new_code_replaces_the_old_one(self):
        old = accounts.invite(self.helen, "Helen")["code"]
        new = accounts.invite(self.helen, "Helen")["code"]
        if old != new:
            with self.assertRaises(accounts.AccountError):
                accounts.join(self.sarah, old, "Sarah")
        accounts.join(self.sarah, new, "Sarah")

    def test_an_old_code_is_refused(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        later = time.time() + accounts.INVITE_SECONDS + 1
        with mock.patch.object(accounts.time, "time", return_value=later):
            with self.assertRaises(accounts.AccountError):
                accounts.join(self.sarah, code, "Sarah")

    def test_not_with_ones_own_code(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        with self.assertRaises(accounts.AccountError):
            accounts.join(self.helen, code, "Helen")

    def test_too_many_wrong_codes(self):
        code = accounts.invite(self.helen, "Helen")["code"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(accounts.MAX_WRONG_CODES):
            with self.assertRaises(accounts.AccountError):
                accounts.join(self.sarah, wrong, "Sarah")
        # Even the right code is refused for an hour.
        with self.assertRaises(accounts.AccountError):
            accounts.join(self.sarah, code, "Sarah")

    def test_a_name_is_needed(self):
        with self.assertRaises(accounts.AccountError):
            accounts.invite(self.helen, "   ")

    def test_either_side_can_unlink(self):
        accounts.join(self.sarah, accounts.invite(self.helen, "Helen")["code"], "Sarah")
        accounts.unlink(self.sarah, self.helen)
        self.assertEqual(accounts.links(self.helen), {"helpers": [], "people": []})


if __name__ == "__main__":
    unittest.main()
