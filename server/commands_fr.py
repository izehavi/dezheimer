"""Reads an agenda event said in French: the day, the time, who, where, what for.

The same way as commands.py for English: no language model, only words and rules.
Each piece of the sentence that is understood is masked, so that the next rules only
look at what is left.

    "Ajoute un café avec Sarah demain à 15h au café Carmel"
    -> Café avec Sarah, tomorrow, 15:00, Au café Carmel
"""

import datetime as dt
import difflib
import re

from .commands import MASK, _date, _Sentence

MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
NUMBER_WORDS = {
    "une": 1, "un": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8,
    "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
    "dix-sept": 17, "dix-huit": 18, "dix-neuf": 19, "vingt": 20, "vingt et une": 21, "vingt-et-une": 21,
    "vingt-deux": 22, "vingt-trois": 23,
}
MINUTE_WORDS = {"cinq": 5, "dix": 10, "quinze": 15, "vingt": 20, "vingt-cinq": 25, "trente": 30, "quarante": 40,
                "quarante-cinq": 45, "cinquante": 50}

# What the event is for. The first keyword found in the sentence gives the title.
ACTIVITIES = [
    (r"appel vid[ée]o|visio", "Appel vidéo"), (r"appel|coup de fil|t[ée]l[ée]phoner", "Appel"),
    (r"petit[- ]d[ée]jeuner", "Petit-déjeuner"), (r"brunch", "Brunch"), (r"d[ée]jeuner|d[ée]jeune", "Déjeuner"),
    (r"d[îi]ner|d[îi]ne|souper", "Dîner"), (r"caf[ée]", "Café"), (r"th[ée]", "Thé"),
    (r"repas|restaurant|resto", "Repas"), (r"verre|ap[ée]ro", "Verre"), (r"promenade|balade", "Promenade"),
    (r"rendez-vous|rdv", "Rendez-vous"), (r"r[ée]union", "Réunion"), (r"visite", "Visite"),
    (r"anniversaire", "Anniversaire"), (r"f[êe]te", "Fête"), (r"cin[ée]ma|film", "Cinéma"),
    (r"courses|shopping", "Courses"), (r"coiffeur|coiffeuse", "Coiffeur"), (r"dentiste", "Dentiste"),
    (r"kin[ée]", "Kiné"), (r"piscine|natation", "Piscine"),
]


def _alternation(words):
    return "|".join(sorted((re.escape(w).replace(r"\ ", "[ -]").replace(r"\-", "[ -]") for w in words), key=len, reverse=True))


_MONTH = _alternation(MONTHS)
_WEEKDAY = "|".join(WEEKDAYS)
_DAY = r"\d{1,2}(?:er)?|premier"
_NUM = rf"\d{{1,2}}|{_alternation(NUMBER_WORDS)}"
_AT = r"(?:\b(?:à|a|vers|pour)\s+)?"
# Where a name, a place or an activity stops.
_END = (rf"(?=\s+(?:avec|à|au|aux|chez|pour|vers|demain|aujourd'hui|ce|cet|cette|ensemble|{_WEEKDAY})\b"
        rf"|\s*{MASK}|\s*[.;!?,]|\s*$)")

_AGENDA = r"(?:agenda|calendrier|planning)"
_VERB = r"(?:ajoute[rz]?|mets|mettre|note[rz]?|inscris|[ée]cris|programme|pr[ée]vois|planifie|enregistre)"
_IN_MY_AGENDA = rf"\b(?:dans|à|sur)\s+(?:mon|l['’]|le|ton)\s*{_AGENDA}\b"
TRIGGER = re.compile(
    rf"\b{_VERB}\b[^.?!]*?\b{_AGENDA}\b|{_IN_MY_AGENDA}|\brappelle-moi\b|\bnouveau rendez-vous\b", re.I)
_TRIGGER_PARTS = [
    _IN_MY_AGENDA,
    rf"\b(?:s'il te pla[iî]t\s+)?(?:tu peux\s+|peux-tu\s+)?{_VERB}\b(?:\s+(?:[çc]a|cela))?",
    r"\brappelle-moi\b(?:\s+(?:que|qu['’]|de|d['’]))?",
]


# ---- When ----


def _day_number(word):
    word = word.lower()
    return 1 if word in ("premier", "1er") else int(re.sub(r"er$", "", word))


def _read_period(sentence):
    """Part of the day: 'morning', 'afternoon', 'evening'. Also tells if it means today."""
    match = sentence.take(r"\b(ce|cet)\s+(matin|apr[eè]s-midi|soir)\b")
    if match:
        return _PERIODS[match.group(2).lower().replace("è", "e")], True
    match = sentence.take(r"\b(?:le|du|dans l['’]|de l['’]|l['’]|en|dans la)\s*(matin|matin[ée]e|apr[eè]s-midi|soir|soir[ée]e)\b")
    if match:
        return _PERIODS[match.group(1).lower().replace("è", "e")], False
    # "demain après-midi", "vendredi soir"
    match = sentence.take(r"(?<=\w)\s+(matin|apr[eè]s-midi|soir)\b")
    if match:
        return _PERIODS[match.group(1).lower().replace("è", "e")], False
    return None, False


