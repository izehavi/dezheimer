// "Teach the app my voice": the user reads sentences aloud, one after the other.
//
// Each sentence is kept by the server as a sound file together with its exact words
// (server/recordings.py). Ten minutes give about a hundred of them: this is the data
// used to measure a small speech model on this voice, and to train it.
//
// The sentences are the kind of things said to the assistant, filled with the user's
// own people and places, because these are the words a speech model gets wrong.
const Reading = (() => {
  const PEOPLE_KEY = 'dezheimer.myPeople';
  const PLACES_KEY = 'dezheimer.myPlaces';
  const PER_SESSION = 120;       // about ten minutes
  const TOO_DIFFERENT = 0.5;     // share of wrong words above which the sentence is read again

  let sentences = [];            // the sentences of this session
  let index = 0;                 // the one on the screen
  let sent = [];                 // sentences read and not yet answered by the server, oldest first
  const failed = new Set();      // sentences that already came back once
  let saved = 0;                 // kept in this session
  let last = null;               // the last one kept: { name, sentence }, for "Again"
  let total = null;              // everything kept on the computer: { phrases, read, minutes }
  let message = '';
  let isError = false;
  let wakeLock = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const reading = () => Mic.isListening('reading');

  // ---- The user's own words ----

  const stored = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
  const list = (text) => text.split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);

  // Names and places typed here, for the speech model (mic.js) and for the sentences.
  const myWords = () => ({ people: list(stored(PEOPLE_KEY)), places: list(stored(PLACES_KEY)) });

  // ---- The sentences ----

  const DAYS = ['today', 'tomorrow', 'on Monday', 'on Tuesday', 'on Wednesday', 'on Thursday', 'on Friday',
    'on Saturday', 'on Sunday', 'next week', 'this evening', 'tomorrow morning'];
  const TIMES = ['at 9', 'at 10 in the morning', 'at noon', 'at 1 pm', 'at 3 pm', 'at half past four',
    'at 5:30', 'at 7 in the evening', 'at 8 pm', 'at a quarter past two'];
  const LINKS = ['sister', 'brother', 'aunt', 'uncle', 'cousin', 'friend', 'neighbour', 'grandfather',
    'grandmother', 'daughter', 'son', 'niece', 'nephew', 'doctor', 'colleague'];
  const THINGS = ['a coffee', 'a lunch', 'a dinner', 'a walk', 'a meeting', 'an appointment', 'a call', 'climbing'];
  const NEWS = ['started a new job', 'is moving next month', 'passed the exam', 'is working in chemistry',
    'has a new dog', 'is coming back on Friday', 'was ill last week', 'won the competition'];

  // {p} a person, {q} another person, {place}, {day}, {time}, {link}, {thing}, {news}.
  const TEMPLATES = [
    'What do I have {day}?', 'When do I see {p}?', 'What is my next appointment?', 'What did I do yesterday?',
    'Who is {p}?', 'How do I know {p}?', 'Any news from {p}?', 'Give me some information about {p}.',
    'What day is it?', 'What time is it?', 'Where are my keys?', 'Search for {place}.',
    'Add {thing} with {p} {day} {time}.', 'Add {thing} with {p} {day} {time} at {place}.',
    'I plan to go to {place} {day} {time}.', 'I want to go to {place} with {p} {day}.',
    'I am seeing {p} {day} {time}.', 'I have an appointment {day} {time} at {place}.',
    'Wanna go climbing with {p} {day}?', "Let's have {thing} with {p} and {q} {day}.",
    'Move {thing} with {p} to {time}.', 'Postpone the meeting with {p} to {day}.',
    'Change the place of {thing} with {p} to {place}.', 'Cancel my appointment with {p}.',
    'Cancel {thing} {day}.', 'Add a new person, the name is {p}.', 'Add a new person called {p}, my {link}.',
    '{p} is my {link}.', 'She is my {link}.', 'He is my {link}.', "{p} is {q}'s {link}.",
    '{p} and {q} know each other.', 'I met {p} at {place}.', 'Remember that {p} {news}.',
    'Memo about {p}. She {news}.', 'Add an information about {p}. He {news}.',
    'A memo: the keys are in the blue bowl.', 'Remember that the radiator must be repaired.',
    'It is at {place}.', 'At {place}.', 'Next to {place}.', 'With {p}.', 'With {p} and {q}.',
    '{day} {time}.', '{time}.', '{p}.', '{place}.',
  ];
  // Short answers: the ones a speech model drops or mistakes for noise.
  const SHORT = ['Yes.', 'No.', 'Yes, add it.', 'No, cancel.', 'Yeah.', 'Okay.', 'Alone.', 'Nowhere.',
    'Yes, that is right.', 'No, that is wrong.', 'None of these.', 'Hello.', 'Thank you.', 'Stop.', 'Help.',
    'Say it again.', 'What can I say?'];

  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffled = (items) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const build = () => {
    const mine = myWords();
    const known = SampleData.people.map((p) => p.name.replace(/^Dr\. /, ''));
    const agenda = SampleData.events.map((e) => (e.place || '').replace(/^(At|In) /, ''))
      // Only real names of places: "Carmel coffee", not "Rose comes to pick you up".
      .filter((p) => p && !/^(home|the )/i.test(p) && !p.includes(',') && p.split(' ').length <= 3);
    const people = [...new Set([...mine.people, ...known])];
    const places = [...new Set([...mine.places, ...agenda])];
    // With nothing of the user's own yet, common names stand in.
    const p = people.length ? people : ['Sarah', 'David', 'Rose', 'Paul', 'Emma'];
    const where = places.length ? places : ['the market', 'the park', 'the library', 'the bakery'];

    const fill = (template) => {
      const first = pick(p);
      const second = pick(p.filter((name) => name !== first)) || first;
      const words = { p: first, q: second, place: pick(where), day: pick(DAYS), time: pick(TIMES),
        link: pick(LINKS), thing: pick(THINGS), news: pick(NEWS) };
      const text = template.replace(/\{(\w+)\}/g, (_, key) => words[key]);
      return text[0].toUpperCase() + text.slice(1);
    };

    const out = new Set(SHORT);
    // Every name and place is read at least a few times, then the templates go round.
    for (const name of p) for (const t of ['{p}.', 'With {p}.', 'Who is {p}?']) out.add(t.replace('{p}', name));
    for (const place of where) out.add(`At ${place}.`);
    for (let round = 0; out.size < PER_SESSION && round < 20; round++) {
      for (const template of shuffled(TEMPLATES)) {
        if (out.size >= PER_SESSION) break;
        out.add(fill(template));
      }
    }
    return shuffled([...out]).slice(0, PER_SESSION);
  };

  // ---- Was it the sentence? ----

  // The words of a sentence, as the server compares them: no capitals, no punctuation.
  const words = (text) => text.toLowerCase()
    .replace(/(\d)\s*([ap])\.?\s?m\b\.?/g, '$1 $2m').replace(/['’]/g, '')
    .match(/[a-z0-9à-ÿ]+/g) || [];

  const wrongWords = (said, heard) => {
    let row = heard.map((_, j) => j);
    row.push(heard.length);
    for (let i = 1; i <= said.length; i++) {
      const next = [i];
      for (let j = 1; j <= heard.length; j++) {
        next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (said[i - 1] !== heard[j - 1] ? 1 : 0));
      }
      row = next;
    }
    return row[heard.length];
  };

  // ---- Reading ----

  const note = (text, error = false) => { message = text; isError = error; };

  const start = async () => {
    if (!sentences.length || index >= sentences.length) { sentences = build(); index = 0; }
    sent = [];
    note('');
    const on = await Mic.start({
      owner: 'reading',
      keep: true,
      partials: false,
      said: () => sentences[index] || '',
      // The sentence is read: the next one shows at once, while this one is checked.
      onCut: () => {
        if (index >= sentences.length) return;
        sent.push(sentences[index]);
        index += 1;
        if (index >= sentences.length) Mic.stop();
        paint();
      },
      onPhrase: (text, time, audio) => checked(text, audio),
      onLevel: (level) => {
        const meter = $('reading-level');
        if (meter) meter.style.width = `${Math.min(100, level * 1200).toFixed(0)}%`;
      },
      onError: (text) => { note(text, true); paint(); },
      onStop: () => { release(); paint(); },
    });
    if (on) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* the screen may switch off */ }
    }
    paint();
  };

  const release = () => {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  };

  const stop = () => { if (reading()) Mic.stop(); };

  // A sentence that was not kept is read again, right after the one on the screen.
  const again = (sentence) => {
    sentences.splice(Math.min(index + 1, sentences.length), 0, sentence);
  };

  // The server wrote the phrase down: `audio` is the name of the recording it kept.
  const checked = (heard, audio) => {
    const sentence = sent.shift();
    if (!sentence) return;
    const said = words(sentence);
    const different = wrongWords(said, words(heard || '')) / Math.max(1, said.length);
    if (!audio || different > TOO_DIFFERENT) {
      // Cut too early, a noise, or another sentence: a wrong pair would teach the model wrong.
      if (audio) forget(audio);
      // It comes back once. A sentence that fails twice is left out, so that nobody gets stuck on it.
      if (!failed.has(sentence)) {
        failed.add(sentence);
        again(sentence);
        note('One sentence was not heard well. It comes back after this one.');
      }
    } else {
      saved += 1;
      last = { name: audio, sentence };
      if (total) { total.phrases += 1; total.read += 1; }
      note('');
    }
    paint();
  };

  const forget = (name) => fetch(`/api/recordings/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});

  const count = async () => {
    try {
      const res = await fetch('/api/recordings');
      if (res.ok) { total = await res.json(); paint(); }
    } catch { /* the server is not there: the count is not shown */ }
  };

  // ---- Screen ----

  const view = () => `
    <a class="back" href="#/">← Back</a>
    <header class="page-head with-back">
      <h1>Teach the app my voice</h1>
      <p class="sub">Read the sentences aloud, one after the other. Ten minutes are enough for one time.</p>
    </header>
    <div id="reading"></div>`;

  const paint = () => {
    const box = $('reading');
    if (!box) return; // another screen is showing
    const status = message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '';
    const done = sentences.length && index >= sentences.length;
    const kept = total
      ? `<p class="source">Kept on the computer so far: ${total.phrases} phrases, about ${total.minutes} minutes of your voice.</p>` : '';

    if (reading()) {
      box.innerHTML = `
        <div class="card reading-card">
          <p class="reading-count">${index + 1} of ${sentences.length} · ${saved} kept</p>
          <p class="reading-sentence">${esc(sentences[index] || '')}</p>
          <div class="reading-meter"><span id="reading-level"></span></div>
          <p class="source">Read it at your usual pace, then stay quiet for a moment: the next one comes by itself.</p>
        </div>
        ${status}
        <p class="account-actions page-action">
          <button class="button" type="button" data-do="skip">Skip this one</button>
          ${last ? '<button class="button" type="button" data-do="again">Read the last one again</button>' : ''}
          <button class="button primary" type="button" data-do="stop">Stop</button>
        </p>`;
      return;
    }

    const mine = { people: stored(PEOPLE_KEY), places: stored(PLACES_KEY) };
    box.innerHTML = `
      ${done ? `<div class="card"><p><strong>Thank you.</strong> ${saved} sentences were kept this time.</p></div>` : ''}
      ${saved && !done ? `<div class="card"><p>${saved} sentences kept this time. You can go on where you stopped.</p></div>` : ''}
      ${status}
      <p class="page-action">
        <button class="button primary big" type="button" data-do="start">${done || !saved ? 'Start reading' : 'Go on'}</button>
      </p>
      ${kept}
      <div class="account-form reading-words">
        <label>People you talk about (names, with commas)
          <input type="text" id="my-people" autocomplete="off" value="${esc(mine.people)}" placeholder="Elinor, Lothan, Ilan"></label>
        <label>Places you go to
          <input type="text" id="my-places" autocomplete="off" value="${esc(mine.places)}" placeholder="Carmel coffee, Park Leumi"></label>
        <p class="source">These words are put in the sentences, and given to the app so that it writes them right when you talk to it.
          The sound of what you read is kept on the computer that runs Dezheimer, with the sentence.</p>
      </div>`;
  };

  const mount = () => {
    const box = $('reading');
    box.addEventListener('click', (e) => {
      const button = e.target.closest('[data-do]');
      if (!button) return;
      const action = button.dataset.do;
      if (action === 'start') start();
      if (action === 'stop') stop();
      if (action === 'skip' && index < sentences.length - 1) { index += 1; paint(); }
      if (action === 'again' && last) {
        forget(last.name);
        again(last.sentence);
        saved -= 1;
        if (total) { total.phrases -= 1; total.read -= 1; }
        last = null;
        note('It comes back after this one.');
        paint();
      }
    });
    box.addEventListener('change', (e) => {
      const key = { 'my-people': PEOPLE_KEY, 'my-places': PLACES_KEY }[e.target.id];
      if (!key) return;
      try { localStorage.setItem(key, e.target.value); } catch { /* until the page is closed */ }
      sentences = [];   // the next session uses the new words
    });
    paint();
    count();
  };

  return { view, mount, stop, myWords };
})();
