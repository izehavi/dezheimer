"""The voice assistant for requests said in French: the same requests as assistant.py.

`intents.py` says what the user wants (with the French examples of intents_fr.py); this
module reads the details with French rules, and writes what the app shows in French.
The app speaks to the user as "vous".
"""

import datetime as dt
import re

from .assistant import MAYBE, SURE, _closeness, _entry
from .commands_fr import (
    NUMBER_WORDS, _read_date, _read_period, _read_time, _Sentence, as_place, match_person, normalize_name,
    people_in, people_meant, read_event,
)
from .intents import classifier_for

# A name as the speech model writes it: capitalized, sometimes with a title.
NAME = r"(?:Dr\.? |Docteur )?[A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý][a-zà-ÿ]+)?"
# Capitalized words that open a sentence, or that the speech model writes with a capital, without being a name.
_NOT_A_NAME = {
    "ajoute", "ajouter", "je", "j", "mon", "ma", "mes", "elle", "il", "ce", "c", "ça", "rappelle", "rappelle-toi",
    "rappelle-moi", "souviens-toi", "note", "nouvelle", "nouveau", "la", "le", "les", "un", "une", "qui", "quand",
    "où", "comment", "quel", "quelle", "que", "qu", "est-ce", "on", "nous", "et", "aussi", "voici", "crée", "retiens",
    "cherche", "trouve", "annule", "déplace", "change", "mets", "dis", "lis", "parle", "donne", "oui", "non", "merci",
    "d'accord", "ok", "bonjour", "salut", "information", "mémo", "demain", "aujourd'hui", "hier", "seul", "seule",
    "nulle", "avec", "chez", "au", "à", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre",
    "décembre", "personne", "rendez-vous", "déjeuner", "dîner", "café", "dr", "docteur",
}


def to_second_person(text):
    """Turn what the user said about themselves into what the app tells them: "mes clés" -> "vos clés"."""
    swaps = [
        (r"\bje suis\b", "vous êtes"), (r"\bj['’]ai\b", "vous avez"), (r"\bje vais\b", "vous allez"),
        (r"\bj['’]étais\b", "vous étiez"), (r"\bje dois\b", "vous devez"), (r"\bje peux\b", "vous pouvez"),
        (r"\bje\b", "vous"), (r"\bj['’]", "vous "), (r"\bm['’]", "vous "), (r"\bme\b", "vous"), (r"\bmoi\b", "vous"),
        (r"\bmon\b", "votre"), (r"\bma\b", "votre"), (r"\bmes\b", "vos"), (r"\ble mien\b", "le vôtre"),
        (r"\bla mienne\b", "la vôtre"),
    ]
    for pattern, replacement in swaps:
        text = re.sub(pattern, replacement, text, flags=re.I)
    text = text.strip(" ,;:")
    if not text:
        return ""
    text = text[0].upper() + text[1:]
    return text if text[-1] in ".!?" else text + "."


def _resolve(name, people):
    person = match_person(name, people)
    return _entry(person) if person else {"id": None, "name": name.strip()}


# ---- Add an event ----

_ALONE = r"\b(?:tout(?:e)? seule?|seule?|avec personne|personne d['’]autre|juste moi|moi seule?)\b|^\W*personne\W*$"
_NOWHERE = r"\b(?:nulle part|aucun lieu|pas de lieu|n['’]importe o[uù])\b"
_QUESTIONS = {
    "date": "Quel jour ?",
    "time": "À quelle heure ?",
    "place": "Où est-ce ?",
    "people": "Avec qui ? Si c'est seulement vous, dites : seul.",
}
_PART = {"matin": ("le matin", 9), "après-midi": ("l'après-midi", 15), "apres-midi": ("l'après-midi", 15), "soir": ("le soir", 19)}


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
    part = re.search(r"\b(matin|apr[eè]s-midi|soir)\b", text, re.I)
    if asked == "time" and part:
        # "Le matin" was said: ask for the hour, not the same question again.
        words, hour = _PART[part.group(1).lower()]
        question = f"À quelle heure, {words} ? Par exemple : à {hour} heures."
    return {"event": event, "ask": question, "asked": asked}


