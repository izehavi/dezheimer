"""The things of every day on the server: reminders when the app is closed, and the relatives told."""

import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from server import accounts, routine

PILLS = {"id": "pills-morning", "text": "Take the morning pills", "time": "08:00", "days": [], "kind": "pills"}
LUNCH = {"id": "lunch", "text": "Lunch", "time": "12:30", "days": [], "kind": "meal"}
BINS = {"id": "bins", "text": "Take out the bins", "time": "18:00", "days": [2], "kind": "other"}   # Tuesdays
WATER = {"id": "water", "text": "Water the plants", "time": "", "days": [], "kind": "other"}
WEDNESDAY = dt.date(2026, 10, 21)


def at(hour, minute=0, date=WEDNESDAY):
    return dt.datetime.combine(date, dt.time(hour, minute))


class Due(unittest.TestCase):
    def due(self, now, done=(), sent=()):
        return [(t["id"], what) for t, what in routine.due([PILLS, LUNCH, BINS, WATER], set(done), set(sent), now)]

    def test_at_the_time(self):
        self.assertEqual(self.due(at(7, 59)), [])
        self.assertEqual(self.due(at(8, 0)), [("pills-morning", "time")])
        self.assertEqual(self.due(at(8, 5)), [("pills-morning", "time")])

    def test_not_twice(self):
        self.assertEqual(self.due(at(8, 1), sent=[("pills-morning", "time")]), [])

    def test_not_when_done(self):
        self.assertEqual(self.due(at(8, 0), done=["pills-morning"]), [])
        self.assertEqual(self.due(at(9, 0), done=["pills-morning"]), [])

    def test_again_half_an_hour_later(self):
        self.assertEqual(self.due(at(8, 30), sent=[("pills-morning", "time")]), [("pills-morning", "again")])

    def test_the_relatives_after_45_minutes_for_pills(self):
        self.assertEqual(self.due(at(8, 44), sent=[("pills-morning", "time"), ("pills-morning", "again")]), [])
        self.assertEqual(self.due(at(8, 45), sent=[("pills-morning", "time"), ("pills-morning", "again")]),
                         [("pills-morning", "relatives")])

    def test_the_relatives_after_two_hours_for_a_meal(self):
        self.assertEqual(self.due(at(14, 29), sent=[("lunch", "time"), ("lunch", "again")]), [])
        self.assertEqual(self.due(at(14, 30), sent=[("lunch", "time"), ("lunch", "again")]), [("lunch", "relatives")])

    def test_nobody_told_for_other_things(self):
        self.assertNotIn(("bins", "relatives"), self.due(at(23, 0, dt.date(2026, 10, 20))))

    def test_not_sent_late_when_the_server_was_off(self):
        self.assertEqual(self.due(at(8, 12)), [])

    def test_only_on_its_days(self):
        self.assertEqual(self.due(at(18, 0)), [])                                  # a Wednesday
        self.assertEqual(self.due(at(18, 0, dt.date(2026, 10, 20))), [("bins", "time")])   # a Tuesday


