"""The voice assistant: finds what a sentence asks for, and reads its details.

`intents.py` says what the user wants (add an event, ask about a person...).
This module then reads the details with rules: who, when, what. It only
understands the request; the app keeps the data and carries the request out.
"""

import datetime as dt
import difflib
import re

from .commands import (
    NUMBER_WORDS, _match_person, _normalize_name, _read_date, _read_period, _read_time, _Sentence,
    as_place, people_in, people_meant, read_event,
)
from .intents import classifier

# A name as the speech model writes it: capitalized, sometimes with a title.
NAME = r"(?:Dr\.? )?[A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)?"
# Capitalized words that open a sentence without being a name.
_NOT_A_NAME = {
    "add", "please", "i", "my", "she", "he", "this", "remember", "meet", "new", "the", "a", "an", "her",
    "his", "can", "could", "create", "save", "note", "there", "we", "it", "link", "they", "also", "and",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february",
    "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    # Words the speech model writes with a capital, or hears instead of "yes".
    "ad", "you", "yes", "no", "ok", "okay", "thank", "thanks", "information", "memo", "mimo", "tomorrow",
    "today", "in", "at", "on", "with", "alone", "nowhere", "to", "is", "what", "who", "when", "where", "how",
}


def to_second_person(text):
    """Turn what the user said about themselves into what the app tells them: "my keys" -> "your keys"."""
    swaps = [
        (r"\bI am\b|\bI'm\b", "you are"), (r"\bI have\b|\bI've\b", "you have"), (r"\bI will\b|\bI'll\b", "you will"),
        (r"\bI\b", "you"), (r"\bme\b", "you"), (r"\bmy\b", "your"), (r"\bmine\b", "yours"),
        (r"\bmyself\b", "yourself"),
    ]
    for pattern, replacement in swaps:
        text = re.sub(pattern, replacement, text, flags=re.I)
    text = text.strip(" ,;:")
    if not text:
        return ""
    text = text[0].upper() + text[1:]
    return text if text[-1] in ".!?" else text + "."


def _entry(person):
    return {"id": person["id"], "name": person["name"]}


def _resolve(name, people):
    """A named person: the known one if there is one, otherwise a new name."""
    person = _match_person(name, people)
    return _entry(person) if person else {"id": None, "name": name.strip()}


# ---- Add an event ----


# An event needs a day, a time, a place and who it is with. The user can say that
# there is no place, or nobody else.
_ALONE = r"\b(?:alone|by myself|on my own|with (?:nobody|no one)|nobody|no one|just me)\b"
_NOWHERE = r"\b(?:nowhere|no place|no particular place|anywhere)\b"
_QUESTIONS = {
    "date": "On which day?",
    "time": "At what time?",
    "place": "Where is it?",
    "people": "With whom? If it is only you, say: alone.",
}


def _add_event(text, now, people):
    alone = re.search(_ALONE, text, re.I)
    nowhere = re.search(_NOWHERE, text, re.I)
    event = read_event(re.sub(rf"{_ALONE}|{_NOWHERE}", "", text, flags=re.I), now, people)
    if not event["place"] and not nowhere:
        event["missing"].append("place")
    if not event["people"] and not alone:
        event["missing"].append("people")
    asked = event["missing"][0] if event["missing"] else None
    question = _QUESTIONS[asked] if asked else None
    part = re.search(r"\b(morning|afternoon|evening)\b", text, re.I)
    if asked == "time" and part:
        # "In the morning" was said: ask for the hour, not the same question again.
        question = f"At what time in the {part.group(1).lower()}? For example: at {dict(morning=9, afternoon=3, evening=7)[part.group(1).lower()]}."
    return {"event": event, "ask": question, "asked": asked}


def _with_answer(text, answer, asked):
    """Add the user's answer to the words already said, so that the whole can be read again.

    The answer to "Where is it?" is often just "Carmel coffee": the missing "at" is added.
    """
    text = text.rstrip(" .!?")
    answer = answer.strip(" .!?")
    if asked == "name":
        return _with_name(text, answer)
    if asked in ("place", "new_place"):
        # "Park Leumi, Ramat Gan" is one place: its commas must not cut it.
        answer = re.sub(r"\s*[,;.!?]+\s*", " ", answer).strip()
    if asked == "place" and not re.match(rf"(?:at|in)\b|{_NOWHERE}", answer, re.I):
        answer = f"at {answer}"
    elif asked == "new_place":
        answer = "to " + re.sub(r"^(?:to|at|in)\s+", "", answer, flags=re.I)
    elif asked == "people" and not re.match(rf"with\b|{_ALONE}", answer, re.I):
        answer = f"with {answer}"
    elif asked == "time" and re.match(r"\d|half|quarter", answer, re.I):
        answer = f"at {answer}"
    return f"{text} {answer}"


