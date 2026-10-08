"""Run with: python -m unittest discover tests"""

import datetime as dt
import unittest

from server.commands import parse_command

NOW = dt.datetime(2026, 10, 7, 19, 0)  # a Wednesday
PEOPLE = [
    {"id": "sarah", "name": "Sarah", "relationship": "Your daughter"},
    {"id": "david", "name": "David", "relationship": "Your son"},
    {"id": "leo", "name": "Leo", "relationship": "Your grandson"},
    {"id": "paul", "name": "Paul", "relationship": "Your friend"},
    {"id": "martin", "name": "Dr. Martin", "relationship": "Your doctor"},
]


def read(text):
    return parse_command(text, NOW, PEOPLE)


def ids(result):
    return [p["id"] for p in result["people"]]


class ParseCommandTest(unittest.TestCase):
    def test_the_reference_sentence(self):
        r = read("Add this in my agenda with Sarah at 12 pm on 8 of October at Carmel coffee.")
        self.assertTrue(r["recognized"])
        self.assertEqual(r["date"], "2026-10-08")
        self.assertEqual(r["time"], "12:00")
        self.assertEqual(ids(r), ["sarah"])
        self.assertEqual(r["place"], "At Carmel coffee")
        self.assertEqual(r["title"], "Coffee with Sarah")
        self.assertEqual(r["missing"], [])

    def test_the_reference_sentence_as_the_speech_model_writes_it(self):
        r = read("Add this in my agenda with Sarah at 12pm on 8th of October at Carmel Coffee")
        self.assertEqual((r["date"], r["time"], r["place"]), ("2026-10-08", "12:00", "At Carmel Coffee"))

    def test_first_word_missed_by_the_speech_model(self):
        r = read("This in my agenda with Sarah at 12pm on 8 October at Carmel Coffee.")
        self.assertEqual((r["title"], r["date"], r["time"]), ("Coffee with Sarah", "2026-10-08", "12:00"))

    def test_ordinary_talk_is_not_a_command(self):
        self.assertFalse(read("It is a lovely day today, I had lunch with Sarah.")["recognized"])

    def test_several_people_and_a_misspelled_name(self):
        r = read("Add a lunch with Sara and Leo to my calendar tomorrow at half past twelve.")
        self.assertEqual(ids(r), ["sarah", "leo"])
        self.assertEqual((r["date"], r["time"]), ("2026-10-08", "12:30"))
        self.assertEqual(r["title"], "Lunch with Sarah and Leo")
        self.assertIsNone(r["place"])

    def test_weekday_and_part_of_the_day(self):
        r = read("Put in my agenda a walk with my friend Paul on Friday at 3 in the afternoon in the park")
        self.assertEqual((r["date"], r["time"]), ("2026-10-09", "15:00"))
        self.assertEqual(ids(r), ["paul"])
        self.assertEqual(r["place"], "In the park")
        self.assertEqual(r["activity"], "Walk")

    def test_remind_me_with_a_doctor(self):
        r = read("Remind me that I have an appointment with Doctor Martin next Monday at 10:30")
        self.assertEqual((r["date"], r["time"]), ("2026-10-12", "10:30"))
        self.assertEqual(ids(r), ["martin"])
        self.assertEqual(r["title"], "Appointment with Dr. Martin")

    def test_relationship_instead_of_a_name(self):
        self.assertEqual(ids(read("Add to my agenda a dinner with my son tomorrow at 7 pm")), ["david"])

    def test_unknown_person_is_kept_by_name(self):
        r = read("Add to my agenda a tea with Margaret tomorrow at 4 pm")
        self.assertEqual(r["people"], [{"id": None, "name": "Margaret"}])

    def test_month_first_and_evening_hour(self):
        r = read("Add to my agenda dinner with David on October 20th at 7 pm at home")
        self.assertEqual((r["date"], r["time"], r["place"]), ("2026-10-20", "19:00", "At home"))

    def test_a_past_day_means_next_year(self):
        r = read("Add to my agenda a meeting on the third of January at 9 am")
        self.assertEqual((r["date"], r["time"]), ("2027-01-03", "09:00"))

    def test_quarter_to(self):
        self.assertEqual(read("Add a coffee to my agenda tomorrow at quarter to 4")["time"], "15:45")

    def test_missing_day_and_time_are_reported(self):
        r = read("Add a dinner with David to my agenda")
        self.assertEqual(r["missing"], ["date", "time"])
        self.assertEqual(r["title"], "Dinner with David")

    def test_activity_said_with_for(self):
        r = read("Add to my agenda with Sarah tomorrow at 2 pm for a swim")
        self.assertEqual(r["title"], "Swim with Sarah")


if __name__ == "__main__":
    unittest.main()