class Messages(unittest.TestCase):
    def test_the_pill_box(self):
        self.assertEqual(routine.box(PILLS, WEDNESDAY), "Wednesday morning")
        self.assertEqual(routine.box({**PILLS, "time": "21:00"}, WEDNESDAY), "Wednesday night")
        self.assertEqual(routine.box({**PILLS, "time": "12:30"}, WEDNESDAY), "Wednesday midday")

    def test_for_the_person(self):
        m = routine.message(PILLS, "time", "Helen", WEDNESDAY)
        self.assertEqual(m["title"], "Helen, it is time")
        self.assertIn("Take them from the box: Wednesday morning.", m["body"])
        self.assertEqual(m["url"], "/#/day/now/pills-morning")

    def test_for_the_relatives(self):
        m = routine.message(PILLS, "relatives", "Helen", WEDNESDAY)
        self.assertEqual(m["title"], "Helen has not noted: Take the morning pills")
        self.assertIn("look at the pill box, at Wednesday morning", m["body"])

    def test_in_french(self):
        self.assertEqual(routine.box(PILLS, WEDNESDAY, "fr"), "mercredi matin")
        m = routine.message(PILLS, "time", "Hélène", WEDNESDAY, "fr")
        self.assertEqual(m["title"], "Hélène, c'est l'heure")
        self.assertIn("Prenez-les dans la case : mercredi matin.", m["body"])
        m = routine.message(PILLS, "relatives", "Hélène", WEDNESDAY, "fr")
        self.assertEqual(m["title"], "Hélène n'a pas noté : Take the morning pills")
        self.assertIn("à la case du mercredi matin", m["body"])

    def test_local_time(self):
        utc = dt.datetime(2026, 10, 21, 6, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(routine.local_now("Europe/Paris", 0, utc), at(8, 0))
        self.assertEqual(routine.local_now("Not/AZone", 180, utc), at(9, 0))


class Run(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        patch = mock.patch.object(accounts, "DATA_DIR", Path(folder.name))
        patch.start()
        self.addCleanup(patch.stop)
        accounts._wrong_codes.clear()
        self.helen = accounts.user_for(accounts.sign_up("helen@example.com", "password1")["token"])
        self.sarah = accounts.user_for(accounts.sign_up("sarah@example.com", "password2")["token"])
        accounts.join(self.sarah, accounts.invite(self.helen, "Helen")["code"], "Sarah")
        accounts.subscribe(self.helen, "https://push.example/helen", "k", "a")
        accounts.subscribe(self.sarah, "https://push.example/sarah", "k", "a")
        accounts.set_routine(self.helen, "Helen", [PILLS, LUNCH], "Europe/Paris", 120, [], [])
        self.sent = []

    def send(self, subscription, message):
        self.sent.append((subscription["endpoint"].rsplit("/", 1)[1], message["title"]))
        return 201

    def run_at(self, hour, minute):
        # 08:00 in Paris is 06:00 UTC in October.
        routine.run(dt.datetime(2026, 10, 21, hour - 2, minute, tzinfo=dt.timezone.utc), self.send)

    def test_a_morning_without_the_pills(self):
        self.run_at(8, 0)
        self.run_at(8, 1)
        self.run_at(8, 30)
        self.run_at(8, 45)
        self.assertEqual(self.sent, [
            ("helen", "Helen, it is time"),
            ("helen", "Helen, a small reminder"),
            ("sarah", "Helen has not noted: Take the morning pills"),
        ])

    def test_done_on_the_phone_stops_everything(self):
        self.run_at(8, 0)
        done = [{"task_id": "pills-morning", "day": "2026-10-21", "at": 0, "how": "button"}]
        accounts.set_routine(self.helen, "Helen", [PILLS, LUNCH], "Europe/Paris", 120, done, ["2026-10-21"])
        self.run_at(8, 30)
        self.run_at(8, 45)
        self.assertEqual(self.sent, [("helen", "Helen, it is time")])

    def test_each_phone_in_its_language(self):
        accounts.subscribe(self.sarah, "https://push.example/sarah", "k", "a", "fr")
        titles = []
        send = lambda subscription, message: titles.append(message["title"]) or 201
        for minute in (0, 30, 45):
            routine.run(dt.datetime(2026, 10, 21, 6, minute, tzinfo=dt.timezone.utc), send)
        # The person's phone in English, the relative's in French.
        self.assertEqual(titles, ["Helen, it is time", "Helen, a small reminder", "Helen n'a pas noté : Take the morning pills"])

    def test_the_open_app_reminds_by_itself(self):
        accounts.seen(self.helen)
        self.run_at(8, 0)
        self.assertEqual(self.sent, [])
        # The relatives are still told: the app open does not mean the pills were taken.
        self.run_at(8, 45)
        self.assertEqual(self.sent, [("sarah", "Helen has not noted: Take the morning pills")])

    def test_what_the_relative_sees(self):
        done = [{"task_id": "pills-morning", "day": "2026-10-21", "at": 1, "how": "box"}]
        accounts.set_routine(self.helen, "Helen", [PILLS, LUNCH], "Europe/Paris", 120, done, ["2026-10-21"])
        seen = routine.today_of(accounts.routine_of(self.helen), dt.datetime(2026, 10, 21, 13, 0, tzinfo=dt.timezone.utc))
        self.assertEqual(seen["day"], "2026-10-21")
        self.assertEqual([(t["id"], bool(t["done"]), t["late"]) for t in seen["tasks"]],
                         [("pills-morning", True, False), ("lunch", False, True)])   # 15:00 in Paris
        self.assertEqual(seen["tasks"][0]["done"]["how"], "box")


if __name__ == "__main__":
    unittest.main()
