"""Reads a spoken command and turns it into an agenda event.

No language model: only keywords and rules, so the result is fast and predictable.

    "Add this in my agenda with Sarah at 12 pm on 8 of October at Carmel coffee"
    -> Coffee with Sarah, 8 October, 12:00, at Carmel coffee

Each piece of the sentence that is understood (the day, the time, the people...)
is masked, so that the next rules only look at what is left.
"""

import datetime as dt
import difflib
import re

MASK = "¦"

# ---- Vocabulary ----

MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4,
    "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8,
    "september": 9, "sept": 9, "sep": 9, "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}

_UNITS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"]
ORDINAL_WORDS = {w: i + 1 for i, w in enumerate(_UNITS)}
ORDINAL_WORDS.update({
    "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
    "twentieth": 20, "thirtieth": 30, "thirty first": 31,
})
ORDINAL_WORDS.update({f"twenty {w}": 21 + i for i, w in enumerate(_UNITS)})

# What the event is for. The first keyword found in the sentence gives the title.
ACTIVITIES = [
    (r"video ?call", "Video call"), (r"phone ?call|call", "Phone call"),
    (r"coffee|caf[eé]", "Coffee"), (r"tea", "Tea"), (r"breakfast", "Breakfast"),
    (r"brunch", "Brunch"), (r"lunch", "Lunch"), (r"dinner|supper", "Dinner"),
    (r"meal|restaurant", "Meal"), (r"drinks?", "Drink"), (r"walk", "Walk"),
    (r"appointment", "Appointment"), (r"meeting", "Meeting"), (r"visit", "Visit"),
    (r"birthday", "Birthday"), (r"party", "Party"), (r"chill|hang ?out", "Time together"),
    (r"cinema|movie|film", "Cinema"), (r"shopping", "Shopping"),
    (r"haircut|hairdresser", "Hairdresser"), (r"dentist", "Dentist"),
]

# ---- Patterns ----


def _alternation(words):
    return "|".join(sorted((w.replace(" ", "[ -]") for w in words), key=len, reverse=True))


_MONTH = _alternation(MONTHS)
_WEEKDAY = "|".join(WEEKDAYS)
_DAY = rf"\d{{1,2}}(?:st|nd|rd|th)?|{_alternation(ORDINAL_WORDS)}"
_NUM = rf"\d{{1,2}}|{_alternation(NUMBER_WORDS)}"
_AMPM = r"(?:a\.?m\.?|p\.?m\.?)(?![a-z])"
_AT = r"(?:\b(?:at|around|about)\s+)?"
# Where a name, a place or an activity stops.
_END = rf"(?=\s+(?:with|at|on|in|for|to|around|tomorrow|today|tonight|next|this)\b|\s*{MASK}|\s*[.;!?]|\s*$)"

_AGENDA = r"(?:agenda|calendar|schedule|planner)"
_VERB = r"(?:add|put|schedule|write|note|save|set|book|create|plan|enter)"
_IN_MY_AGENDA = rf"\b(?:in|to|into|on)\s+(?:my|the|your)\s+{_AGENDA}\b"
# "in my agenda" alone is enough: the speech model sometimes misses the first word ("Add").
TRIGGER = re.compile(
    rf"\b{_VERB}\b[^.?!]*?\b{_AGENDA}\b|{_IN_MY_AGENDA}|^\W*(?:please\s+)?schedule\b|\bremind me\b"
    r"|\bnew (?:appointment|event|meeting)\b",
    re.I,
)
_TRIGGER_PARTS = [
    _IN_MY_AGENDA,
    rf"\b(?:please\s+)?(?:can you\s+|could you\s+)?{_VERB}\b(?:\s+(?:this|that|it)\b)?",
    r"\bremind me\b(?:\s+(?:that|to|about|of)\b)?",
]


class _Sentence:
    """The sentence being read. `take` finds a pattern and masks it."""

    def __init__(self, text):
        self.text = text

    def take(self, pattern):
        match = re.search(pattern, self.text, re.I)
        if match:
            start, end = match.span()
            self.text = self.text[:start] + MASK * (end - start) + self.text[end:]
        return match


# ---- When ----


def _day_number(word):
    word = re.sub(r"(st|nd|rd|th)$", "", word.lower()) if word[0].isdigit() else word.lower()
    return int(word) if word.isdigit() else ORDINAL_WORDS.get(word.replace("-", " "))


def _date(year, month, day):
    try:
        return dt.date(year, month, day)
    except (ValueError, TypeError):
        return None


def _read_period(sentence):
    """Part of the day: 'morning', 'afternoon', 'evening'. Also tells if it means today."""
    if sentence.take(r"\btonight\b"):
        return "evening", True
    match = sentence.take(r"\b(in the|this)\s+(morning|afternoon|evening)\b")
    if match:
        return match.group(2).lower(), match.group(1).lower() == "this"
    return None, False