def _with_answer(text, answer, asked):
    """Add the user's answer to the words already said, so that the whole can be read again."""
    text = text.rstrip(" .!?")
    answer = answer.strip(" .!?")
    if asked == "name":
        return _with_name(text, answer)
    if asked in ("place", "new_place"):
        # "Parc Leumi, Ramat Gan" is one place: its commas must not cut it.
        answer = re.sub(r"\s*[,;.!?]+\s*", " ", answer).strip()
    if asked == "place" and not re.match(rf"(?:à|au|aux|chez|dans)\b|{_NOWHERE}", answer, re.I):
        answer = f"à {answer}"
    elif asked == "new_place" and not re.match(r"(?:à|au|aux|chez|dans)\b", answer, re.I):
        answer = f"à {answer}"
    elif asked == "people" and not re.match(rf"avec\b|{_ALONE}", answer, re.I):
        answer = f"avec {answer}"
    elif asked == "time" and re.match(rf"\d|{'|'.join(NUMBER_WORDS)}|midi|minuit", answer, re.I):
        answer = f"à {answer}"
    return f"{text} {answer}"


_PRONOUN = r"^\W*(?:(?:oui|ok|alors|et|bon)\W+)?(?:elle est|il est|c['’]est|elle|il)\b"


def _with_name(text, answer):
    """The answer to "Comment s'appelle cette personne ?", put back into what was said."""
    if re.search(r"(?i)\b(?:est|mon|ma|s['’]appelle|nomm)\b", answer):
        return answer
    name = answer.split()[-1] if answer.split() else answer
    name = name[:1].upper() + name[1:]
    if re.match(_PRONOUN, text, re.I):
        return re.sub(_PRONOUN, f"{name} est", text, count=1, flags=re.I)
    return f"{text}. Son nom est {name}"


_NOT_AN_ANSWER = re.compile(r"^\W*(?:e+u+h+|h+u+m+|b+a+h+|b+e+n+|alors|bon|bonjour|salut|attends|pardon|euh+)?\W*$", re.I)


# ---- Change or cancel an event ----

_NOT_THE_EVENT = {
    "annule", "annuler", "annulé", "annulée", "supprime", "efface", "enlève", "retire", "oublie", "déplace",
    "déplacé", "déplacée", "décale", "repousse", "reporte", "recule", "avance", "change", "changer", "les", "avec",
    "agenda", "calendrier", "plus", "pas", "finalement", "tout", "peux", "pourrais", "s'il", "plaît", "maintenant",
    "été", "est", "sera", "pour", "que", "cette", "heure", "jour", "lieu", "endroit", "adresse", "veux", "mon",
    "une", "des", "mes", "plutôt", "n'a", "n'ai", "vais", "vient", "dans", "chez", "rendez", "vous",
}


