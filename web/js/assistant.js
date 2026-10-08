// The voice assistant on the home screen: one big button, then everything by voice.
//
// The user taps the button and says one thing. The server finds what is asked
// (server/assistant.py); this file carries it out on the data and answers aloud.
// Anything that would be written down is first read back and confirmed by "yes".
const Assistant = (() => {
  const SILENCE_MS = 9000;       // the microphone goes off when nobody speaks for this long
  const COLORS = ['#7A3E9D', '#1F6F8B', '#A64B2A', '#3F7D3A', '#8C2F5B', '#4A5FA8', '#8A6A00'];

  let phase = 'idle';            // 'idle' | 'listening' | 'thinking' | 'speaking'
  let live = '';                 // what is being heard right now
  let log = [];                  // the last exchanges: { who: 'you' | 'app', text, link, linkText }
  let pending = null;            // a request waiting for a detail: { intent, text, asked }
  // Something waiting for "yes": { say, question, fields, apply, done, link, linkText }.
  // `fields` are words the user can correct by hand before saying yes: [{ key, label, value }].
  // `places` are what the map found for the place of an event; `chosen` is the one kept (-1: none).
  let confirm = null;
  let townAsk = null;            // "In which town are you?" waiting for an answer: { place, next }
  let namesSettled = false;      // "Do you mean Rose?" was answered: it is not asked again in this request
  // The person just talked about, so that "She is my aunt" is understood: { name, at }.
  let recent = null;
  const RECENT_MS = 3 * 60 * 1000;
  const about = (name) => { recent = { name: name.replace(/^Dr\. /, ''), at: Date.now() }; };
  let nameCheck = null;          // "Do you mean Rose?" waiting for an answer: { text, intent, heard, name }
  let silenceTimer;
  let ear = 0;                   // changes each time listening starts or is interrupted
  let onChange = () => {};       // called when the data changed, so the screen can refresh

  // Improvement mode: after each request, the user says whether the app did what they
  // wanted. The whole exchange is sent to the server and kept for improving the app.
  const IMPROVE_KEY = 'dezheimer.improve';
  let improve = true;
  try { improve = localStorage.getItem(IMPROVE_KEY) !== 'off'; } catch { /* stays on */ }
  let trace = null;              // the exchange going on: { startedAt, turns, calls }
  let review = null;             // the exchange just finished, waiting for the user's verdict

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const $ = (id) => document.getElementById(id);
  // "At home" -> "at home" inside a sentence; names keep their capital.
  const lower = (s) => (/^(At|In|On|Your|The|A|An|Someone)\b/.test(s || '') ? s[0].toLowerCase() + s.slice(1) : s || '');
  const { people, memos, events, diary, notes, connections } = SampleData;
  const personById = (id) => people.find((p) => p.id === id);

  // ---- Talking and listening ----

  const say = async (text, { listen = false, link, linkText } = {}) => {
    log.push({ who: 'app', text, link, linkText });
    log = log.slice(-6);
    if (trace) trace.turns.push({ who: 'app', text });
    phase = 'speaking';
    render();
    await Speech.say(text);
    if (phase !== 'speaking') return; // stopped meanwhile
    if (listen) startListening(); else { phase = 'idle'; settle(); render(); }
  };

  // ---- Improvement mode ----

  // The exchange is over when the app is not waiting for anything more from the user.
  const settle = () => {
    if (!trace || confirm || pending || nameCheck || townAsk) return;
    review = improve ? { ...trace, state: 'ask' } : null;
    trace = null;
  };

  const sendReview = (verdict, comment = '') => {
    if (!review) return;
    const { state, ...record } = review;
    review = verdict === 'unanswered' ? null : { ...review, state: 'thanks' };
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...record, verdict, comment } }),
    }).catch(() => {});
  };

  const startListening = async () => {
    live = '';
    phase = 'listening';
    render();
    const mine = ++ear;
    const on = await Mic.start({
      owner: 'assistant',
      single: true,
      onPartial: (text) => { live = text; resetSilence(); render(); },
      // Ignored when the listening was interrupted before the phrase came back.
      onPhrase: (text) => { if (mine === ear && phase === 'thinking') heard(text, 'voice'); },
      onLevel: (level) => {
        const button = $('talk');
        if (button) button.style.setProperty('--level', Math.min(1, level * 12).toFixed(2));
      },
      onError: (message) => { phase = 'idle'; log.push({ who: 'app', text: message, error: true }); render(); },
      onStop: () => { clearTimeout(silenceTimer); if (phase === 'listening') { phase = 'thinking'; render(); } },
    });
    if (on) resetSilence();
  };

  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (phase !== 'listening') return;
      interrupt();
      render();
    }, SILENCE_MS);
  };

  // Stop listening and speaking, and forget the phrase being said.
  const interrupt = () => {
    clearTimeout(silenceTimer);
    ear += 1;
    phase = 'idle';
    if (Mic.isListening('assistant')) Mic.stop();
    Speech.stop();
  };

  const stop = () => {
    const wasBusy = phase !== 'idle';
    interrupt();
    settle();
    if (wasBusy) render();
  };

  // ---- What was said ----

  const YES = /\b(yes|yeah|yep|yup|ok|okay|correct|right|sure|of course|absolutely|please do|do it|add it|exactly|that'?s it|go ahead|m+-?h+m+|uh-?huh)\b/i;
  const NO = /\b(no|nope|cancel|wrong|don'?t|stop|not)\b/i;

  // "yes" or "no"; null when it is neither. "Yes, cancel it" is a yes.
  const yesOrNo = (text) => {
    if (/^\W*(yes|yeah|yep|yup|ok|okay|sure|m+-?h+m+|uh-?huh)\b/i.test(text)) return 'yes';
    if (NO.test(text)) return 'no';
    return YES.test(text) ? 'yes' : null;
  };

  // `source` is how the words came in: 'voice', 'typed' or 'button'.
  const heard = async (text, source) => {
    text = (text || '').trim();
    live = '';
    if (!text) { phase = 'idle'; render(); return; }
    log.push({ who: 'you', text });
    if (!trace) {
      // A new request. A verdict that was not given on the last one is recorded as such.
      if (review && review.state !== 'thanks') sendReview('unanswered');
      review = null;
      trace = { startedAt: new Date().toISOString(), turns: [], calls: [] };
      namesSettled = false;
    }
    trace.turns.push({ who: 'you', text, source });

    if (townAsk) {
      // The answer to "In which town are you?": the place is then looked for around that town.
      const { place, next } = townAsk;
      townAsk = null;
      phase = 'thinking';
      render();
      try {
        if (yesOrNo(text) === 'no') { Places.decline(); await next({ found: [] }); return; }
        const town = await Places.setTown(text).catch(() => null);
        await next(town ? await lookUp(place, town) : { found: [], note: 'I did not find this town, so I keep the place as you said it.' });
      } catch (err) { failed(err); }
      return;
    }

    if (confirm) {
      const answer = yesOrNo(text);
      if (answer === 'no') { confirm = null; await say('All right, I changed nothing.'); return; }
      if (answer === 'yes') { await accept(); return; }
      await say('Please say yes or no.', { listen: true });
      return;
    }

    phase = 'thinking';
    render();
    try {
      // After a question such as "At what time?", the words said before go with the answer.
      let full = pending ? pending.text : text;
      let intent = pending && pending.intent;
      const reply = pending ? { asked: pending.asked || null, answer: text } : {};
      let exactNames = namesSettled;
      if (nameCheck) {
        // The answer to "Do you mean Rose?": the first sentence is read again, with the right name.
        const answer = yesOrNo(text);
        if (!answer) { await say('Please say yes or no.', { listen: true }); return; }
        const { heard: name, intent: asked } = nameCheck;
        full = answer === 'yes' ? nameCheck.text.replace(nameCheck.heard, nameCheck.name) : nameCheck.text;
        intent = asked;
        exactNames = answer === 'no';
        // Asked once: the same name is not asked about again at each further question.
        namesSettled = true;
        nameCheck = null;
        // A question about someone who is not known cannot be answered.
        if (exactNames && ['ask_agenda', 'ask_person', 'change_event', 'cancel_event'].includes(asked)) {
          await say(`I do not know ${name} yet. You can say: add a new person called ${name}.`);
          return;
        }
      }
      const result = await ask(full, intent, exactNames, reply);
      pending = null;
      await respond(result, result.text || full);
    } catch (err) { failed(err); }
  };

  const failed = (err) => {
    pending = nameCheck = townAsk = null;
    phase = 'idle';
    const problem = `I could not understand because of a problem: ${err.message}`;
    log.push({ who: 'app', text: problem, error: true });
    if (trace) trace.turns.push({ who: 'app', text: problem, error: true });
    settle();
    render();
  };

  const ask = async (text, intent, exactNames = false, reply = {}) => {
    const d = new Date();
    const now = `${Dates.key(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const lately = recent && Date.now() - recent.at < RECENT_MS ? recent.name : null;
    const res = await fetch('/api/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, now, intent: intent || null, exact_names: exactNames, ...reply, recent: lately,
        people: people.map(({ id, name, relationship }) => ({ id, name, relationship })),
      }),
    });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const result = await res.json();
    if (trace) trace.calls.push({ sent: { text, intent: intent || null, exact_names: exactNames, ...reply }, result });
    return result;
  };

  // A detail is missing: ask for it and keep the words already said.
  const askFor = (question, intent, text, asked) => {
    pending = { intent, text, asked };
    return say(question, { listen: true });
  };

  const propose = (proposal) => {
    confirm = proposal;
    return say(`${proposal.say} ${proposal.question || 'Shall I add it?'}`, { listen: true });
  };

  const accept = async () => {
    const { apply, done, link, linkText, fields = [], places = [], chosen = -1, next } = confirm;
    // What the user corrected by hand replaces what was heard.
    const values = Object.fromEntries(fields.map((f) => [f.key, (f.value || '').trim()]));
    confirm = null;
    const result = apply(values, places[chosen]);  // may give a better link, such as the page of a new person
    onChange();
    // Something else may follow from what was just written, such as a person to add.
    const follow = next && next(result);
    if (follow) {
      const told = typeof done === 'function' ? done(values) : done;
      await propose({ ...follow, say: `${told} ${follow.say}` });
      return;
    }
    await say(typeof done === 'function' ? done(values) : done, { link: (result && result.link) || link, linkText });
  };

  // ---- The place of an event, on the map ----

  // What the map knows about `place` around `near`: { found, searched, near }.
  const lookUp = async (place, near) => {
    let found = [];
    let problem;
    try { found = await Places.search(place, near); } catch (err) { problem = err.message; }
    // Kept for improvement mode: what was searched and found, not where the user is.
    if (trace) trace.calls.push({ map: { searched: place, near: near.exact ? 'the device' : near.name, found: found.map((f) => `${f.name}, ${f.address}`), problem } });
    return { found, searched: !problem, near };
  };

  // Look for the place of an event around the user, then go on with `next(map)`.
  // The place is kept as it was said when it is not a place of the map ("at home"),
  // when nothing is found, or when the map cannot be reached.
  const withPlace = async (place, next) => {
    if (!Places.searchable(place)) return next({ found: [] });
    const near = await Places.here();
    if (!near) {
      townAsk = { place, next };
      return say('To find this place on the map, I need to know where you are. In which town are you?', { listen: true });
    }
    return next(await lookUp(place, near));
  };

  // The place the app proposes by itself: only one whose name is what was said.
  const firstSure = (map) => (map.found.length && map.found[0].sure ? 0 : -1);

  const mapSay = ({ found, searched, near, note }) => {
    if (note) return ` ${note}`;
    if (!found.length) return searched ? ' I did not find this place on the map near you, so I keep it as you said it.' : '';
    if (!found[0].sure) return ' I did not find exactly this place on the map. Places with a close name are on the screen.';
    const [first, ...others] = found;
    return ` On the map, I found ${first.name}${first.address ? `, ${first.address}` : ''}`
      + `${near.exact ? `, ${Places.far(first.km)} from here` : ''}.`
      + (others.length ? ` There ${others.length === 1 ? 'is 1 other place' : `are ${others.length} other places`} on the screen.` : '');
  };

  // The place written in the agenda: the real name found on the map, or else the words that were said.
  const placeName = (said, spot) => (spot ? `At ${spot.name}` : said || '');

  // What an event keeps of the place chosen on the map.
  const spotOf = (spot) => ({ address: spot && spot.address, lat: spot && spot.lat, lon: spot && spot.lon });

  // ---- Answers ----

  const dayName = (date, now) => {
    const relative = Dates.relative(date, now);
    return relative === Dates.long(date) ? `on ${relative}` : relative.toLowerCase();
  };

  // The place, unless the title already says it ("Go to the market").
  const placeOf = (e) => (e.place && !e.title.toLowerCase().includes(e.place.replace(/^(At|In) /, '').toLowerCase())
    ? `, ${lower(e.place)}` : '');

  const eventLine = (e) => `At ${Speech.time(e.start)}: ${e.title}${placeOf(e)}.`;

  // The event the user means: the coming event that fits the description best.
  const findEvent = (target, now) => {
    const from = Dates.startOfDay(now);
    let best = null;
    let bestScore = 0;
    for (const e of [...events].sort((a, b) => a.start - b.start)) {
      if (e.start < from) continue;
      const text = `${e.title} ${e.place || ''}`.toLowerCase();
      const score = target.personIds.filter((id) => e.personIds.includes(id)).length * 3
        + (target.date && Dates.key(e.start) === target.date ? 3 : 0)
        + (target.time && Dates.time(e.start) === target.time ? 2 : 0)
        + target.words.filter((w) => text.includes(w)).length;
      // An event on another day than the one said is not the one.
      if (target.date && Dates.key(e.start) !== target.date) continue;
      if (score > bestScore) { best = e; bestScore = score; }
    }
    return best;
  };

  const whenOf = (date, now) => `${dayName(date, now)} at ${Speech.time(date)}`;

  const respond = async (r, text) => {
    const now = new Date();

    if (r.suggest) {
      // A name close to someone known, but not exactly theirs.
      nameCheck = { text, intent: r.intent, heard: r.suggest.heard, name: r.suggest.name.replace(/^Dr\. /, '') };
      return say(`Do you mean ${r.suggest.name}?`, { listen: true });
    }

    switch (r.intent) {
      case 'cancel_event': {
        const e = findEvent(r.target, now);
        if (!e) return say('I did not find this in your agenda. Tell me who it is with, or which day.');
        return propose({
          say: `${e.title}, ${whenOf(e.start, now)}.`,
          question: 'Shall I cancel it?',
          apply: () => { SampleData.cancelEvent(e.id); },
          done: 'Done. It is cancelled.',
          link: `#/agenda/${Dates.key(e.start)}`, linkText: 'Open the agenda',
        });
      }

      case 'change_event': {
        if (r.ask) return askFor(r.ask, r.intent, text, r.asked);
        const e = findEvent(r.target, now);
        if (!e) return say('I did not find this in your agenda. Tell me who it is with, or which day.');
        // Only the day, only the time, or only the place may change.
        const start = r.new.date ? Dates.fromKey(r.new.date) : Dates.startOfDay(e.start);
        const [h, m] = r.new.time ? r.new.time.split(':').map(Number) : [e.start.getHours(), e.start.getMinutes()];
        start.setHours(h, m, 0, 0);
        const moved = start.getTime() !== e.start.getTime();
        if (!moved && !r.new.place) {
          return say(`${e.title} is already ${whenOf(e.start, now)}. Tell me the new day, the new time or the new place.`);
        }
        return withPlace(r.new.place, (map) => propose({
          say: `${e.title}, ${whenOf(e.start, now)}.`
            + (moved ? ` The new time: ${whenOf(start, now)}.` : '')
            + (r.new.place ? ` The new place: ${lower(r.new.place)}.${mapSay(map)}` : ''),
          question: 'Shall I change it?',
          fields: r.new.place ? [{ key: 'place', label: 'New place', value: placeName(r.new.place, map.found[firstSure(map)]) }] : [],
          places: map.found, chosen: firstSure(map), saidPlace: r.new.place,
          apply: (v, spot) => {
            SampleData.changeEvent(e.id, { start, ...(r.new.place ? { place: v.place, ...spotOf(spot) } : {}) });
          },
          done: 'Done. It is changed.',
          link: `#/agenda/${Dates.key(start)}`, linkText: 'See it in the agenda',
        }));
      }

      case 'add_event': {
        if (r.ask) return askFor(r.ask, r.intent, text, r.asked);
        const e = r.event;
        const [h, m] = e.time.split(':').map(Number);
        const start = Dates.fromKey(e.date);
        start.setHours(h, m, 0, 0);
        return withPlace(e.place, (map) => propose({
          say: `${e.title}, ${dayName(start, now)} at ${Speech.time(start)}${placeOf(e)}.${mapSay(map)}`,
          fields: [
            { key: 'title', label: 'What', value: e.title },
            { key: 'place', label: 'Where', value: placeName(e.place, map.found[firstSure(map)]) },
          ],
          places: map.found, chosen: firstSure(map), saidPlace: e.place || '',
          apply: (v, spot) => ({
            event: SampleData.add('events', {
              title: v.title || e.title, start, place: v.place, ...spotOf(spot),
              personIds: e.people.filter((p) => p.id).map((p) => p.id),
            }),
          }),
          // Someone in the event who is not known yet: offer to add them.
          next: ({ event }) => newPersonFor(event, e.people.filter((p) => !p.id).map((p) => p.name)),
          done: 'Done. It is in your agenda.',
          link: `#/agenda/${e.date}`, linkText: 'See it in the agenda',
        }));
      }

      case 'greet':
        return say('Hello. Tell me what you need. For example: what do I have today?');

      case 'add_person': {
        if (r.ask) return askFor(r.ask, r.intent, text, r.asked);
        if (r.known) {
          const p = personById(r.person.id);
          return say(`${p.name} is already in your people: ${lower(p.relationship)}.`,
            { link: `#/people/${p.id}`, linkText: `Open ${p.name}'s page` });
        }
        const p = r.person;
        return propose({
          say: `A new person: ${p.name}${p.relationship ? `, ${lower(p.relationship)}` : ''}.${p.origin ? ` ${p.origin}` : ''}`,
          // The speech model often gets a new name wrong: it can be corrected by hand.
          fields: [{ key: 'name', label: 'Name', value: p.name }],
          apply: (v) => {
            const added = addPerson({ ...p, name: v.name || p.name });
            about(added.name);
            if (r.connection) addConnection({ ...r.connection, a: { id: added.id, name: added.name } });
            return { link: `#/people/${added.id}` };
          },
          done: (v) => `Done. ${v.name || p.name} is in your people. You can now tell me things to remember about ${v.name || p.name}.`,
          link: '#/people', linkText: 'Open the page',
        });
      }

      case 'update_person': {
        const u = r.update;
        return propose({
          say: `${u.name} is ${lower(u.relationship)}.`,
          question: 'Shall I note it?',
          apply: () => { SampleData.updatePerson(u.personId, { relationship: u.relationship, link: u.link }); about(u.name); },
          done: `Done. ${u.name} is noted as ${lower(u.relationship)}.`,
          link: `#/people/${u.personId}`, linkText: `Open ${u.name}'s page`,
        });
      }

      case 'add_connection': {
        if (r.ask) return say(r.ask);
        const c = r.connection;
        return propose({
          say: `A connection: ${c.text}.`,
          apply: () => { addConnection(c); },
          done: 'Done. I added the connection.',
          link: '#/people/connections', linkText: 'See the connections',
        });
      }

      case 'add_memo': {
        if (r.ask) return askFor(r.ask, r.intent, text);
        const memo = r.memo;
        const date = new Date();
        return propose({
          say: memo.personId ? `A memo about ${memo.about}: ${memo.text}` : `A note: ${memo.text}`,
          fields: [{ key: 'text', label: 'Text', value: memo.text }],
          apply: (v) => {
            const text = v.text || memo.text;
            if (memo.personId) { SampleData.add('memos', { personId: memo.personId, date, text }); about(memo.about); }
            else SampleData.add('notes', { date, subject: memo.about, text });
          },
          done: memo.personId ? `Done. It is on ${memo.about}'s page.` : 'Done. It is in your notes of the day.',
          link: memo.personId ? `#/people/${memo.personId}` : `#/diary/${Dates.key(date)}`,
          linkText: memo.personId ? `Open ${memo.about}'s page` : 'See the notes of the day',
        });
      }

      case 'ask_agenda': return say(...agendaAnswer(r, now));
      case 'ask_diary': return say(...diaryAnswer(r, now));
      case 'ask_person': return say(...personAnswer(r, now));
      case 'search': return r.ask ? askFor(r.ask, r.intent, text) : say(...searchAnswer(r.query));

      case 'ask_time':
        return say(r.kind === 'time'
          ? `It is ${Speech.time(now)}.`
          : `Today is ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`);

      case 'help':
        return say('You can ask me what you have today, or who someone is. '
          + 'You can tell me to add, move or cancel an appointment, and to add a new person or something to remember. '
          + 'For example: what do I have tomorrow? Or: remember that Emma won her competition.');

      default:
        return say('I did not understand. You can say, for example: what do I have today? '
          + 'Or: add a coffee with Sarah tomorrow at 3 pm.');
    }
  };

  const inPeriod = (date, period) => {
    const h = date.getHours();
    return !period || (period === 'morning' ? h < 12 : period === 'afternoon' ? h >= 12 && h < 18 : h >= 18);
  };

  const agendaAnswer = (r, now) => {
    const person = r.personId && personById(r.personId);
    const mine = events
      .filter((e) => !person || e.personIds.includes(person.id))
      .sort((a, b) => a.start - b.start);

    if (r.mode === 'next') {
      const next = mine.find((e) => e.start >= now);
      if (!next) return [person ? `Nothing is planned with ${person.name}.` : 'Nothing more is planned.'];
      return [
        `${person ? `You will see ${person.name}` : 'Your next appointment is'} ${dayName(next.start, now)}. ${eventLine(next)}${next.note ? ` ${next.note}` : ''}`,
        { link: `#/agenda/${Dates.key(next.start)}`, linkText: 'Open the agenda' },
      ];
    }

    if (r.mode === 'week') {
      const start = Dates.fromKey(r.date);
      const end = Dates.addDays(start, 7);
      const list = mine.filter((e) => e.start >= start && e.start < end && e.start >= Dates.startOfDay(now));
      if (!list.length) return ['Nothing is planned in the next seven days.'];
      const lines = list.map((e) => `${Dates.relative(e.start, now)}, at ${Speech.time(e.start)}: ${e.title}.`);
      return [`You have ${list.length} ${list.length === 1 ? 'thing' : 'things'} planned. ${lines.join(' ')}`,
        { link: `#/agenda/${r.date}`, linkText: 'Open the agenda' }];
    }

    const day = Dates.fromKey(r.date);
    const list = mine.filter((e) => Dates.sameDay(e.start, day) && inPeriod(e.start, r.period));
    const when = `${Dates.relative(day, now)}${r.period ? ` ${r.period}` : ''}`;
    const link = { link: `#/agenda/${r.date}`, linkText: 'Open the agenda' };
    if (!list.length) return [`${when === Dates.long(day) ? `On ${when}` : when}, nothing is planned${person ? ` with ${person.name}` : ''}.`, link];
    return [
      `${when === Dates.long(day) ? `On ${when}` : when}, you have ${list.length} ${list.length === 1 ? 'thing' : 'things'}. ${list.map(eventLine).join(' ')}`,
      link,
    ];
  };

  const diaryAnswer = (r, now) => {
    const day = Dates.fromKey(r.date);
    const entries = diary.filter((d) => Dates.sameDay(d.date, day));
    const when = Dates.relative(day, now);
    const link = { link: `#/diary/${r.date}`, linkText: 'Open the diary' };
    if (!entries.length) return [`Nothing was written for ${when === Dates.long(day) ? when : lower(when)}.`, link];
    return [`${when}. ${entries.map((d) => d.text).join(' ')}`, link];
  };

  const personAnswer = (r, now) => {
    const p = r.personId && personById(r.personId);
    if (!p) {
      return [r.unknownName
        ? `I do not know ${r.unknownName} yet. You can say: add a new person called ${r.unknownName}.`
        : 'I am not sure who you mean. Say the name again, for example: who is Rose?'];
    }
    about(p.name);
    const link = { link: `#/people/${p.id}`, linkText: `Open ${p.name}'s page` };
    const news = memos.filter((m) => m.personId === p.id).sort((a, b) => b.date - a.date);
    const links = connections.filter((c) => c.a === p.id || c.b === p.id)
      .map((c) => c.text || `${personById(c.a)?.name} and ${personById(c.b)?.name}: ${c.label}`);

    if (r.topic === 'news') {
      return [news.length
        ? `The latest news about ${p.name}. ${news.slice(0, 2).map((m) => m.text).join(' ')}`
        : `I have no news about ${p.name} yet.`, link];
    }
    if (r.topic === 'origin') {
      return [p.origin || links.length
        ? `${p.name} is ${lower(p.relationship)}. ${p.origin || ''} ${links.join('. ')}`
        : `${p.name} is ${lower(p.relationship)}. I do not know yet how you met.`, link];
    }
    const next = events.filter((e) => e.personIds.includes(p.id) && e.start >= now).sort((a, b) => a.start - b.start)[0];
    return [
      `${p.name} is ${lower(p.relationship)}. ${p.origin || ''} ${news.length ? `Latest news: ${news[0].text}` : ''}`
      + (next ? ` You will see ${p.name} ${dayName(next.start, now)} at ${Speech.time(next.start)}.` : ''),
      link,
    ];
  };

  const searchAnswer = (query) => {
    const words = query.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length > 2);
    if (!words.length) return ['Tell me what to look for, for example: search for the radiator.'];

    const items = [
      ...people.map((p) => ({ text: `${p.name} is ${lower(p.relationship)}. ${p.origin || ''}`, hay: [p.name, p.relationship, p.origin, ...(p.facts || [])], link: `#/people/${p.id}` })),
      ...memos.map((m) => ({ text: m.text, hay: [m.text, personById(m.personId)?.name], link: `#/people/${m.personId}`, date: m.date })),
      ...notes.map((n) => ({ text: n.text, hay: [n.subject, n.text], link: `#/diary/${Dates.key(n.date)}`, date: n.date })),
      ...diary.map((d) => ({ text: `${Dates.long(d.date)}: ${d.text}`, hay: [d.text], link: `#/diary/${Dates.key(d.date)}`, date: d.date })),
      ...events.map((e) => ({ text: `${Dates.long(e.start)}. ${eventLine(e)}`, hay: [e.title, e.place, e.note], link: `#/agenda/${Dates.key(e.start)}`, date: e.start })),
    ];
    const found = items
      .map((item) => {
        const hay = item.hay.filter(Boolean).join(' ').toLowerCase();
        return { ...item, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || (b.date || 0) - (a.date || 0));

    if (!found.length) return [`I found nothing about ${query}.`];
    const top = found.slice(0, 3);
    // From a long text, only the sentences that contain a searched word are read.
    const relevant = (text) => {
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
      const hits = sentences.filter((s) => words.some((w) => s.toLowerCase().includes(w)));
      return (hits.length ? hits : sentences.slice(0, 1)).join(' ').trim();
    };
    return [
      `I found ${found.length} ${found.length === 1 ? 'thing' : 'things'} about ${query}. ${top.map((f) => relevant(f.text)).join(' ')}`,
      { link: top[0].link, linkText: 'Open the first one' },
    ];
  };

  // ---- Writing ----

  const addPerson = (p) => SampleData.add('people', {
    name: p.name,
    relationship: p.relationship || 'Someone you know',
    // On the map: "niece" for the user's own niece, "Rose's daughter" for someone known through Rose.
    link: p.relationship && !/^Your /.test(p.relationship) ? p.relationship : p.link || '',
    origin: p.origin || '',
    color: COLORS[people.length % COLORS.length],
    photo: null,
    facts: [],
  });

  // After an event with someone unknown: "Saba is not in your people yet. Shall I add Saba?"
  // One person at a time; the others follow.
  const newPersonFor = (event, names) => {
    const [name, ...others] = names.filter((n) => !people.some((p) => p.name.toLowerCase() === n.toLowerCase()));
    if (!name) return null;
    return {
      say: `${name} is not in your people yet.`,
      question: `Shall I add ${name}?`,
      fields: [{ key: 'name', label: 'Name', value: name }],
      apply: (v) => {
        const added = addPerson({ name: v.name || name });
        about(added.name);
        // The event now shows this person.
        const kept = SampleData.changeEvent(event.id, { personIds: [...event.personIds, added.id] }) || event;
        return { link: `#/people/${added.id}`, event: kept };
      },
      next: (result) => newPersonFor(result.event, others),
      done: (v) => `Done. ${v.name || name} is in your people. Tell me who ${v.name || name} is, for example: ${v.name || name} is my friend.`,
      link: '#/people', linkText: 'Open the page',
    };
  };

  // Both ends of a connection must be people: unknown names are added as new people.
  const addConnection = (c) => {
    const [a, b] = [c.a, c.b].map((end) => {
      if (end.id) return end.id;
      const existing = people.find((p) => p.name.toLowerCase() === end.name.toLowerCase());
      return (existing || addPerson({ name: end.name })).id;
    });
    SampleData.add('connections', { a, b, label: c.label, text: c.text });
  };

  // ---- Screen ----

  const LABELS = {
    idle: 'Talk to me', listening: 'I am listening…', thinking: 'One moment…', speaking: 'Tap to stop',
  };

  const view = () => '<section id="assistant" class="assistant"></section>';

  const render = () => {
    const box = $('assistant');
    if (!box) return; // another screen is showing
    const typed = $('assistant-box') ? $('assistant-box').value : '';
    const comment = $('review-box') ? $('review-box').value : '';
    const focused = document.activeElement && document.activeElement.id === 'assistant-box';

    const lines = log.map((l) => `
      <p class="said ${l.who}${l.error ? ' error' : ''}">
        ${esc(l.text)}
        ${l.link ? `<a class="said-link" href="${esc(l.link)}">${esc(l.linkText)}</a>` : ''}
      </p>`).join('');

    box.innerHTML = `
      <button id="talk" class="talk ${phase}" type="button" aria-label="${LABELS[phase]}">
        <span class="talk-icon" aria-hidden="true">${phase === 'speaking' ? '🔊' : '🎤'}</span>
      </button>
      <p class="talk-label">${LABELS[phase]}</p>
      ${phase === 'idle' && !log.length ? '<p class="talk-hint">Tap the button, then ask or tell me something.</p>' : ''}

      <div class="exchange" aria-live="polite">
        ${lines}
        ${live ? `<p class="said you live">${esc(live)}</p>` : ''}
      </div>

      ${confirm && confirm.fields && confirm.fields.length && phase !== 'thinking' ? `
        <div class="confirm-fields">
          ${confirm.fields.map((f, i) => `
            <label>${esc(f.label)}
              <input type="text" data-field="${i}" value="${esc(f.value)}" autocomplete="off"></label>`).join('')}
          <p class="source">You can correct the words here before saying yes.</p>
        </div>` : ''}

      ${confirm && confirm.places && confirm.places.length && phase !== 'thinking' ? `
        <div class="confirm-places">
          <p class="confirm-places-title">On the map</p>
          ${confirm.places.map((s, i) => `
            <button class="place-choice${i === confirm.chosen ? ' chosen' : ''}" type="button" data-place="${i}" aria-pressed="${i === confirm.chosen}">
              <strong>${esc(s.name)}</strong>
              <span>${esc([s.address, Places.far(s.km)].filter(Boolean).join(' · '))}</span>
            </button>`).join('')}
          <button class="place-choice${confirm.chosen < 0 ? ' chosen' : ''}" type="button" data-place="-1" aria-pressed="${confirm.chosen < 0}">
            <strong>None of these</strong>
            <span>Keep the place as I said it</span>
          </button>
          ${confirm.chosen >= 0 ? `<a class="said-link" href="${esc(Places.mapLink(confirm.places[confirm.chosen]))}" target="_blank" rel="noopener">Show it on the map</a>` : ''}
        </div>` : ''}

      ${(confirm || nameCheck) && phase !== 'thinking' ? `
        <div class="confirm">
          <button class="button primary big" type="button" data-answer="yes">Yes</button>
          <button class="button big" type="button" data-answer="no">No</button>
        </div>` : ''}

      ${review && phase === 'idle' ? reviewCard() : ''}

      <details class="examples">
        <summary>What can I say?</summary>
        <ul>
          <li>“What do I have today?”</li>
          <li>“When do I see Sarah?”</li>
          <li>“Who is Rose?” or “How do I know Paul?”</li>
          <li>“I plan to go to the market tomorrow at 10.”</li>
          <li>“Move the lunch with Sarah to 1 pm.”</li>
          <li>“Cancel my appointment with the doctor.”</li>
          <li>“Add a new person, her name is Julie, she is my niece.”</li>
          <li>“Julie is Sarah's daughter.”</li>
          <li>“Remember that Emma won her competition.”</li>
          <li>“Search for the radiator.”</li>
          <li>“What did I do yesterday?”</li>
        </ul>
        <form id="assistant-type" class="assistant-type">
          <label for="assistant-box">Or write it</label>
          <div><input id="assistant-box" type="text" autocomplete="off"><button class="button" type="submit">Send</button></div>
        </form>
        <label class="improve-switch">
          <input id="improve-switch" type="checkbox"${improve ? ' checked' : ''}>
          Improvement mode: after each request, ask me if it did what I wanted
        </label>
        ${Places.town() ? `
          <p class="source">Places are looked for around ${esc(Places.town().name)} when this device does not give its position.
            <button class="link-button" type="button" id="forget-town">Forget this town</button></p>` : ''}
      </details>`;

    if ($('review-box')) $('review-box').value = comment;

    if (typed || focused) {
      box.querySelector('.examples').open = true;
      $('assistant-box').value = typed;
      if (focused) $('assistant-box').focus();
    } else if (examplesOpen) {
      box.querySelector('.examples').open = true;
    }
  };

  let examplesOpen = false;

  const reviewCard = () => {
    if (review.state === 'thanks') return '<p class="review thanks">Thank you, it is noted.</p>';
    return `
      <div class="review">
        <p class="review-question">Did I do what you wanted?</p>
        ${review.state === 'explain' ? `
          <form id="review-form" class="review-form">
            <label for="review-box">What did you want?</label>
            <textarea id="review-box" rows="3"></textarea>
            <button class="button primary" type="submit">Send</button>
          </form>` : `
          <div class="review-buttons">
            <button class="button big review-yes" type="button" data-review="yes">Yes, it did what I wanted</button>
            <button class="button big review-no" type="button" data-review="no">No</button>
          </div>`}
      </div>`;
  };

  const mount = (changed) => {
    onChange = changed || onChange;
    const box = $('assistant');
    box.addEventListener('click', (e) => {
      if (e.target.closest('#talk')) {
        if (phase === 'idle') startListening(); else stop();
        return;
      }
      const answer = e.target.closest('[data-answer]');
      if (answer) {
        interrupt();
        heard(answer.dataset.answer, 'button');
        return;
      }
      const choice = e.target.closest('[data-place]');
      if (choice && confirm) {
        // The place kept is the one of the map, under its real name, or the words that were said.
        confirm.chosen = Number(choice.dataset.place);
        const field = confirm.fields.find((f) => f.key === 'place');
        const spot = confirm.places[confirm.chosen];
        if (field) field.value = placeName(confirm.saidPlace, spot);
        interrupt();
        render();
        return;
      }
      if (e.target.closest('#forget-town')) { Places.forgetTown(); render(); return; }
      const verdict = e.target.closest('[data-review]');
      if (verdict && review) {
        if (verdict.dataset.review === 'yes') sendReview('yes');
        else review.state = 'explain';
        render();
        if ($('review-box')) $('review-box').focus();
      }
    });
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'review-form') {
        sendReview('no', $('review-box').value.trim());
        render();
        return;
      }
      const text = $('assistant-box').value.trim();
      if (!text) return;
      $('assistant-box').value = '';
      interrupt();
      heard(text, 'typed');
    });
    // A correction typed in the confirmation card. Typing also stops the listening,
    // so that the app does not hear the keyboard or ask again while the user writes.
    box.addEventListener('input', (e) => {
      const index = e.target.dataset && e.target.dataset.field;
      if (index === undefined || !confirm) return;
      confirm.fields[Number(index)].value = e.target.value;
      if (phase !== 'idle') {
        interrupt();
        const button = $('talk');
        if (button) { button.className = 'talk idle'; }
        const label = box.querySelector('.talk-label');
        if (label) label.textContent = LABELS.idle;
      }
    });
    box.addEventListener('change', (e) => {
      if (e.target.id !== 'improve-switch') return;
      improve = e.target.checked;
      if (!improve) review = null;
      try { localStorage.setItem(IMPROVE_KEY, improve ? 'on' : 'off'); } catch { /* until the page is closed */ }
      render();
    });
    box.addEventListener('toggle', (e) => {
      if (e.target.classList && e.target.classList.contains('examples')) examplesOpen = e.target.open;
    }, true);
    render();
  };

  // True when nothing is going on, so the screen can be refreshed safely.
  const idle = () => phase === 'idle' && !confirm && !pending && !nameCheck && !townAsk && !(review && review.state !== 'thanks')
    && !($('assistant-box') && ($('assistant-box').value || document.activeElement === $('assistant-box')));

  return { view, mount, stop, idle, busy: () => phase !== 'idle' };
})();