def _read_date(sentence, today):
    if sentence.take(r"\b(?:the\s+)?day after tomorrow\b"):
        return today + dt.timedelta(days=2)
    if sentence.take(r"\btomorrow\b"):
        return today + dt.timedelta(days=1)
    if sentence.take(r"\btoday\b"):
        return today

    # "on the 8th of October", "8 October 2026" / "October 8th"
    match = sentence.take(rf"\b(?:on\s+)?(?:the\s+)?({_DAY})\s+(?:of\s+)?({_MONTH})\b(?:,?\s+(\d{{4}}))?")
    if match:
        day, month, year = match.group(1), match.group(2), match.group(3)
    else:
        match = sentence.take(rf"\b(?:on\s+)?({_MONTH})\s+(?:the\s+)?({_DAY})\b(?:,?\s+(\d{{4}}))?")
        if match:
            month, day, year = match.group(1), match.group(2), match.group(3)
    if match:
        month = MONTHS[re.sub(r"[ -]", " ", month.lower())]
        if year:
            return _date(int(year), month, _day_number(day))
        date = _date(today.year, month, _day_number(day))
        # A day that is already past means next year.
        return _date(today.year + 1, month, _day_number(day)) if date and date < today else date

    # "on Friday", "next Monday": the next such day, never today.
    match = sentence.take(rf"\b(?:(?:on|this|next|coming)\s+)*({_WEEKDAY})\b")
    if match:
        ahead = (WEEKDAYS.index(match.group(1).lower()) - today.weekday()) % 7 or 7
        return today + dt.timedelta(days=ahead)

    # "on the 8th": this month, or next month if that day is past.
    match = sentence.take(rf"\bon\s+the\s+({_DAY})\b")
    if match:
        day = _day_number(match.group(1))
        date = _date(today.year, today.month, day)
        if date and date >= today:
            return date
        year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        return _date(year, month, day)

    return None


def _number(word):
    return int(word) if word.isdigit() else NUMBER_WORDS[word.lower()]


def _full_hour(hour, ampm, period):
    """Turn a spoken hour into a 24-hour one."""
    if ampm:
        if ampm[0].lower() == "p" and hour < 12:
            return hour + 12
        if ampm[0].lower() == "a" and hour == 12:
            return 0
        return hour
    if period in ("afternoon", "evening") and hour < 12:
        return hour + 12
    if period is None and 1 <= hour <= 7:
        return hour + 12  # "at 3" is taken as the afternoon
    return hour