_PRONOUN = r"^\W*(?:(?:yes|ok|okay|so|and|well)\W+)?(?:she|he|they)(?:'s| is| are)?\b"


def _with_name(text, answer):
    """The answer to "What is the name of the person?", put back into what was said.

    "She is my aunt" + "Rebecca" -> "Rebecca is my aunt". An answer that is a whole
    sentence ("Rebecca is my aunt") replaces what was said.
    """
    if re.search(r"(?i)\b(?:is|my|called|named)\b", answer):
        return answer
    name = answer.split()[-1] if answer.split() else answer
    name = name[:1].upper() + name[1:]
    if re.match(_PRONOUN, text, re.I):
        return re.sub(_PRONOUN, f"{name} is", text, count=1, flags=re.I)
    return f"{text}. The name is {name}"


# What people say while they think. It is not an answer.
_NOT_AN_ANSWER = re.compile(r"^\W*(?:u+m+|u+h+|e+r+m*|h+m+|m+h*m+|well|so|hello|hi|hey|wait|sorry)?\W*$", re.I)


# ---- Change or cancel an event ----

# Words that say what to do, not which event is meant.
_NOT_THE_EVENT = {
    "cancel", "cancelled", "canceled", "delete", "remove", "erase", "forget", "move", "moved", "change",
    "changed", "reschedule", "rescheduled", "postpone", "postponed", "push", "pushed", "back", "bring",
    "forward", "the", "with", "from", "agenda", "calendar", "not", "going", "coming", "anymore", "more",
    "any", "after", "all", "can", "you", "could", "please", "off", "take", "now", "has", "have", "been",
    "don", "time", "day", "will", "for", "and", "that", "this", "instead", "next", "put", "does", "isn",
    "place", "location", "address", "where", "want", "hide",
}


def _target(text, now, people):
    """Describe which event is meant: who it is with, when it is, and the words of its title."""
    sentence = _Sentence(text)
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, now.date()) or (now.date() if means_today else None)
    time = _read_time(sentence, period)
    persons = people_meant(text, people)
    names = {word for p in persons for word in _normalize_name(p["name"]).split()}
    roles = {word for p in persons for word in (p.get("relationship") or "").lower().split()}
    words = [
        word for word in re.findall(r"[a-z]+", sentence.text.lower())
        if len(word) > 2 and word not in _NOT_THE_EVENT and word not in names and word not in roles
    ]
    return {
        "personIds": [p["id"] for p in persons],
        "date": date.isoformat() if date else None,
        "time": f"{time[0]:02d}:{time[1]:02d}" if time else None,
        "words": words,
    }


def _cancel_event(text, now, people):
    return {"target": _target(text, now, people)}


def _new_moment(text, now):
    sentence = _Sentence(text)
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, now.date()) or (now.date() if means_today else None)
    time = _read_time(sentence, period)
    return {"date": date.isoformat() if date else None, "time": f"{time[0]:02d}:{time[1]:02d}" if time else None}


def _change_event(text, now, people):
    nothing = {"date": None, "time": None, "place": None}
    # "Move the lunch with Sarah on Friday | to | Saturday at 1 pm": the event, then its new moment.
    for split in re.finditer(r"\s(?:to|till|until|is now|are now|will be|has been moved to|for)\s", text, re.I):
        new = _new_moment(text[split.end():], now)
        if new["date"] or new["time"]:
            return {"target": _target(text[:split.start()], now, people), "new": {**nothing, **new}, "ask": None}

    # "Change the place of the lunch with Sarah | to | Pesto pizza", "Move the dinner | to | the Italian restaurant".
    about_place = re.search(r"\b(?:place|location|address|where)\b", text, re.I)
    splits = list(re.finditer(r"\s(?:to|will be at|is now at)\s", text, re.I))
    if splits:
        new_place = text[splits[-1].end():].strip(" .!?")
        if new_place and (about_place or len(new_place.split()) <= 5):
            return {
                "target": _target(text[:splits[-1].start()], now, people),
                "new": {**nothing, "place": as_place(re.sub(r"^(?:at|in)\s+", "", new_place, flags=re.I))},
                "ask": None,
            }
    if about_place:
        return {"target": _target(text, now, people), "new": nothing, "ask": "What is the new place?", "asked": "new_place"}

    # No clear split: the day and time said are the new ones.
    new = _new_moment(text, now)
    target = {**_target(text, now, people), "date": None, "time": None}
    return {
        "target": target, "new": {**nothing, **new},
        "ask": None if new["date"] or new["time"] else "To which day or time?",
    }