_PERIODS = {"matin": "morning", "matinee": "morning", "matinée": "morning", "apres-midi": "afternoon",
            "soir": "evening", "soiree": "evening", "soirée": "evening"}


def _read_date(sentence, today):
    if sentence.take(r"\bapr[eè]s-demain\b"):
        return today + dt.timedelta(days=2)
    if sentence.take(r"\bdemain\b"):
        return today + dt.timedelta(days=1)
    if sentence.take(r"\baujourd['’]hui\b"):
        return today

    # "le 8 octobre", "le 1er novembre 2026", "lundi 12 octobre"
    match = sentence.take(rf"\b(?:(?:{_WEEKDAY})\s+)?(?:le\s+)?({_DAY})\s+({_MONTH})\b(?:\s+(\d{{4}}))?")
    if match:
        month = MONTHS[match.group(2).lower()]
        day = _day_number(match.group(1))
        if match.group(3):
            return _date(int(match.group(3)), month, day)
        date = _date(today.year, month, day)
        # A day that is already past means next year.
        return _date(today.year + 1, month, day) if date and date < today else date

    # "vendredi", "lundi prochain", "ce jeudi": the next such day, never today.
    match = sentence.take(rf"\b(?:(?:ce|le)\s+)?({_WEEKDAY})(?:\s+prochain)?\b")
    if match:
        ahead = (WEEKDAYS.index(match.group(1).lower()) - today.weekday()) % 7 or 7
        return today + dt.timedelta(days=ahead)

    # "le 8": this month, or next month if that day is past.
    match = sentence.take(rf"\ble\s+({_DAY})\b(?!\s*(?:h\b|heures?))")
    if match:
        day = _day_number(match.group(1))
        date = _date(today.year, today.month, day)
        if date and date >= today:
            return date
        year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        return _date(year, month, day)
    return None


def _number(word):
    word = word.lower().replace(" ", "-")
    if word.isdigit():
        return int(word)
    return NUMBER_WORDS.get(word, NUMBER_WORDS.get(word.replace("-", " ")))


def _full_hour(hour, period):
    """Turn a spoken hour into a 24-hour one. French often says 15 heures already."""
    if period in ("afternoon", "evening") and hour < 12:
        return hour + 12
    if period is None and 1 <= hour <= 7:
        return hour + 12   # "à 3 heures" is taken as the afternoon
    return hour