def _read_time(sentence, period):
    """Return (hour, minute) or None."""
    hour = minute = ampm = None

    match = sentence.take(rf"{_AT}\b(half|quarter)\s+(past|to)\s+({_NUM})\b(?:\s*({_AMPM}))?")
    if match and not (match.group(1).lower() == "half" and match.group(2).lower() == "to"):
        part = 30 if match.group(1).lower() == "half" else 15
        total = _full_hour(_number(match.group(3)), match.group(4), period) * 60
        total += part if match.group(2).lower() == "past" else -part
        return (total // 60) % 24, total % 60

    if sentence.take(r"\b(?:at\s+)?(?:noon|midday)\b"):
        return 12, 0
    if sentence.take(r"\b(?:at\s+)?midnight\b"):
        return 0, 0

    for pattern in (
        rf"{_AT}\b(\d{{1,2}})\s*[:h.]\s*(\d{{2}})\b(?:\s*({_AMPM}))?",   # 12:30, 15h30, 3.30 pm
        rf"{_AT}\b(\d{{1,2}})\s+(\d{{2}})\s*({_AMPM})",                  # 3 30 pm
        rf"\bat\s+(\d{{1,2}})\s+(\d{{2}})\b(?:\s*({_AMPM}))?",            # at 9 30
    ):
        match = sentence.take(pattern)
        if match:
            hour, minute, ampm = int(match.group(1)), int(match.group(2)), match.group(3)
            break
    else:
        match = (
            sentence.take(rf"{_AT}\b({_NUM})\s*({_AMPM})")               # 12 pm, three p.m.
            or sentence.take(rf"{_AT}\b({_NUM})\s+o'?\s?clock\b")        # 3 o'clock
            or sentence.take(rf"\bat\s+({_NUM})\b")                      # at 3
        )
        if not match:
            return None
        hour, minute = _number(match.group(1)), 0
        ampm = match.group(2) if match.lastindex >= 2 else None

    hour = _full_hour(hour, ampm, period)
    return (hour, minute) if hour <= 23 and minute <= 59 else None


# ---- Who ----


def _normalize_name(name):
    return re.sub(r"^(dr\.?|doctor)\s+", "", name.strip().lower())


def _match_person(piece, known):
    """Find who `piece` ("Sarah", "my daughter", "doctor Martin", "Sara") refers to."""
    spoken = _normalize_name(re.sub(r"^my\s+", "", piece.strip(), flags=re.I))
    names = {_normalize_name(p["name"]): p for p in known}

    for name, person in names.items():
        if re.search(rf"\b{re.escape(name)}\b", spoken):
            return person
    for person in known:
        relationship = re.sub(r"^your\s+", "", (person.get("relationship") or "").lower())
        if relationship and relationship == spoken:
            return person
    # The speech model often misspells names: "Sara" for "Sarah".
    close = difflib.get_close_matches(spoken, names, n=1, cutoff=0.75)
    return names[close[0]] if close else None


def people_in(text, known):
    """The known people named in `text`, in the order they are named."""
    found = []
    for person in known:
        match = re.search(rf"\b{re.escape(_normalize_name(person['name']))}\b", text, re.I)
        if match:
            found.append((match.start(), person))
    return [person for _, person in sorted(found, key=lambda item: item[0])]


def people_meant(text, known):
    """Like `people_in`, plus people meant by their role: "the doctor", "my daughter"."""
    found = people_in(text, known)
    for person in known:
        role = re.sub(r"^your\s+", "", (person.get("relationship") or "").lower())
        if role and person not in found and re.search(rf"\b(?:my|the)\s+{re.escape(role)}\b", text, re.I):
            found.append(person)
    return found


def _read_people(sentence, known):
    match = sentence.take(rf"\bwith\s+([^{MASK}.;!?]+?){_END}")
    if not match:
        # No "with": "I'm seeing Paul on Friday", "Sarah is coming for dinner".
        return [{"id": p["id"], "name": p["name"]} for p in people_in(sentence.text, known)]
    people = []
    for piece in re.split(r"\s*(?:,|\band\b|&)\s*", match.group(1)):
        piece = piece.strip(" ,")
        if not piece:
            continue
        person = _match_person(piece, known)
        entry = (
            {"id": person["id"], "name": person["name"]}
            if person
            else {"id": None, "name": piece[0].upper() + piece[1:]}
        )
        if entry not in people:
            people.append(entry)
    return people


# ---- Where and what for ----


def as_place(words, preposition="At"):
    """Write a place the way the agenda shows it: "the comer coffee" -> "At the comer coffee"."""
    words = re.sub(r"^(The|A|An)\b", lambda m: m.group(1).lower(), words.strip(" .,;!?"))
    return f"{preposition.capitalize()} {words}"


def _read_place(sentence):
    match = sentence.take(rf"\b(at|in)\s+((?!\d)[^{MASK}.,;!?]+?){_END}")
    return as_place(match.group(2), match.group(1)) if match else None


def _read_destination(sentence):
    """Where the user is going, when it is said with a verb: "go to the market", "visit the museum"."""
    match = sentence.take(
        rf"\b(?:go(?:ing)?\s+to|come\s+to|coming\s+to|visit(?:ing)?)\s+((?!\d)[^{MASK}.,;!?]+?){_END}"
    )
    return match.group(1).strip() if match else None


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
    match = re.search(rf"\bfor\s+(?:(?:a|an|some|the|our)\s+)?([a-z][a-z' -]*?){_END}", sentence.text, re.I)
    if match:
        return match.group(1).strip().capitalize()
    # "at Carmel coffee": the place itself says what it is for.
    return _find_activity(place) if place else None


# ---- The command ----


def parse_command(text, now, people=()):
    """Read `text` as an agenda command, when it contains a trigger such as "in my agenda".

    Returns {"recognized": False} when the sentence is not an agenda command.
    """
    if not TRIGGER.search(text):
        return {"recognized": False}
    return {"recognized": True, **read_event(text, now, people)}


def read_event(text, now, people=()):
    """Read the event described by `text`, heard at the datetime `now`.

    `people` are the known people: dicts with "id", "name" and optionally "relationship".
    """
    sentence = _Sentence(text)
    for part in _TRIGGER_PARTS:
        sentence.take(part)

    today = now.date()
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, today) or (today if means_today else None)
    time = _read_time(sentence, period)
    who = _read_people(sentence, list(people))
    place = _read_place(sentence)
    destination = None if place else _read_destination(sentence)
    if destination:
        place = f"At {destination}"
    activity = _read_activity(sentence, place)

    title = activity or (f"Go to {destination}" if destination else "Meeting")
    if who:
        names = [p["name"] for p in who]
        title += " with " + (" and ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 1 else names[0])

    return {
        "title": title,
        "activity": activity,
        "people": who,
        "date": date.isoformat() if date else None,
        "time": f"{time[0]:02d}:{time[1]:02d}" if time else None,
        "place": place,
        "missing": [name for name, value in (("date", date), ("time", time)) if not value],
    }