# ---- Names that were not heard exactly ----

SURE = 0.85    # this close to a known name: it is that person
MAYBE = 0.6    # this close: ask "Do you mean ...?"
# A capitalized word that opens a sentence is taken as a name only before one of these.
_AFTER_NAME = r"(?:'s|\s+(?:is|and|told|said|says|has|will|comes?|coming)\b)"
# A capitalized word after one of these is a place, not a person: "go to Rome", "in Paris".
_BEFORE_A_PLACE = r"\b(?:to|in|at|near|from)\s+(?:the\s+)?(?:[A-Z][a-zà-ÿ]+\s+)?$"


def _sound(name):
    """A rough spelling of how a name sounds: "Sarah" and "Sara" give the same."""
    name = re.sub(r"(.)\1", r"\1", name.lower())
    name = name.replace("ph", "f").replace("ck", "k").replace("c", "k").replace("y", "i")
    return re.sub(r"[he]$", "", name)


def _closeness(a, b):
    """How close two names are, from 0 to 1. Names that sound alike are at least worth asking about."""
    spelling = difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()
    sound = difflib.SequenceMatcher(None, _sound(a), _sound(b)).ratio()
    return max(spelling, MAYBE) if sound >= 0.8 and spelling < MAYBE else spelling


def check_names(text, people):
    """Find names that are close to a known person without being exactly theirs.

    Returns (text, suggestion). A very close name is corrected in the text ("Sara" -> "Sarah").
    A name that is only fairly close is returned as a suggestion, for the app to ask about.
    """
    known = {_normalize_name(p["name"]): p for p in people}
    said = text   # positions are read in the sentence as it was said
    suggestion = None
    for match in re.finditer(rf"(?:Dr\.? )?([A-Z][a-zà-ÿ]+)", said):
        word = match.group(1)
        if word.lower() in known or word.lower() in _NOT_A_NAME:
            continue
        before = said[:match.start()]
        opens = not before.strip() or before.rstrip()[-1] in ".!?:"
        if opens and not re.match(_AFTER_NAME, said[match.end(1):], re.I):
            continue   # "Put", "Dinner", "Who": a word that only has a capital because it comes first
        if re.search(_BEFORE_A_PLACE, before, re.I):
            continue
        score, name = max((_closeness(word, name), name) for name in known) if known else (0, None)
        if score >= SURE:
            text = re.sub(rf"\b{re.escape(word)}\b", known[name]["name"].replace("Dr. ", ""), text)
        elif score >= MAYBE and not suggestion:
            suggestion = {"heard": word, "name": known[name]["name"], "personId": known[name]["id"]}
    return text, suggestion


# ---- Add a person ----


def _new_name(text, people):
    match = re.search(rf"(?i:named|called|name is|name's)\s+({NAME}|[a-zà-ÿ]+)", text)
    if match:
        return match.group(1)[0].upper() + match.group(1)[1:]
    # "Add a new person, Lothan."
    match = re.search(rf"(?i:new (?:person|friend|contact|neighbou?r))\W+({NAME})", text)
    if match and match.group(1).lower() not in _NOT_A_NAME:
        return match.group(1)
    match = re.search(rf"(?i:\bmy)\s+[a-z' -]+?\s({NAME})", text)
    if match and match.group(1).lower() not in _NOT_A_NAME:
        return match.group(1)
    known = {re.sub(r"^(dr\.?|doctor)\s+", "", p["name"].lower()) for p in people}
    for match in re.finditer(NAME, text):
        word = match.group(0)
        if word.lower() not in _NOT_A_NAME and word.lower() not in known:
            return word
    return None


_IS_MY = r"(?i)\b(?:is|she's|he's|she is|he is|this is)\s+(?:also\s+)?my\s+([a-z' -]+?)(?=[.,;!?]|\s+(?:and|who|from|at|in|she|he|i|we)\b|$)"