def _target(text, now, people):
    """Describe which event is meant: who it is with, when it is, and the words of its title."""
    sentence = _Sentence(text)
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, now.date()) or (now.date() if means_today else None)
    time = _read_time(sentence, period)
    persons = people_meant(text, people)
    names = {word for p in persons for word in normalize_name(p["name"]).split()}
    roles = {word for p in persons for word in (p.get("relationship") or "").lower().split()}
    words = [
        word for word in re.findall(r"[a-zà-ÿ]+", sentence.text.lower())
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
    # "Déplace le déjeuner avec Sarah de vendredi | à | samedi 13 heures": the event, then its new moment.
    for split in re.finditer(r"\s(?:à|au|pour|jusqu['’]à|est maintenant|sera|sera plut[oô]t|a [ée]t[ée] d[ée]plac[ée]e? (?:à|au))\s", text, re.I):
        new = _new_moment(text[split.start():], now)
        if new["date"] or new["time"]:
            return {"target": _target(text[:split.start()], now, people), "new": {**nothing, **new}, "ask": None}

    # "Change le lieu du déjeuner avec Sarah | à la | pizzeria", "Déplace le dîner | au | restaurant italien".
    about_place = re.search(r"\b(?:lieu|endroit|adresse|o[uù])\b", text, re.I)
    splits = list(re.finditer(r"\s(?:sera plut[oô]t |est maintenant |sera )?(à\s+la|à\s+l['’]|au|aux|à|chez)\s*", text, re.I))
    if splits:
        last = splits[-1]
        new_place = text[last.end():].strip(" .!?")
        if new_place and (about_place or len(new_place.split()) <= 5):
            return {
                "target": _target(text[:last.start()], now, people),
                "new": {**nothing, "place": as_place(new_place, last.group(1))},
                "ask": None,
            }
    if about_place:
        return {"target": _target(text, now, people), "new": nothing, "ask": "Quel est le nouveau lieu ?", "asked": "new_place"}

    new = _new_moment(text, now)
    target = {**_target(text, now, people), "date": None, "time": None}
    return {
        "target": target, "new": {**nothing, **new},
        "ask": None if new["date"] or new["time"] else "Pour quel jour ou quelle heure ?",
    }


# ---- Names that were not heard exactly ----

_AFTER_NAME = r"(?:\s+(?:est|et|m['’]a|a dit|dit|a|va|vient|viendra|sera)\b)"
# A capitalized word after one of these is a place, not a person: "aller à Rome", "en Italie".
# "Chez Sarah" is a person's home: "chez" is not among them.
_BEFORE_A_PLACE = r"\b(?:à|au|aux|en|vers|près de|de|du)\s+(?:la\s+|le\s+|l['’])?(?:[A-ZÀ-Ý][a-zà-ÿ]+\s+)?$"


def check_names(text, people):
    """Names close to a known person without being exactly theirs (see assistant.check_names)."""
    known = {normalize_name(p["name"]): p for p in people}
    said = text
    suggestion = None
    for match in re.finditer(r"(?:Dr\.? |Docteur )?([A-ZÀ-Ý][a-zà-ÿ]+)", said):
        word = match.group(1)
        if word.lower() in known or word.lower() in _NOT_A_NAME:
            continue
        before = said[:match.start()]
        opens = not before.strip() or before.rstrip()[-1] in ".!?:"
        if opens and not re.match(_AFTER_NAME, said[match.end(1):], re.I):
            continue
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
    match = re.search(rf"(?i:s['’]appelle|nomm[ée]e?|son nom est|elle se nomme|il se nomme)\s+({NAME}|[a-zà-ÿ]+)", text)
    if match:
        return match.group(1)[0].upper() + match.group(1)[1:]
    match = re.search(rf"(?i:nouvelle personne|nouvel ami|nouvelle amie|nouveau contact|nouveau voisin|nouvelle voisine)\W+({NAME})", text)
    if match and match.group(1).lower() not in _NOT_A_NAME:
        return match.group(1)
    match = re.search(rf"(?i:\b(?:mon|ma))\s+[a-zà-ÿ' -]+?\s({NAME})", text)
    if match and match.group(1).lower() not in _NOT_A_NAME:
        return match.group(1)
    known = {normalize_name(p["name"]) for p in people}
    for match in re.finditer(NAME, text):
        word = match.group(0)
        if word.lower() not in _NOT_A_NAME and word.lower() not in known:
            return word
    return None


_IS_MY = (r"(?i)\b(?:est|c['’]est|elle est|il est|voici)\s+(?:aussi\s+)?(?:mon|ma|mes)\s+([a-zà-ÿœ' -]+?)"
          r"(?=[.,;!?]|\s+(?:et|qui|de|à|au|elle|il|je|j|on|que)\b|$)")


def _yours(link):
    return f"{'Vos' if link.endswith(('s', 'x')) and ' ' not in link else 'Votre'} {link}"


def _relationship_update(text, people):
    """ "Elinor est ma sœur", about someone already known: their relationship changes. """
    if re.search(r"(?i)\bnouvelle personne|nouvel ami|nouvelle amie|nouveau contact|s['’]appelle|nomm[ée]", text):
        return None
    named = people_in(text, people)
    match = re.search(_IS_MY, text)
    if not (named and match):
        return None
    link = match.group(1).strip()
    return {
        "intent": "update_person",
        "update": {"personId": named[0]["id"], "name": named[0]["name"], "relationship": _yours(link), "link": link},
    }


def _add_person(text, now, people):
    update = _relationship_update(text, people)
    if update:
        return update
    name = _new_name(text, people)
    if not name:
        return {"person": None, "ask": "Comment s'appelle cette personne ?", "asked": "name"}

    known = match_person(name, people)
    if known and known["name"].lower() == name.lower():
        return {"person": _entry(known), "known": True}

    relationship = link = connection = None
    escaped = re.escape(name)
    # "c'est ma nièce", "Tom, mon neveu", "mon cousin Pierre"
    match = (
        re.search(rf"(?i)\b(?:mon|ma|mes)\s+([a-zà-ÿœ' -]+?)\s+{escaped}\b", text)
        or re.search(r"(?i)(?:\best|c['’]est|,|:)\s+(?:aussi\s+)?(?:mon|ma|mes)\s+([a-zà-ÿœ' -]+?)(?=[.,;!?]|\s+(?:et|qui|de|à|au|elle|il|je|j|on)\b|$)", text)
    )
    if match:
        link = match.group(1).strip()
        relationship = _yours(link)
    else:
        # "c'est la fille de Rose": the link goes through someone else.
        match = re.search(rf"(?i:\b(?:le|la|l['’]|un|une)\s*)([a-zà-ÿœ-]+(?: [a-zà-ÿœ-]+)?)\s+(?i:de|d['’])\s*({NAME})(?=[.,;!?]|\s|$)", text)
        if match and match.group(2) != name:
            other = _resolve(match.group(2), people)
            link = match.group(1).strip()
            relationship = f"{link[0].upper()}{link[1:]} de {other['name']}"
            connection = {
                "a": {"id": None, "name": name}, "b": other, "label": link,
                "text": f"{name} : {link} de {other['name']}",
            }

    origin = None
    match = re.search(
        r"(?i)\b(?:je l['’]ai|je les ai|on s['’]est|nous nous sommes|je la|je le|je les)\s*"
        r"(rencontr\w*|connais|connaissais)\s+((?:à|au|aux|en|par|quand|pendant|chez|dans|grâce|du|de la|de l['’]|des)\b[^.!?]*)", text)
    if match:
        verb = "Vous vous êtes rencontrés" if match.group(1).lower().startswith("rencontr") else "Vous vous connaissez"
        origin = to_second_person(f"{verb} {match.group(2).strip()}")

    return {
        "person": {"id": None, "name": name, "relationship": relationship, "link": link, "origin": origin},
        "connection": connection,
    }


# ---- Add a connection ----

_REL = r"([a-zà-ÿœ][a-zà-ÿœ' -]+?)"
_STOP = r"(?=[.,;!?]|$)"
_CONNECTIONS = [
    (rf"({NAME}) est (?:aussi )?(le |la |l['’]|un |une )?{_REL} (?:de |d['’])({NAME})",
     lambda m: (m[1], m[4], m[3], f"{m[1]} est {m[2] or ''}{m[3]} de {m[4]}")),
    (rf"({NAME}) est mari[ée]e? (?:avec|à) ({NAME})", lambda m: (m[1], m[2], "mariés", f"{m[1]} est marié avec {m[2]}")),
    (rf"({NAME}) et ({NAME})(?:, (?:ils|elles))? sont {_REL}{_STOP}", lambda m: (m[1], m[2], m[3], f"{m[1]} et {m[2]} sont {m[3]}")),
    (rf"({NAME}) conna[iî]t ({NAME})", lambda m: (m[1], m[2], "se connaissent", f"{m[1]} connaît {m[2]}")),
]


def _add_connection(text, now, people):
    if re.search(rf"{NAME} est (?:aussi )?(?:mon|ma|mes)\b", text):
        return {"intent": "add_person", **_add_person(text, now, people)}
    for pattern, read in _CONNECTIONS:
        match = re.search(pattern, text)
        if match:
            a_said, b_said, label, sentence = read(match)
            a, b = _resolve(a_said, people), _resolve(b_said, people)
            sentence = sentence.replace(a_said, a["name"], 1).replace(b_said, b["name"], 1)
            return {"connection": {"a": a, "b": b, "label": label.strip(), "text": sentence}}
    if people_in(text, people):
        return {"intent": "add_memo", **_add_memo(text, now, people)}
    return {"connection": None, "ask": "Dites-le comme ceci : Julie est la fille de Sarah."}


# ---- Add a memo ----

_MEMO_LEAD = re.compile(
    r"^\W*(?:(?:oui|ok|alors|bon)\W+)?(?:s['’]il te pla[iî]t\W+)?(?:(?:tu peux|peux-tu|pourrais-tu)\s+)?"
    r"(?:rappelles?-toi|souviens-toi|retiens(?: bien)?(?: [çc]a)?|note[rz]?(?: bien)?(?: pour plus tard)?|prends note|[ée]cris"
    r"|n['’]oublie pas|garde en m[ée]moire|je veux me souvenir|(?:je veux )?(?:ajoute[rz]?|mets) (?:une |un |une autre )?(?:information|info|note|m[ée]mo)"
    r"|m[ée]mo|information)"
    r"(?:\s+(?:sur|à propos de|pour|concernant)\s+(?P<about>[^:,.]+?)\s*(?:[:,.]|$))?\s*(?:\bque\b|\bqu['’]|[:,.])?\s*",
    re.I,
)
_FILLER = re.compile(r"^\W*(?:oui|ok|alors|bon)\W+", re.I)


def _add_memo(text, now, people):
    lead = _MEMO_LEAD.match(text)
    content = text[lead.end():] if lead else _FILLER.sub("", text)
    about = lead.group("about") if lead else None

    person = match_person(about, people) if about else None
    if not person and not about:
        named = people_in(content, people)
        person = named[0] if named else None

    # "Mémo sur Elinor. C'est ma sœur": who she is, not news about her.
    is_my = re.search(_IS_MY, content)
    if person and is_my and len(content.split()) <= 6:
        link = is_my.group(1).strip()
        return {
            "intent": "update_person",
            "update": {"personId": person["id"], "name": person["name"], "relationship": _yours(link), "link": link},
        }

    memo_text = to_second_person(content)
    if not memo_text:
        return {"memo": None, "ask": f"Que dois-je retenir sur {person['name']} ?" if person else "Que dois-je retenir ?"}
    subject = person["name"] if person else (about.strip().capitalize() if about else "Note")
    return {"memo": {"personId": person["id"] if person else None, "about": subject, "text": memo_text}}


# ---- Questions ----


def _asked_person(text, people):
    named = people_in(text, people)
    if named:
        return named[0]
    match = re.search(r"(?i)\b(?:mon|ma|mes)\s+([a-zà-ÿœ' -]+?)(?=[.,;!?]|\s+(?:est|va|à|en|aujourd|demain)\b|$)", text)
    return match_person(match.group(1), people) if match else None


def _ask_agenda(text, now, people):
    today = now.date()
    sentence = _Sentence(text)
    week = sentence.take(r"\b(cette semaine|la semaine prochaine)\b")
    period, means_today = _read_period(sentence)
    date = _read_date(sentence, today) or (today if means_today else None)
    person = _asked_person(text, people)
    if week:
        start = today + dt.timedelta(days=7 if "prochaine" in week.group(1).lower() else 0)
        return {"mode": "week", "date": start.isoformat(), "personId": person["id"] if person else None}
    # "Quel est mon prochain rendez-vous ?", "Quand est-ce que je vois Sarah ?"
    if not date and (person or re.search(r"\bprochaine?\b|\bquand\b|\bla suite\b", sentence.text, re.I)):
        return {"mode": "next", "date": None, "personId": person["id"] if person else None}
    return {"mode": "day", "date": (date or today).isoformat(), "period": period, "personId": person["id"] if person else None}


def _ask_diary(text, now, people):
    today = now.date()
    numbers = {**NUMBER_WORDS, **{str(n): n for n in range(1, 31)}}
    match = re.search(r"(?i)\bil y a\s+(\w+)\s+jours?\b", text)
    if re.search(r"(?i)\bavant-hier\b", text):
        date = today - dt.timedelta(days=2)
    elif match and match.group(1).lower() in numbers:
        date = today - dt.timedelta(days=numbers[match.group(1).lower()])
    else:
        date = _read_date(_Sentence(text), today)
        if date and date > today:
            date -= dt.timedelta(days=7)   # "dimanche" means last Sunday when asking about the past
    return {"date": (date or today - dt.timedelta(days=1)).isoformat()}


def _ask_person(text, now, people):
    person = _asked_person(text, people)
    if re.search(r"(?i)\bcomment (?:je |j['’]ai )?(?:connais|connu|rencontr)|\bo[uù] (?:est-ce que )?(?:j['’]ai|je l['’]ai|on s['’]est) rencontr"
                 r"|\blien\b|\brelation\b|\bpour moi\b", text):
        topic = "origin"
    elif re.search(r"(?i)\bnouvelles?\b|\bquoi de neuf\b|\bcomment va\b|\bcomment (?:elle|il) va\b|\bactualit", text):
        topic = "news"
    else:
        topic = "who"
    unknown = None
    if not person:
        match = re.search(rf"(?<!^)({NAME})", text)
        unknown = match.group(1) if match and match.group(1).lower() not in _NOT_A_NAME else None
    return {"personId": person["id"] if person else None, "unknownName": unknown, "topic": topic}


_SEARCH_LEAD = re.compile(
    r"^\W*(?:s['’]il te pla[iî]t\s+)?(?:(?:tu peux|peux-tu)\s+)?"
    r"(?:cherche[rz]?|trouve[rz]?|recherche[rz]?|qu['’]est-ce que j['’]ai (?:not[ée]|[ée]crit)|qu['’]est-ce que je sais|o[uù] (?:est|sont))\s*"
    r"(?:dans mes notes\s+|dans ma m[ée]moire\s+)?(?:sur\s+|[àa] propos de\s+)?(?:le mot\s+|quelque chose sur\s+)?",
    re.I,
)
_SEARCH_NOISE = {
    "je", "j", "veux", "des", "informations", "information", "info", "sur", "donne", "moi", "savoir", "quelque",
    "chose", "le", "la", "les", "l", "mon", "ma", "mes", "un", "une", "pour", "de", "du", "d", "cherche", "trouve",
    "recherche", "quoi", "que", "qu", "est", "ce", "noté", "écrit", "où", "sont", "dans", "notes", "mémoire",
    "mot", "dis", "montre", "il", "y", "a", "peux", "tu", "et", "avec", "ai",
}


def _search(text, now, people):
    query = _SEARCH_LEAD.sub("", text)
    query = re.sub(r"(?i)\s+dans (?:mes notes|ma m[ée]moire|mon journal|mon agenda)\b", "", query)
    words = [w for w in re.findall(r"[\wà-ÿœ-]+", query.replace("’", "'").replace("'", " ")) if w.lower() not in _SEARCH_NOISE]
    query = " ".join(words)
    return {"query": query, "ask": None if query else "Que dois-je chercher ?"}


def _ask_time(text, now, people):
    return {"kind": "time" if re.search(r"(?i)\bheure\b", text) else "date"}


HANDLERS = {
    "add_event": _add_event, "change_event": _change_event, "cancel_event": _cancel_event,
    "add_person": _add_person, "add_connection": _add_connection,
    "add_memo": _add_memo, "ask_agenda": _ask_agenda, "ask_diary": _ask_diary,
    "ask_person": _ask_person, "search": _search, "ask_time": _ask_time, "update_person": _add_person,
}
_NAMES_AS_SAID = {"add_person", "search", "ask_time", "help", None}
_GREETING = re.compile(
    r"^\W*(?:bonjour|salut|coucou|bonsoir|hello)\b(?:\W+\w+){0,2}\W*$|\bje m['’]appelle\b|\bmon nom est\b", re.I)


def assist(text, now, people=(), intent=None, exact_names=False, asked=None, answer=None, recent=None):
    """Understand one sentence said in French. The same arguments and answer as assistant.assist."""
    people = list(people)
    score = None
    if answer and _NOT_AN_ANSWER.match(answer):
        answer = None
    if answer:
        text = _with_answer(text, answer, asked)
    if intent is None:
        if _GREETING.search(text):
            return {"intent": "greet", "score": 1.0, "text": text}
        if recent and not people_in(text, people) and re.match(_PRONOUN, text, re.I):
            verb = " est" if re.match(r"^\W*(?:\w+\W+)?(?:elle est|il est|c['’]est)\b", text, re.I) else ""
            text = re.sub(_PRONOUN, f"{recent}{verb}", text, count=1, flags=re.I)
        intent, score = classifier_for("fr").classify(text, [p["name"] for p in people])
    if answer and asked in ("place", "new_place"):
        exact_names = True

    # "Des informations sur Nadia" is a question about a person, not a search of the notes.
    if intent == "search" and (people_meant(text, people) or (not exact_names and check_names(text, people)[1])):
        intent = "ask_person"

    if intent not in _NAMES_AS_SAID and not exact_names:
        text, suggestion = check_names(text, people)
        if suggestion:
            return {"intent": intent, "score": score, "text": text, "suggest": suggestion}

    handler = HANDLERS.get(intent)
    details = handler(text, now, people) if handler else {}
    return {"intent": intent, "score": score, "text": text, **details}
