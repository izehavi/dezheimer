"""Run with: python -m unittest discover tests

The first class tests how details are read, with the intent given. The second
loads the real sentence model (a few seconds) and tests whole sentences.
"""

import datetime as dt
import unittest

from server.assistant import assist, to_second_person

NOW = dt.datetime(2026, 10, 7, 19, 0)  # a Wednesday
PEOPLE = [
    {"id": "sarah", "name": "Sarah", "relationship": "Your daughter"},
    {"id": "david", "name": "David", "relationship": "Your son"},
    {"id": "leo", "name": "Leo", "relationship": "Your grandson"},
    {"id": "rose", "name": "Rose", "relationship": "Your friend and neighbour"},
    {"id": "paul", "name": "Paul", "relationship": "Your friend"},
    {"id": "martin", "name": "Dr. Martin", "relationship": "Your doctor"},
]


def read(intent, text):
    return assist(text, NOW, PEOPLE, intent=intent)


class DetailsTest(unittest.TestCase):
    def test_event_said_without_the_word_agenda(self):
        event = read("add_event", "I plan to go to the market tomorrow at 10")["event"]
        self.assertEqual((event["title"], event["date"], event["time"], event["place"]),
                         ("Go to the market", "2026-10-08", "10:00", "At the market"))

    def test_event_with_a_person_named_without_with(self):
        event = read("add_event", "On Friday at 11 I'm seeing Paul at the cafe.")["event"]
        self.assertEqual(([p["id"] for p in event["people"]], event["date"], event["time"]),
                         (["paul"], "2026-10-09", "11:00"))

    def test_event_missing_time_asks_for_it(self):
        self.assertEqual(read("add_event", "Dinner with David tomorrow")["ask"], "At what time?")

    def test_event_needs_a_place_and_a_person(self):
        r = read("add_event", "Dinner tomorrow at 7 pm")
        self.assertEqual((r["event"]["missing"], r["asked"], r["ask"]), (["place", "people"], "place", "Where is it?"))
        r = read("add_event", "Dinner with David tomorrow at 7 pm at home")
        self.assertEqual((r["event"]["missing"], r["ask"]), ([], None))

    def test_the_answers_complete_the_event(self):
        said = "I have an appointment tomorrow"
        r = assist(said, NOW, PEOPLE, intent="add_event")
        self.assertEqual(r["asked"], "time")
        r = assist(r["text"], NOW, PEOPLE, intent="add_event", asked="time", answer="3 pm")
        self.assertEqual((r["event"]["time"], r["asked"]), ("15:00", "place"))
        r = assist(r["text"], NOW, PEOPLE, intent="add_event", asked="place", answer="Carmel coffee.")
        self.assertEqual((r["event"]["place"], r["asked"]), ("At Carmel coffee", "people"))
        r = assist(r["text"], NOW, PEOPLE, intent="add_event", asked="people", answer="Sarah and Leo")
        self.assertEqual(([p["id"] for p in r["event"]["people"]], r["ask"]), (["sarah", "leo"], None))
        self.assertEqual(r["event"]["title"], "Appointment with Sarah and Leo")

    def test_alone_and_nowhere_are_accepted_answers(self):
        r = assist("Go for a walk tomorrow at 10", NOW, PEOPLE, intent="add_event", asked="place", answer="nowhere")
        self.assertEqual(r["asked"], "people")
        r = assist(r["text"], NOW, PEOPLE, intent="add_event", asked="people", answer="alone")
        self.assertEqual((r["event"]["missing"], r["event"]["people"], r["event"]["place"]), ([], [], None))

    def test_time_said_as_two_numbers(self):
        self.assertEqual(read("add_event", "An appointment at the bank next Tuesday at 9 30")["event"]["time"], "09:30")

    def test_new_person_with_relationship_and_origin(self):
        r = read("add_person", "Add a new person, her name is Julie, she is my niece. I met her at the choir.")
        self.assertEqual(r["person"], {"id": None, "name": "Julie", "relationship": "Your niece",
                                       "link": "niece", "origin": "You met at the choir."})

    def test_new_person_linked_through_someone(self):
        r = read("add_person", "Create a new contact named Anne, she is Rose's daughter.")
        self.assertEqual(r["person"]["relationship"], "Rose's daughter")
        self.assertEqual((r["connection"]["b"]["id"], r["connection"]["text"]), ("rose", "Anne is Rose's daughter"))

    def test_new_person_said_as_my_cousin(self):
        r = read("add_person", "Add my cousin Peter to my people.")
        self.assertEqual((r["person"]["name"], r["person"]["relationship"]), ("Peter", "Your cousin"))

    def test_person_without_a_name_asks_for_it(self):
        self.assertEqual(read("add_person", "Add a new person.")["ask"], "What is the name of the person?")

    def test_person_already_known(self):
        self.assertTrue(read("add_person", "Add a new person called Sarah")["known"])

    def test_connections(self):
        for text, a, b, label in [
            ("Julie is Sarah's daughter.", "Julie", "sarah", "daughter"),
            ("Monica is the cousin of Paul.", "Monica", "paul", "cousin"),
            ("Claire is married to David.", "Claire", "david", "married"),
            ("Paul and Rose are cousins.", "Paul", "rose", "cousins"),
        ]:
            c = read("add_connection", text)["connection"]
            self.assertEqual((c["a"]["name"], c["b"]["id"], c["label"]), (a, b, label), text)

    def test_memos(self):
        memo = read("add_memo", "Remember that Sarah got a new dog.")["memo"]
        self.assertEqual(memo, {"personId": "sarah", "about": "Sarah", "text": "Sarah got a new dog."})
        memo = read("add_memo", "Add a memo about Leo: he started a new job.")["memo"]
        self.assertEqual((memo["personId"], memo["text"]), ("leo", "He started a new job."))
        memo = read("add_memo", "I want to remember that my keys are in the blue bowl.")["memo"]
        self.assertEqual(memo, {"personId": None, "about": "Note", "text": "Your keys are in the blue bowl."})

    def test_second_person(self):
        self.assertEqual(to_second_person("David told me I'm invited"), "David told you you are invited.")

    def test_agenda_questions(self):
        self.assertEqual(read("ask_agenda", "What do I have tomorrow?")["date"], "2026-10-08")
        self.assertEqual(read("ask_agenda", "What is my plan for today?")["date"], "2026-10-07")
        r = read("ask_agenda", "When do I see Sarah?")
        self.assertEqual((r["mode"], r["personId"]), ("next", "sarah"))
        self.assertEqual(read("ask_agenda", "What is my next appointment?")["mode"], "next")
        self.assertEqual(read("ask_agenda", "Anything in my agenda this week?")["mode"], "week")

    def test_diary_questions(self):
        self.assertEqual(read("ask_diary", "What did I do yesterday?")["date"], "2026-10-06")
        self.assertEqual(read("ask_diary", "What happened on Sunday?")["date"], "2026-10-04")
        self.assertEqual(read("ask_diary", "What happened two days ago?")["date"], "2026-10-05")

    def test_person_questions(self):
        r = read("ask_person", "Who is Rose?")
        self.assertEqual((r["personId"], r["unknownName"], r["topic"]), ("rose", None, "who"))
        self.assertEqual(read("ask_person", "How do I know Paul?")["topic"], "origin")
        self.assertEqual(read("ask_person", "Any news from Leo?")["topic"], "news")
        self.assertEqual(read("ask_person", "Tell me about my doctor.")["personId"], "martin")
        self.assertEqual(read("ask_person", "Who is Bernard?")["unknownName"], "Bernard")

    def test_search(self):
        self.assertEqual(read("search", "Search for the radiator.")["query"], "radiator")
        self.assertEqual(read("search", "Look for Canada in my notes.")["query"], "Canada")
        self.assertEqual(read("search", "Where are my keys?")["query"], "keys")


    def test_cancel_describes_the_event(self):
        target = read("cancel_event", "Cancel the lunch with Sarah tomorrow.")["target"]
        self.assertEqual((target["personIds"], target["date"], target["words"]), (["sarah"], "2026-10-08", ["lunch"]))
        target = read("cancel_event", "Cancel my appointment with the doctor.")["target"]
        self.assertEqual((target["personIds"], target["words"]), (["martin"], ["appointment"]))

    def test_change_separates_the_event_from_its_new_moment(self):
        r = read("change_event", "Move my appointment with the doctor on Friday to Monday at 10 30.")
        self.assertEqual((r["target"]["personIds"], r["target"]["date"]), (["martin"], "2026-10-09"))
        self.assertEqual(r["new"], {"date": "2026-10-12", "time": "10:30", "place": None})
        r = read("change_event", "The dinner with David is now at 8 pm.")
        self.assertEqual((r["target"]["personIds"], r["new"]), (["david"], {"date": None, "time": "20:00", "place": None}))
        r = read("change_event", "Postpone the walk with Rose to Saturday.")
        self.assertEqual(r["new"], {"date": "2026-10-10", "time": None, "place": None})
        self.assertEqual(read("change_event", "Change the lunch with Sarah.")["ask"], "To which day or time?")

    def test_a_close_name_is_asked_about(self):
        r = read("ask_person", "Who is Ross?")
        self.assertEqual(r["suggest"], {"heard": "Ross", "name": "Rose", "personId": "rose"})
        self.assertEqual(read("ask_agenda", "When do I see Pauline?")["suggest"]["name"], "Paul")

    def test_a_very_close_name_is_corrected_without_asking(self):
        self.assertEqual(read("ask_person", "Who is Sara?")["personId"], "sarah")
        self.assertEqual(read("add_memo", "Remember that Davide got a new car.")["memo"]["personId"], "david")

    def test_names_are_not_questioned_when_adding_a_person(self):
        r = read("add_person", "Add a new person, her name is Rosa.")
        self.assertNotIn("suggest", r)
        self.assertEqual(r["person"]["name"], "Rosa")

    def test_a_refused_suggestion_is_not_asked_again(self):
        r = assist("Who is Ross?", NOW, PEOPLE, intent="ask_person", exact_names=True)
        self.assertEqual((r.get("suggest"), r["unknownName"]), (None, "Ross"))

    def test_other_names_are_left_alone(self):
        self.assertNotIn("suggest", read("ask_person", "Who is Bernard?"))
        self.assertNotIn("suggest", read("add_event", "Put a dentist appointment on Friday at 10"))


class AccountsTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        from server import accounts
        self.accounts = accounts
        self.folder = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.saved_dir, accounts.DATA_DIR = accounts.DATA_DIR, Path(self.folder.name)

    def tearDown(self):
        self.accounts.DATA_DIR = self.saved_dir
        import gc
        gc.collect()  # closes the database before the folder is removed
        self.folder.cleanup()

    def test_sign_up_sign_in_and_backup(self):
        a = self.accounts
        token = a.sign_up("Helen@Example.com", "correct horse")["token"]
        user = a.user_for(token)
        self.assertIsNotNone(user)
        self.assertEqual(a.load(user)["version"], 0)
        self.assertEqual(a.save(user, {"events": [1]}, 0)["version"], 1)

        other_device = a.sign_in("helen@example.com", "correct horse")["token"]
        self.assertEqual(a.load(a.user_for(other_device))["doc"], {"events": [1]})
        # A device that has not seen version 1 cannot overwrite it.
        with self.assertRaises(a.Conflict):
            a.save(user, {"events": []}, 0)

        a.sign_out(token)
        self.assertIsNone(a.user_for(token))

    def test_refusals(self):
        a = self.accounts
        a.sign_up("helen@example.com", "correct horse")
        for email, password in [("helen@example.com", "another password"), ("not an email", "correct horse"),
                                ("new@example.com", "short")]:
            with self.assertRaises(a.AccountError):
                a.sign_up(email, password)
        with self.assertRaises(a.AccountError):
            a.sign_in("helen@example.com", "wrong password")
        self.assertIsNone(a.user_for("made-up-token"))


class WholeSentenceTest(unittest.TestCase):
    """The intent is found by the sentence model."""

    CASES = [
        ("add_event", "I plan to go to the theatre with Rose on Saturday at 8 pm."),
        ("add_event", "Add a coffee with Sarah to my agenda tomorrow at 3 pm."),
        ("change_event", "Move the walk with Rose to Sunday at 4."),
        ("change_event", "My lunch with Sarah is now at 1 pm."),
        ("cancel_event", "Cancel the video call with Leo."),
        ("cancel_event", "I am not going to the dentist on Friday anymore."),
        ("add_person", "I'd like to add a new person, she's called Monica."),
        ("add_connection", "Bernard is Rose's husband."),
        ("add_memo", "Remember that Paul does not eat fish."),
        ("ask_agenda", "What do I have today?"),
        ("ask_diary", "What did I do yesterday?"),
        ("ask_person", "Who is Dr. Martin?"),
        ("search", "Search for the wifi password."),
        ("ask_time", "What day is it?"),
        (None, "This cake is delicious."),
    ]

    def test_intents(self):
        for expected, text in self.CASES:
            self.assertEqual(assist(text, NOW, PEOPLE)["intent"], expected, text)


if __name__ == "__main__":
    unittest.main()
