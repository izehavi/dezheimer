// Spoken reminders: the app says aloud what is coming, at the right moment.
// It works while the app is open, on any screen.
const Reminders = (() => {
  const LEADS = [30, 5, 0];      // minutes before an event at which a reminder is given
  const CHECK_EVERY_MS = 20000;
  const LATE_MS = 3 * 60000;     // an "it is time" reminder is still given this long after the start

  const said = new Set();        // reminders already given, as "eventId:lead"
  try {
    for (const key of JSON.parse(sessionStorage.getItem('dezheimer.reminded') || '[]')) said.add(key);
  } catch { /* nothing remembered */ }

  const remember = (key) => {
    said.add(key);
    try { sessionStorage.setItem('dezheimer.reminded', JSON.stringify([...said])); } catch { /* not kept */ }
  };

  // "At home" -> "at home" inside a sentence; names keep their capital.
  const lower = (s) => (/^(At|In|On|Your|The|A|An|Someone)\b/.test(s || '') ? s[0].toLowerCase() + s.slice(1) : s || '');

  // The reminder due now, if any: the closest lead that has been reached and not yet given.
  const due = (now) => {
    for (const e of SampleData.events) {
      const minutes = (e.start - now) / 60000;
      if (minutes > LEADS[0] || e.start - now < -LATE_MS) continue;
      const lead = [...LEADS].reverse().find((l) => minutes <= l);
      // Earlier leads of this event are no longer worth saying.
      const key = `${e.id}:${lead}`;
      if (said.has(key)) continue;
      return { event: e, lead, key, minutes: Math.max(0, Math.round(minutes)) };
    }
    return null;
  };

  const sentence = ({ event, lead, minutes }) => {
    const what = `${event.title}${event.place ? `, ${lower(event.place)}` : ''}.${event.note ? ` ${event.note}` : ''}`;
    if (lead === 0 || minutes === 0) return `${SampleData.user.name}, it is time. ${what}`;
    return `${SampleData.user.name}, in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, at ${Speech.time(event.start)}: ${what}`;
  };

  const check = () => {
    // Never talk over the assistant; the reminder is given at the next check.
    if (Assistant.busy() || Mic.isListening()) return;
    const reminder = due(new Date());
    if (!reminder) return;
    remember(reminder.key);

    const text = sentence(reminder);
    const banner = document.getElementById('reminder');
    banner.querySelector('p').textContent = text;
    banner.hidden = false;
    Speech.say(text);
  };

  const start = () => {
    document.getElementById('reminder').querySelector('button').addEventListener('click', () => {
      document.getElementById('reminder').hidden = true;
      Speech.stop();
    });
    check();
    setInterval(check, CHECK_EVERY_MS);
  };

  return { start };
})();