def _relationship_update(text, people):
    """ "Elinor is my sister", about someone already known: their relationship changes. """
    if re.search(r"(?i)\bnew (?:person|friend|contact|neighbou?r)\b|\bnamed\b|\bcalled\b", text):
        return None
    named = people_in(text, people)
    match = re.search(_IS_MY, text)
    if not (named and match):
        return None
    link = match.group(1).strip()
    return {
        "intent": "update_person",
        "update": {"personId": named[0]["id"], "name": named[0]["name"], "relationship": f"Your {link}", "link": link},
    }


def _add_person(text, now, people):
    update = _relationship_update(text, people)
    if update:
        return update
    name = _new_name(text, people)
    if not name:
        return {"person": None, "ask": "What is the name of the person?", "asked": "name"}

    known = _match_person(name, people)
    if known and known["name"].lower() == name.lower():
        return {"person": _entry(known), "known": True}

    relationship = link = connection = None
    escaped = re.escape(name)
    # "she is my niece", "Tom, my nephew", "my cousin Peter"
    # The name itself is not part of the relationship: "This is my sister Lothan" -> "sister".
    match = (
        re.search(rf"(?i)\bmy\s+([a-z' -]+?)\s+{escaped}\b", text)
        or re.search(r"(?i)(?:\bis|'s|,|:)\s+(?:also\s+)?my\s+([a-z' -]+?)(?=[.,;!?]|\s+(?:and|who|from|at|in|she|he|i|we)\b|$)", text)
    )
    if match:
        link = match.group(1).strip()
        relationship = f"Your {link}"
    else:
        # "she is Rose's daughter": the link goes through someone else.
        match = re.search(rf"({NAME})'s\s+([a-z-]+(?: [a-z-]+)?)(?=[.,;!?]|\s+(?:and|who|from|at|in)\b|$)", text)
        if match and match.group(1) != name:
            other = _resolve(match.group(1), people)
            link = match.group(2).strip()
            relationship = f"{other['name']}'s {link}"
            connection = {
                "a": {"id": None, "name": name}, "b": other, "label": link,
                "text": f"{name} is {other['name']}'s {link}",
            }

    origin = None
    match = re.search(
        rf"(?i)\b(?:i|we)\s+(?:first\s+|just\s+)?(met|know|knew)\s+(?:her|him|them|each other|{escaped})?\s*"
        r"((?:at|in|from|through|when|during|on)\b[^.!?]*)", text)
    if match:
        verb = "met" if match.group(1).lower() == "met" else "know each other"
        origin = to_second_person(f"You {verb} {match.group(2).strip()}")

    return {
        "person": {"id": None, "name": name, "relationship": relationship, "link": link, "origin": origin},
        "connection": connection,
    }


# ---- Add a connection ----

_REL = r"([a-z][a-z' -]+?)"
_STOP = r"(?=[.,;!?]|$)"
_CONNECTIONS = [
    # (pattern, how to read it: a, b, label, sentence)
    (rf"({NAME}) is (?:also )?({NAME})'s {_REL}{_STOP}", lambda m: (m[1], m[2], m[3], f"{m[1]} is {m[2]}'s {m[3]}")),
    (rf"({NAME}) is (?:the |a |an )?{_REL} of ({NAME})", lambda m: (m[1], m[3], m[2], f"{m[1]} is {m[3]}'s {m[2]}")),
    (rf"({NAME}) is married to ({NAME})", lambda m: (m[1], m[2], "married", f"{m[1]} is married to {m[2]}")),
    (rf"({NAME}) and ({NAME})(?:, they)? are {_REL}{_STOP}", lambda m: (m[1], m[2], m[3], f"{m[1]} and {m[2]} are {m[3]}")),
    (rf"({NAME}) knows ({NAME})", lambda m: (m[1], m[2], "know each other", f"{m[1]} knows {m[2]}")),
]


def _add_connection(text, now, people):
    if re.search(rf"{NAME} is (?:also )?my\b", text):
        return {"intent": "add_person", **_add_person(text, now, people)}
    for pattern, read in _CONNECTIONS:
        match = re.search(pattern, text)
        if match:
            a, b, label, sentence = read(match)
            a, b = _resolve(a, people), _resolve(b, people)
            # Write the sentence again with the names as they are known ("Sara" -> "Sarah").
            sentence = sentence.replace(match[1], a["name"], 1).replace(read(match)[1], b["name"], 1)
            return {"connection": {"a": a, "b": b, "label": label.strip(), "text": sentence}}
    # Not a link between two people. If it is about someone known, it is a memo about them:
    # "Lothan, she is working in chemistry."
    if people_in(text, people):
        return {"intent": "add_memo", **_add_memo(text, now, people)}
    return {"connection": None, "ask": "Say it like this: Julie is Sarah's daughter."}


