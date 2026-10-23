"""The simple things of every day, seen from the server: reminders when the app is
closed, and the relatives told when something that matters is not done.

The person's app sends its list of things to do each day (the pills, the meals...) and
what was done, each time it changes. Every half minute, `run` looks at what is due:
- at the time of a thing not done: a notification on the person's phone;
- half an hour later: once more;
- after a while, for what matters most (the pills, the meals, a drink): a notification
  to the relatives linked to the person.
When the person's app is open, it reminds aloud by itself: no notification is sent to it.
"""

import datetime as dt
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from . import accounts, push

log = logging.getLogger(__name__)

AGAIN_MIN = 30
TELL_MIN = {"pills": 45, "meal": 120, "drink": 120}   # minutes before the relatives are told
LATE_MIN = 10        # a reminder more than this late (the server was off) is not sent any more
TELL_LATE_MIN = 60
OPEN_SECONDS = 90    # the app was seen this recently: it is open and speaks by itself
WEEKDAYS = {
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "fr": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
}
# The boxes of a pill box: the same parts of the day as the app (day.js).
PARTS = {"en": ("morning", "midday", "evening", "night"), "fr": ("matin", "midi", "soir", "nuit")}
_PART_ENDS = (11, 15, 20, 24)


def local_now(zone, offset_min, now=None):
    """The person's local time, without a time zone: by the name of their zone, or else
    by the offset their phone gave."""
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        return now.astimezone(ZoneInfo(zone)).replace(tzinfo=None)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return (now + dt.timedelta(minutes=offset_min or 0)).replace(tzinfo=None)


def on(task, date):
    """Whether the thing comes on that day. `days` counts from Sunday (0), as in the app."""
    days = task.get("days") or []
    return not days or (date.weekday() + 1) % 7 in days


def planned(task, date):
    hour, minute = map(int, task["time"].split(":"))
    return dt.datetime.combine(date, dt.time(hour, minute))


def due(tasks, done_ids, sent, now):
    """What to send now, as [(task, what)], `what` being "time", "again" or "relatives".

    `done_ids`: the things done today; `sent`: the (task id, what) already sent today;
    `now`: the person's local time.
    """
    found = []
    for task in tasks:
        if not task.get("time") or task["id"] in done_ids or not on(task, now.date()):
            continue
        late = (now - planned(task, now.date())).total_seconds() / 60
        steps = [("time", 0, LATE_MIN), ("again", AGAIN_MIN, LATE_MIN)]
        if task.get("kind") in TELL_MIN:
            steps.append(("relatives", TELL_MIN[task["kind"]], TELL_LATE_MIN))
        for what, after, window in steps:
            if after <= late < after + window and (task["id"], what) not in sent:
                found.append((task, what))
    return found


def box(task, date, lang="en"):
    """The box of a pill box for this thing: "Wednesday morning", "mercredi matin"."""
    lang = lang if lang in PARTS else "en"
    hour = int(task["time"].split(":")[0]) if task.get("time") else 8
    part = PARTS[lang][next(i for i, end in enumerate(_PART_ENDS) if hour < end)]
    return f"{WEEKDAYS[lang][date.weekday()]} {part}"


def message(task, what, name, date, lang="en"):
    """The notification for the person ("time", "again") or for the relatives, in `lang`."""
    text = task["text"]
    pills = task.get("kind") == "pills"
    if lang == "fr":
        return _message_fr(task, what, name, date)
    if what == "relatives":
        hint = {
            "pills": f" Ask {name} to look at the pill box, at {box(task, date)}: if it is empty, the pills were taken.",
            "meal": f" Maybe call {name} and suggest eating something.",
            "drink": f" Maybe call {name} and suggest a glass of water.",
        }.get(task.get("kind"), "")
        return {"title": f"{name} has not noted: {text}", "body": f"It was planned at {task['time']}.{hint}", "url": "/#/"}
    body = f"{text}.{f' Take them from the box: {box(task, date)}.' if pills else ''} Touch here when it is done."
    title = f"{name}, it is time" if what == "time" else f"{name}, a small reminder"
    return {"title": title, "body": body, "url": f"/#/day/now/{task['id']}"}


def _message_fr(task, what, name, date):
    text = task["text"]
    if what == "relatives":
        hint = {
            "pills": f" Demandez à {name} de regarder le pilulier, à la case du {box(task, date, 'fr')} : si elle est vide, les médicaments ont été pris.",
            "meal": f" Vous pouvez appeler {name} et lui proposer de manger quelque chose.",
            "drink": f" Vous pouvez appeler {name} et lui proposer un verre d'eau.",
        }.get(task.get("kind"), "")
        return {"title": f"{name} n'a pas noté : {text}", "body": f"C'était prévu à {task['time']}.{hint}", "url": "/#/"}
    pills = f" Prenez-les dans la case : {box(task, date, 'fr')}." if task.get("kind") == "pills" else ""
    body = f"{text}.{pills} Touchez ici quand c'est fait."
    title = f"{name}, c'est l'heure" if what == "time" else f"{name}, un petit rappel"
    return {"title": title, "body": body, "url": f"/#/day/now/{task['id']}"}


def run(now=None, send=None):
    """Send what is due for every person. Called every half minute by the server."""
    send = send or push.send
    for person in accounts.routines():
        today = local_now(person["zone"], person["offset"], now)
        day = today.date().isoformat()
        done = accounts.done_on(person["id"], day)
        sent = accounts.sent_on(person["id"], day)
        for task, what in due(person["tasks"], set(done), sent, today):
            # Claimed first, so that it is never sent twice, even by two servers at once.
            if not accounts.claim(person["id"], task["id"], day, what):
                continue
            if what == "relatives":
                phones = [s for h in accounts.links(person["id"])["helpers"] for s in accounts.subscriptions(h["id"])]
            elif accounts.seen_within(person["id"], OPEN_SECONDS):
                continue
            else:
                phones = accounts.subscriptions(person["id"])
            name = accounts.person_name(person["id"]) or person["name"]
            for subscription in phones:
                # Each phone in its own language: the person's, or the relative's.
                status = send(subscription, message(task, what, name, today.date(), subscription.get("lang", "en")))
                if status in (404, 410):
                    accounts.unsubscribe(subscription["endpoint"])
                elif not 200 <= status < 300:
                    log.warning("push to %s answered %s", subscription["endpoint"][:40], status)


def today_of(person, now=None):
    """For a relative: the person's things of today, with what is done and what is late.

    {"day", "tasks": [{"id", "text", "time", "kind", "done": {"at", "how"} or None, "late": bool}]}
    A thing is late once the relatives would be told, or an hour after its time for the others.
    """
    today = local_now(person["zone"], person["offset"], now)
    done = accounts.done_on(person["id"], today.date().isoformat())
    tasks = []
    for task in sorted((t for t in person["tasks"] if on(t, today.date())), key=lambda t: t.get("time") or "99"):
        late = False
        if task.get("time") and task["id"] not in done:
            minutes = (today - planned(task, today.date())).total_seconds() / 60
            late = minutes >= TELL_MIN.get(task.get("kind"), 60)
        tasks.append({**{k: task.get(k) for k in ("id", "text", "time", "kind")}, "done": done.get(task["id"]), "late": late})
    return {"day": today.date().isoformat(), "tasks": tasks}
