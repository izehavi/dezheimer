"""Sentences from the improvement mode: real requests, as the speech model wrote them.

Each test is a request that went wrong on 2026-10-08, with what the tester wanted,
or one that went right and must keep working. Run with: python -m unittest discover tests
"""

import datetime as dt
import unittest

from server.assistant import assist

NOW = dt.datetime(2026, 10, 8, 10, 0)  # a Thursday
PEOPLE = [
    {"id": "sarah", "name": "Sarah", "relationship": "Your daughter"},
    {"id": "david", "name": "David", "relationship": "Your son"},
    {"id": "nadia", "name": "Nadia", "relationship": "Your home helper"},
    {"id": "martin", "name": "Dr. Martin", "relationship": "Your doctor"},
    {"id": "elinor", "name": "Elinor", "relationship": "Someone you know"},
    {"id": "lothan", "name": "Lothan", "relationship": "Your sister"},
    {"id": "elan", "name": "Elan", "relationship": "Someone you know"},
]


def hear(text, **more):
    return assist(text, NOW, PEOPLE, **more)


class WhatWentWrong(unittest.TestCase):
    def test_change_the_place_of_a_meeting(self):
        # Wanted: change the place from the comer coffee to Pesto pizza. The app "changed" the time to the same time.
        r = hear("Change the place of the meeting with Elinor of tomorrow.")
        self.assertEqual((r["intent"], r["asked"], r["ask"]), ("change_event", "new_place", "What is the new place?"))
        self.assertEqual((r["target"]["personIds"], r["target"]["date"]), (["elinor"], "2026-10-09"))
        r = hear(r["text"], intent="change_event", asked="new_place", answer="Pesto pizza")
        self.assertEqual(r["new"], {"date": None, "time": None, "place": "At Pesto pizza"})
        self.assertEqual((r["target"]["personIds"], r["target"]["date"]), (["elinor"], "2026-10-09"))

    def test_change_the_place_in_one_sentence(self):
        r = hear("Move the meeting with Elinor to the Italian restaurant.")
        self.assertEqual((r["intent"], r["new"]["place"]), ("change_event", "At the Italian restaurant"))

    def test_information_about_a_person_is_not_a_search(self):
        # Wanted: information about Nadia. The app searched for the whole sentence.
        for text in ["We saw some information about Nadia.", "Give me some information about Nadia.",
                     "information about Nadia"]:
            r = hear(text)
            self.assertEqual((r["intent"], r.get("personId")), ("ask_person", "nadia"), text)

    def test_information_about_a_misheard_name_asks(self):
        # "It should correct to Elinor, which is a close name."
        r = hear("information about Eleanor")
        self.assertEqual((r["intent"], r["suggest"]["name"]), ("ask_person", "Elinor"))

    def test_memo_about_someone_even_with_a_day_in_it(self):
        # Wanted: a memo that Elinor starts her job on Friday. The app tried to create an event.
        r = hear("Mimo about Elinor. She's gonna start her work on Friday.")
        self.assertEqual(r["intent"], "add_memo")
        self.assertEqual(r["memo"], {"personId": "elinor", "about": "Elinor", "text": "She's gonna start her work on Friday."})

    def test_she_is_my_sister_about_a_known_person(self):
        # Wanted: note that Elinor is my sister. The app asked for the name of a new person.
        for text in ["I want to add an information about Elinor. She is my sister.", "Elinor is my sister."]:
            r = hear(text)
            self.assertEqual(r["intent"], "update_person", text)
            self.assertEqual(r["update"], {"personId": "elinor", "name": "Elinor",
                                           "relationship": "Your sister", "link": "sister"}, text)

    def test_the_link_between_someone_and_me(self):
        # Wanted: to know the link between David and me. The app answered "Say it like this: ...".
        for text in ["to know the link of David and me.", "What is the link between David and me?"]:
            r = hear(text)
            self.assertEqual((r["intent"], r["personId"], r["topic"]), ("ask_person", "david", "origin"), text)

    def test_new_person_named_after_the_words_new_person(self):
        # The app created a person called "Ad".
        self.assertEqual(hear("Ad, a new person, Lothar.")["person"]["name"], "Lothar")
        self.assertEqual(hear("A new person, Ilana.")["person"]["name"], "Ilana")

    def test_relationship_does_not_swallow_the_name(self):
        # The app wrote "your sister Lothan".
        r = hear("This is my sister.", intent="add_person")
        r = hear(r["text"], intent="add_person", answer="Monica")
        self.assertEqual((r["person"]["name"], r["person"]["relationship"]), ("Monica", "Your sister"))

    def test_you_is_not_a_name(self):
        # "You" is what the speech model writes for a short "yes".
        r = hear("Add a new person.", intent="add_person", answer="You")
        self.assertIsNone(r["person"])

    def test_a_fact_about_a_known_person_is_a_memo(self):
        # Wanted: add that Lothan works in chemistry. The app answered "Say it like this: ...".
        r = hear("Yes, Lothan, she's walking in chemistry.")
        self.assertEqual((r["intent"], r["memo"]["personId"]), ("add_memo", "lothan"))
        self.assertEqual(r["memo"]["text"], "Lothan, she's walking in chemistry.")

    def test_i_want_to_go_is_a_new_event(self):
        # Wanted: go alone to the park at 2 pm. The app looked for an event to change.
        r = hear("I want to go alone to the part at 2 p.m.")
        self.assertEqual((r["intent"], r["event"]["time"], r["event"]["place"]), ("add_event", "14:00", "At the part"))
        self.assertEqual((r["event"]["missing"], r["ask"]), (["date"], "On which day?"))

    def test_in_the_morning_gets_a_more_precise_question(self):
        # The app asked "At what time?" twice in a row.
        r = hear("Coffee with Sarah on Friday", intent="add_event", asked="time", answer="In the morning.")
        self.assertEqual(r["ask"], "At what time in the morning? For example: at 9.")

    def test_place_answer_starting_with_the(self):
        # The agenda showed "At The comer coffee".
        r = hear("Add a meeting at 11 a.m. with Elinor tomorrow", intent="add_event", asked="place", answer="The comer coffee")
        self.assertEqual(r["event"]["place"], "At the comer coffee")


class WhatWentRight(unittest.TestCase):
    def test_remove_a_meeting(self):
        r = hear("Remove the meeting with Elan.")
        self.assertEqual((r["intent"], r["target"]["personIds"], r["target"]["words"]), ("cancel_event", ["elan"], ["meeting"]))

    def test_add_a_meeting_step_by_step(self):
        r = hear("Add a meeting at 11 a.m. with Elinor.")
        self.assertEqual((r["intent"], r["event"]["time"], r["asked"]), ("add_event", "11:00", "date"))

    def test_plan_of_tomorrow(self):
        r = hear("What do I have to do tomorrow?")
        self.assertEqual((r["intent"], r["mode"], r["date"]), ("ask_agenda", "day", "2026-10-09"))

    def test_this_is_my_sister_asks_for_the_name(self):
        r = hear("This is my sister.")
        self.assertEqual((r["intent"], r["ask"]), ("add_person", "What is the name of the person?"))


if __name__ == "__main__":
    unittest.main()