# ---- Add a memo ----

_MEMO_LEAD = re.compile(
    r"^\W*(?:(?:yes|ok|okay|so|well)\W+)?(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:(?:i (?:want|would like|'d like) to )?(?:remember|ad+s? (?:and )?(?:an? |some |another |other )*(?:memo|note|information|info))"
    r"|note(?: down)?(?: for later)?|write (?:this |it )?down|make a note"
    r"|keep in mind|don'?t forget|keep a (?:memo|note)|save this|(?:an? )?m[ie]m+o|information|info)\b"
    r"(?:\s+(?:about|on|for)\s+(?P<about>[^:,.]+?)\s*(?:[:,.]|$))?\s*(?:\bthat\b|[:,.])?\s*",
    re.I,
)
# "Yes, Lothan, she is working..." -> "Lothan, she is working..."
_FILLER = re.compile(r"^\W*(?:yes|ok|okay|so|well)\W+", re.I)


def _add_memo(text, now, people):
    lead = _MEMO_LEAD.match(text)
    content = text[lead.end():] if lead else _FILLER.sub("", text)
    about = lead.group("about") if lead else None

    person = _match_person(about, people) if about else None
    if not person and not about:
        named = people_in(content, people)
        person = named[0] if named else None

    # "Memo about Elinor. She is my sister": this is who she is, not news about her.
    is_my = re.search(_IS_MY, content)
    if person and is_my and len(content.split()) <= 6:
        link = is_my.group(1).strip()
        return {
            "intent": "update_person",
            "update": {"personId": person["id"], "name": person["name"], "relationship": f"Your {link}", "link": link},
        }

    memo_text = to_second_person(content)
    if not memo_text:
        return {"memo": None, "ask": f"What should I remember about {person['name']}?" if person else "What should I remember?"}
    subject = person["name"] if person else (about.strip().capitalize() if about else "Note")
    return {"memo": {"personId": person["id"] if person else None, "about": subject, "text": memo_text}}


# ---- Questions ----


def _asked_person(text, people):
    named = people_in(text, people)
    if named:
        return named[0]
    match = re.search(r"(?i)\bmy\s+([a-z' -]+?)(?=[.,;!?]|\s+(?:is|to|again|on|at|doing)\b|$)", text)
    return _match_person(f"my {match.group(1)}", people) if match else None


def _ask_agenda(text, now, people):
    today = now.date()
    sentence = _Sentence(text)
    week = sentence.take(r"\b(this|next)\s+week\b")
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, today) or (today if means_today else None)
    person = _asked_person(text, people)

    if week:
        start = today + dt.timedelta(days=7 if week.group(1).lower() == "next" else 0)
        return {"mode": "week", "date": start.isoformat(), "personId": person["id"] if person else None}
    # "What is my next appointment?", "When do I see Sarah?"
    if not date and (person or re.search(r"\bnext\b|\bwhen\b", sentence.text, re.I)):
        return {"mode": "next", "date": None, "personId": person["id"] if person else None}
    return {
        "mode": "day", "date": (date or today).isoformat(), "period": period,
        "personId": person["id"] if person else None,
    }


def _ask_diary(text, now, people):
    today = now.date()
    numbers = {**NUMBER_WORDS, **{str(n): n for n in range(1, 31)}}
    match = re.search(r"(?i)\b(\w+)\s+days?\s+ago\b", text)
    if match and match.group(1).lower() in numbers:
        date = today - dt.timedelta(days=numbers[match.group(1).lower()])
    else:
        date = _read_date(_Sentence(text), today)
        if date and date > today:
            date -= dt.timedelta(days=7)   # "on Sunday" means last Sunday when asking about the past
    return {"date": (date or today - dt.timedelta(days=1)).isoformat()}


def _ask_person(text, now, people):
    person = _asked_person(text, people)
    if re.search(r"(?i)\bhow do i know\b|\bwhere did (?:i|we) meet\b|\bfrom where\b|\bhow did (?:i|we) meet\b"
                 r"|\blink\b|\brelated\b|\brelation\w*\b|\bconnection\b", text):
        topic = "origin"
    elif re.search(r"(?i)\bnews?\b|\blatest\b|\blately\b|\bhow is\b|\bup to\b", text):
        topic = "news"
    else:
        topic = "who"
    unknown = None
    if not person:
        match = re.search(rf"(?<!^)(?<![.!?] )({NAME})", text)
        unknown = match.group(1) if match else None
    return {"personId": person["id"] if person else None, "unknownName": unknown, "topic": topic}