def _read_time(sentence, period):
    """Return (hour, minute) or None."""
    if sentence.take(r"\b(?:à\s+)?midi(?:\s+et\s+demie)\b"):
        return 12, 30
    if sentence.take(r"\b(?:à\s+)?midi\b"):
        return 12, 0
    if sentence.take(r"\b(?:à\s+)?minuit\b"):
        return 0, 0

    # "15h30", "15 h 30", "15:30", "15 heures 30", "trois heures et demie", "dix heures moins le quart"
    match = sentence.take(
        rf"{_AT}\b({_NUM})\s*(?:h|heures?|:)\s*(?:(\d{{2}})|({_alternation(MINUTE_WORDS)})|(et\s+demie|et\s+quart|moins\s+le\s+quart))?(?![\w])")
    if match:
        hour = _number(match.group(1))
        if hour is None:
            return None
        minute = 0
        if match.group(2):
            minute = int(match.group(2))
        elif match.group(3):
            minute = MINUTE_WORDS[match.group(3).lower().replace(" ", "-")]
        elif match.group(4):
            extra = match.group(4).lower()
            minute = 30 if "demie" in extra else 15 if "et" in extra else -15
        total = _full_hour(hour, period) * 60 + minute
        hour, minute = (total // 60) % 24, total % 60
        return (hour, minute) if hour <= 23 else None

    # "à 3" alone
    match = sentence.take(rf"\bà\s+(\d{{1,2}})\b(?!\s*(?:ans?|km|kilom|minutes?|personnes?|euros?))")
    if match:
        hour = _full_hour(int(match.group(1)), period)
        return (hour, 0) if hour <= 23 else None
    return None


# ---- Who ----


def normalize_name(name):
    return re.sub(r"^(?:le |la )?(?:dr\.?|docteure?)\s+", "", name.strip().lower())


def _role(person):
    return re.sub(r"^(?:votre|vos|your)\s+", "", (person.get("relationship") or "").lower())


def match_person(piece, known):
    """Find who `piece` ("Sarah", "ma fille", "le docteur Martin", "Sara") refers to."""
    spoken = normalize_name(re.sub(r"^(?:mon|ma|mes|le|la|l['’])\s+", "", piece.strip(), flags=re.I))
    names = {normalize_name(p["name"]): p for p in known}
    for name, person in names.items():
        if re.search(rf"\b{re.escape(name)}\b", spoken):
            return person
    for person in known:
        if _role(person) and _role(person) == spoken:
            return person
    # The speech model often misspells names: "Sara" for "Sarah".
    close = difflib.get_close_matches(spoken, names, n=1, cutoff=0.75)
    return names[close[0]] if close else None


def people_in(text, known):
    """The known people named in `text`, in the order they are named."""
    found = []
    for person in known:
        match = re.search(rf"\b{re.escape(normalize_name(person['name']))}\b", text, re.I)
        if match:
            found.append((match.start(), person))
    return [person for _, person in sorted(found, key=lambda item: item[0])]


def people_meant(text, known):
    """Like `people_in`, plus people meant by their role: "le médecin", "ma fille"."""
    found = people_in(text, known)
    for person in known:
        role = _role(person)
        if role and person not in found and re.search(rf"\b(?:mon|ma|mes|le|la|l['’])\s*{re.escape(role)}\b", text, re.I):
            found.append(person)
    return found


def _read_people(sentence, known):
    match = sentence.take(rf"\bavec\s+([^{MASK}.;!?]+?){_END}")
    if not match:
        # No "avec": "Je vois Paul vendredi", "Sarah vient dîner".
        return [{"id": p["id"], "name": p["name"]} for p in people_in(sentence.text, known)]
    people = []
    for piece in re.split(r"\s*(?:,|\bet\b|&)\s*", match.group(1)):
        piece = piece.strip(" ,")
        if not piece:
            continue
        person = match_person(piece, known)
        entry = {"id": person["id"], "name": person["name"]} if person else {"id": None, "name": piece[0].upper() + piece[1:]}
        if entry not in people:
            people.append(entry)
    return people


# ---- Where and what for ----


def as_place(words, preposition="À"):
    """Write a place the way the agenda shows it: "au café Carmel" -> "Au café Carmel"."""
    words = words.strip(" .,;!?")
    preposition = preposition.strip()
    glue = "" if preposition.endswith(("'", "’")) else " "
    return f"{preposition[0].upper()}{preposition[1:].lower()}{glue}{words}"


_PLACE = rf"\b(à\s+la|à\s+l['’]|au|aux|à|chez|dans\s+le|dans\s+la|dans)\s*((?!\d)[^{MASK}.,;!?]+?)(?:{_END}|(?=\s*,))"
_GOING = r"\b(?:aller|vais|va|allons|irai|ira|passer|passe|faire un tour)\s+$"


def _read_place(sentence):
    """The place, and whether the user goes there: "je vais au marché"."""
    match = sentence.take(_PLACE)
    if not match:
        return None, False
    going = bool(re.search(_GOING, sentence.text[:match.start()], re.I))
    return as_place(match.group(2), match.group(1)), going


def _find_activity(text):
    found = []
    for pattern, label in ACTIVITIES:
        match = re.search(rf"\b(?:{pattern})\b", text, re.I)
        if match:
            found.append((match.start(), label))
    return min(found)[1] if found else None


def _read_activity(sentence, place):
    activity = _find_activity(sentence.text)
    if activity:
        return activity
    match = re.search(rf"\bpour\s+(?:(?:un|une|le|la|les|l['’]|du|des)\s*)([a-zà-ÿ][a-zà-ÿ' -]*?){_END}", sentence.text, re.I)
    if match:
        return match.group(1).strip().capitalize()
    # "aller nager", "je vais grimper"
    match = re.search(r"\b(?:aller|vais|va|allons|envie d['’]aller|envie de)\s+([a-zà-ÿ]+(?:er|ir|re))\b", sentence.text, re.I)
    if match and match.group(1).lower() not in ("aller", "faire", "être", "voir"):
        return match.group(1).capitalize()
    # "au café Carmel": the place itself says what it is for.
    return _find_activity(place) if place else None


# ---- The command ----


def parse_command(text, now, people=()):
    """Read `text` as an agenda command, when it contains a trigger such as "dans mon agenda"."""
    if not TRIGGER.search(text):
        return {"recognized": False}
    return {"recognized": True, **read_event(text, now, people)}


def read_event(text, now, people=()):
    """Read the event described by `text`, heard at the datetime `now`."""
    sentence = _Sentence(text)
    for part in _TRIGGER_PARTS:
        sentence.take(part)

    today = now.date()
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, today) or (today if means_today else None)
    time = _read_time(sentence, period)
    who = _read_people(sentence, list(people))
    place, going = _read_place(sentence)
    activity = _read_activity(sentence, place)

    if activity:
        title = activity
    elif place and going:
        title = f"Aller {place[0].lower()}{place[1:]}"
    else:
        title = "Rendez-vous"
    if who:
        names = [p["name"] for p in who]
        title += " avec " + (" et ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 1 else names[0])

    return {
        "title": title,
        "activity": activity,
        "people": who,
        "date": date.isoformat() if date else None,
        "time": f"{time[0]:02d}:{time[1]:02d}" if time else None,
        "place": place,
        "missing": [name for name, value in (("date", date), ("time", time)) if not value],
    }
