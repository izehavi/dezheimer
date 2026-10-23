"""Requests said in French: what is asked, and its details. Run with: python -m unittest discover tests

Most sentences here are not among the examples of intents_fr.py, so that the meaning,
and not the exact words, is tested.
"""

import datetime as dt
import unittest

from server.assistant_fr import assist
from server.commands_fr import parse_command, read_event

NOW = dt.datetime(2026, 10, 23, 10, 0)  # a Friday
PEOPLE = [
    {"id": "sarah", "name": "Sarah", "relationship": "Votre fille"},
    {"id": "paul", "name": "Paul", "relationship": "Votre ami"},
    {"id": "rose", "name": "Rose", "relationship": "Votre amie et voisine"},
    {"id": "emma", "name": "Emma", "relationship": "Votre petite-fille"},
    {"id": "martin", "name": "Dr. Martin", "relationship": "Votre médecin"},
    {"id": "david", "name": "David", "relationship": "Votre fils"},
]


def hear(text, **more):
    return assist(text, NOW, PEOPLE, **more)


class Events(unittest.TestCase):
    def event(self, text):
        e = read_event(text, NOW, PEOPLE)
        return e["title"], e["date"], e["time"], e["place"], [p["name"] for p in e["people"]]

    def test_a_coffee(self):
        self.assertEqual(self.event("Ajoute un café avec Sarah demain à 15h au café Carmel"),
                         ("Café avec Sarah", "2026-10-24", "15:00", "Au café Carmel", ["Sarah"]))

    def test_going_somewhere(self):
        self.assertEqual(self.event("Je vais au marché demain à 10 heures"),
                         ("Aller au marché", "2026-10-24", "10:00", "Au marché", []))

    def test_times_said_in_words(self):
        self.assertEqual(self.event("Je vois Paul le 12 novembre à trois heures et demie de l'après-midi")[1:3],
                         ("2026-11-12", "15:30"))
        self.assertEqual(self.event("Dîner avec David vendredi soir à 8 heures")[1:3], ("2026-10-30", "20:00"))
        self.assertEqual(self.event("Déjeuner avec Rose dimanche à midi")[1:3], ("2026-10-25", "12:00"))
        self.assertEqual(self.event("Rendez-vous lundi à 10 heures moins le quart")[1:3], ("2026-10-26", "09:45"))
        self.assertEqual(self.event("Thé avec Rose après-demain à 16h30")[1:3], ("2026-10-25", "16:30"))

    def test_a_person_by_their_role(self):
        self.assertEqual(self.event("Déjeuner avec ma fille et Paul vendredi à midi")[4], ["Sarah", "Paul"])

    def test_at_someones_home(self):
        self.assertEqual(self.event("Dîner chez Sarah ce soir à 20 heures")[1:4], ("2026-10-23", "20:00", "Chez Sarah"))

    def test_the_listen_screen_needs_the_agenda(self):
        self.assertTrue(parse_command("Mets dans mon agenda un café avec Rose demain à 10h", NOW, PEOPLE)["recognized"])
        self.assertFalse(parse_command("Il fait beau aujourd'hui", NOW, PEOPLE)["recognized"])


class Requests(unittest.TestCase):
    def test_add_an_event_and_ask_what_is_missing(self):
        r = hear("J'ai un rendez-vous chez le coiffeur demain")
        self.assertEqual((r["intent"], r["asked"], r["ask"]), ("add_event", "time", "À quelle heure ?"))
        r = hear(r["text"], intent="add_event", asked="time", answer="dix heures et quart")
        self.assertEqual(r["event"]["time"], "10:15")

    def test_move_an_event(self):
        r = hear("Tu peux repousser le dîner avec David à samedi ?")
        self.assertEqual(r["intent"], "change_event")
        self.assertEqual((r["target"]["personIds"], r["new"]["date"]), (["david"], "2026-10-24"))

    def test_move_to_another_place(self):
        r = hear("Le café avec Rose sera plutôt à la boulangerie")
        self.assertEqual((r["intent"], r["new"]["place"]), ("change_event", "À la boulangerie"))

    def test_cancel(self):
        r = hear("Je n'irai pas chez le médecin finalement, annule-le")
        self.assertEqual((r["intent"], r["target"]["personIds"]), ("cancel_event", ["martin"]))

    def test_a_new_person(self):
        r = hear("Ajoute une nouvelle personne, elle s'appelle Julie, c'est ma nièce, je l'ai rencontrée à la chorale")
        self.assertEqual(r["intent"], "add_person")
        self.assertEqual((r["person"]["name"], r["person"]["relationship"]), ("Julie", "Votre nièce"))
        self.assertEqual(r["person"]["origin"], "Vous vous êtes rencontrés à la chorale.")

    def test_who_someone_is(self):
        r = hear("Paul, c'est mon frère")
        self.assertEqual((r["intent"], r["update"]["relationship"]), ("update_person", "Votre frère"))

    def test_a_connection(self):
        r = hear("Anne est la sœur de Rose")
        self.assertEqual(r["intent"], "add_connection")
        self.assertEqual((r["connection"]["b"]["id"], r["connection"]["label"]), ("rose", "sœur"))

    def test_a_memo(self):
        r = hear("Souviens-toi que David a trouvé un nouveau travail")
        self.assertEqual((r["intent"], r["memo"]["personId"], r["memo"]["text"]),
                         ("add_memo", "david", "David a trouvé un nouveau travail."))

    def test_a_note_in_the_second_person(self):
        r = hear("Retiens que mon parapluie est dans l'entrée")
        self.assertEqual((r["intent"], r["memo"]["text"]), ("add_memo", "Votre parapluie est dans l'entrée."))

    def test_questions(self):
        self.assertEqual(hear("Qu'est-ce que j'ai de prévu demain après-midi ?")["intent"], "ask_agenda")
        r = hear("C'est quand que je revois Sarah ?")
        self.assertEqual((r["intent"], r["mode"], r["personId"]), ("ask_agenda", "next", "sarah"))
        self.assertEqual(hear("Qu'est-ce que j'ai fait avant-hier ?")["intent"], "ask_diary")
        r = hear("Qui c'est, Rose ?")
        self.assertEqual((r["intent"], r["personId"]), ("ask_person", "rose"))
        self.assertEqual(hear("Comment va Emma en ce moment ?")["topic"], "news")
        self.assertEqual(hear("On est quel jour aujourd'hui ?")["intent"], "ask_time")

    def test_search(self):
        r = hear("Où est-ce que j'ai mis mes lunettes ?")
        self.assertEqual(r["intent"], "search")
        self.assertIn("lunettes", r["query"])

    def test_a_misheard_name_is_asked_about(self):
        r = hear("Quand est-ce que je vois Ross ?")
        self.assertEqual(r["suggest"]["name"], "Rose")

    def test_a_greeting(self):
        self.assertEqual(hear("Bonjour, je m'appelle Itay")["intent"], "greet")


if __name__ == "__main__":
    unittest.main()