_SEARCH_LEAD = re.compile(
    r"^\W*(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:search|find|look (?:for|up)|what did i (?:note|write)|what do i know|where (?:is|are))\s*"
    r"(?:my (?:notes|memory) for\s+|for\s+|about\s+)?(?:anything about\s+|what i noted about\s+|the word\s+)?",
    re.I,
)


# Words that carry no meaning in a search.
_SEARCH_NOISE = {
    "we", "saw", "some", "information", "info", "about", "give", "me", "i", "want", "to", "know", "anything",
    "something", "on", "the", "my", "a", "an", "for", "of", "please", "search", "find", "look", "up", "what",
    "do", "did", "note", "noted", "write", "wrote", "where", "is", "are", "in", "notes", "memory", "word",
    "tell", "show", "any", "there", "can", "you", "could", "and", "with", "have", "has",
}


def _search(text, now, people):
    query = _SEARCH_LEAD.sub("", text)
    query = re.sub(r"(?i)\s+in my (?:notes|memory|diary|agenda)\b", "", query)
    words = [w for w in re.findall(r"[\w'-]+", query) if w.lower() not in _SEARCH_NOISE]
    query = " ".join(words)
    return {"query": query, "ask": None if query else "What should I look for?"}


def _ask_time(text, now, people):
    return {"kind": "time" if re.search(r"(?i)\btime\b|\bhour\b|\bo'?clock\b", text) else "date"}


HANDLERS = {
    "add_event": _add_event, "change_event": _change_event, "cancel_event": _cancel_event,
    "add_person": _add_person, "add_connection": _add_connection,
    "add_memo": _add_memo, "ask_agenda": _ask_agenda, "ask_diary": _ask_diary,
    "ask_person": _ask_person, "search": _search, "ask_time": _ask_time, "update_person": _add_person,
}


# Requests where an unknown name is expected, so nothing is asked about it.
_NAMES_AS_SAID = {"add_person", "search", "ask_time", "help", None}


_GREETING = re.compile(
    r"^\W*(?:hi|hello|hey|bonjour|shalom|good (?:morning|afternoon|evening))\b(?:\W+\w+){0,2}\W*$"
    r"|\bmy name is\b|\bi am called\b", re.I)


def assist(text, now, people=(), intent=None, exact_names=False, asked=None, answer=None, recent=None):
    """Understand one sentence said to the assistant.

    When the assistant asked for a missing detail ("At what time?"), `text` is what was
    said before, `answer` is the reply, `asked` is the detail asked for, and `intent`
    is the intent already found.
    `exact_names` is set after the user answered "no" to "Do you mean ...?".
    `recent` is the name of the person the user and the app just talked about: "She is
    my aunt", said right after adding Rebecca, is about Rebecca.
    Returns {"intent", "score", "text", ...details}; intent is None when nothing was
    understood, and "text" is the whole request so far.
    """
    people = list(people)
    score = None
    if answer and _NOT_AN_ANSWER.match(answer):
        answer = None   # "Um...": the same question is asked again
    if answer:
        text = _with_answer(text, answer, asked)
    if intent is None:
        if _GREETING.search(text):
            return {"intent": "greet", "score": 1.0, "text": text}
        if recent and not people_in(text, people) and re.match(_PRONOUN, text, re.I):
            verb = " is" if re.match(r"^\W*(?:\w+\W+)?(?:she|he|they)(?:'s| is| are)\b", text, re.I) else ""
            text = re.sub(_PRONOUN, f"{recent}{verb}", text, count=1, flags=re.I)
        intent, score = classifier.classify(text, [p["name"] for p in people])
    # A place is not a person: nothing is asked about the names in the answer to "Where is it?".
    if answer and asked in ("place", "new_place"):
        exact_names = True

    # "Information about Nadia" is a question about a person, not a search of the notes.
    if intent == "search" and (people_meant(text, people) or (not exact_names and check_names(text, people)[1])):
        intent = "ask_person"

    if intent not in _NAMES_AS_SAID and not exact_names:
        text, suggestion = check_names(text, people)
        if suggestion:
            return {"intent": intent, "score": score, "text": text, "suggest": suggestion}

    handler = HANDLERS.get(intent)
    details = handler(text, now, people) if handler else {}
    return {"intent": intent, "score": score, "text": text, **details}
