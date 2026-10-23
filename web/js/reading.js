// "Teach the app my voice": the user reads a long text aloud, without stopping.
//
// The sound is sent to the server while the user reads, and kept there as one long
// recording together with the text (server/readings.py). Later, on the computer,
// `dataset.bat` cuts it at the pauses and gives each piece its exact words: this is
// the data used to train a small speech model on this voice, and to measure it.
//
// The texts are in reading-texts.js. All of them take about ten minutes.
const Reading = (() => {
  const PEOPLE_KEY = 'dezheimer.myPeople';
  const PLACES_KEY = 'dezheimer.myPlaces';
  const DONE_KEY = `dezheimer.textsRead${I18n.fr ? '.fr' : ''}`;   // the texts of each language apart
  const SAMPLE_RATE = 16000;
  const PIECE_S = 8;             // the sound is sent in pieces of this many seconds
  const TRIES = 4;               // a piece that does not arrive is sent again

  let part = 0;                  // the text on the screen
  let state = 'choose';          // 'choose' | 'reading' | 'sending'
  let message = '';
  let isError = false;
  let total = null;              // what is kept on the computer: { readings, minutes }
  let wakeLock = null;

  // The reading going on.
  let session = '';
  let blocks = [];               // sound not yet sent
  let waiting = 0;               // samples in `blocks`
  let rate = SAMPLE_RATE;
  let pieces = 0;                // pieces handed to the server so far
  let sending = Promise.resolve();
  let lost = false;              // a piece could not be sent: the reading cannot be kept
  let startedAt = 0;
  let clock;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const stored = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
  const list = (text) => text.split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);

  // Names and places the user typed here, given to the speech model (mic.js).
  const myWords = () => ({ people: list(stored(PEOPLE_KEY)), places: list(stored(PLACES_KEY)) });

  // The texts already read on this device.
  const read = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch { return []; } };
  const markRead = (index) => {
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...read(), index])])); } catch { /* not remembered */ }
  };

  const note = (text, error = false) => { message = text; isError = error; };
  const minutes = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  // ---- Sending the sound ----

  // One piece, tried a few times: a phone network drops a request now and then.
  const post = async (path, options) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`/api/readings/${session}/${path}`, options);
        if (res.ok) return res.json();
        if (res.status < 500) throw Object.assign(new Error(`the server answered ${res.status}`), { final: true });
      } catch (err) {
        if (err.final || attempt >= TRIES) throw err;
      }
      if (attempt >= TRIES) throw new Error('the server did not answer');
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  };

  const sendPiece = () => {
    if (!waiting) return;
    const recorded = new Float32Array(waiting);
    let offset = 0;
    for (const block of blocks) { recorded.set(block, offset); offset += block.length; }
    blocks = [];
    waiting = 0;
    const { audio, rate: sentRate } = Mic.to16k(recorded, rate);
    const sound = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) sound[i] = Math.max(-1, Math.min(1, audio[i])) * 32767;
    const index = pieces++;
    sending = sending.then(() => post(`audio/${index}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(sentRate) },
      body: sound.buffer,
    })).catch(() => { lost = true; });
  };

  // ---- Reading ----

  const start = async () => {
    session = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    blocks = [];
    waiting = pieces = 0;
    lost = false;
    sending = Promise.resolve();
    note('');
    const on = await Mic.start({
      owner: 'reading',
      // The sound as it comes, not cut into phrases: the computer cuts it later.
      onBlock: (block, blockRate) => {
        rate = blockRate;
        blocks.push(block);
        waiting += block.length;
        if (waiting >= PIECE_S * rate) sendPiece();
      },
      onLevel: (level) => {
        const meter = $('reading-level');
        if (meter) meter.style.width = `${Math.min(100, level * 1200).toFixed(0)}%`;
      },
      onError: (text) => { state = 'choose'; note(text, true); paint(); },
      onStop: () => finish(),
    });
    if (!on) return;
    state = 'reading';
    startedAt = Date.now();
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* the screen may switch off */ }
    paint();
    window.scrollTo(0, 0);
    clock = setInterval(() => {
      const shown = $('reading-clock');
      if (shown) shown.textContent = minutes((Date.now() - startedAt) / 1000);
    }, 1000);
  };

  const stop = () => { if (Mic.isListening('reading')) Mic.stop(); };

  // The microphone is off: send what is left, then tell the server the reading is whole.
  const finish = async () => {
    if (state !== 'reading') return;
    clearInterval(clock);
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    state = 'sending';
    paint();
    sendPiece();
    await sending;
    const text = ReadingTexts[part];
    try {
      if (lost) throw new Error('a part of the sound did not arrive');
      const kept = await post('done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.title, text: text.paragraphs.join('\n\n'), pieces, lang: I18n.lang }),
      });
      markRead(part);
      note(tr(`Thank you. ${minutes(kept.seconds)} of your voice were kept.`, `Merci. ${minutes(kept.seconds)} de votre voix ont été gardées.`));
      if (total) total = { readings: total.readings + 1, minutes: Math.round((total.minutes + kept.seconds / 60) * 10) / 10 };
      // The next text that was not read yet, if there is one.
      const next = ReadingTexts.findIndex((_, i) => !read().includes(i));
      if (next >= 0) part = next;
    } catch (err) {
      note(tr(`This reading could not be kept: ${err.message}. Check that the computer is on, and read it again.`,
        `Cette lecture n’a pas pu être gardée : ${err.message}. Vérifiez que l’ordinateur est allumé, et relisez-la.`), true);
    }
    state = 'choose';
    paint();
    window.scrollTo(0, 0);
  };

  const count = async () => {
    try {
      const res = await fetch('/api/readings');
      if (res.ok) { total = await res.json(); paint(); }
    } catch { /* the server is not there: the count is not shown */ }
  };

  // ---- Screen ----

  const view = () => `
    <a class="back" href="#/">← ${tr('Back', 'Retour')}</a>
    <header class="page-head with-back">
      <h1>${tr('Teach the app my voice', 'Apprendre ma voix à l’application')}</h1>
      <p class="sub">${tr('Read a text aloud, from start to end. The three texts take about ten minutes.', 'Lisez un texte à voix haute, du début à la fin. Les trois textes prennent environ dix minutes.')}</p>
    </header>
    <div id="reading"></div>`;

  const paint = () => {
    const box = $('reading');
    if (!box) return; // another screen is showing
    const status = message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '';
    const text = ReadingTexts[part];

    if (state === 'reading') {
      box.innerHTML = `
        <div class="reading-bar">
          <span class="reading-on">● <span id="reading-clock">0:00</span></span>
          <div class="reading-meter"><span id="reading-level"></span></div>
          <button class="button primary" type="button" data-do="stop">${tr('I have finished', 'J’ai fini')}</button>
        </div>
        <article class="card reading-text">
          <h2>${esc(text.title)}</h2>
          ${text.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        </article>
        <p class="page-action"><button class="button primary big" type="button" data-do="stop">${tr('I have finished', 'J’ai fini')}</button></p>`;
      return;
    }
    if (state === 'sending') {
      box.innerHTML = `<p class="listen-status" role="status">${tr('Sending the end of the reading to the computer…', 'J’envoie la fin de la lecture à l’ordinateur…')}</p>`;
      return;
    }

    const done = read();
    const mine = { people: stored(PEOPLE_KEY), places: stored(PLACES_KEY) };
    box.innerHTML = `
      ${status}
      <div class="reading-parts">
        ${ReadingTexts.map((t, i) => `
          <button class="place-choice${i === part ? ' chosen' : ''}" type="button" data-part="${i}" aria-pressed="${i === part}">
            <strong>${esc(t.title)}</strong>
            <span>${done.includes(i) ? tr('Read ✓ — you can read it again', 'Lu ✓ — vous pouvez le relire') : tr('Not read yet', 'Pas encore lu')}</span>
          </button>`).join('')}
      </div>
      <p class="page-action">
        <button class="button primary big" type="button" data-do="start">${tr('Start reading', 'Commencer la lecture')}</button>
      </p>
      <p class="source">${tr('Read at your usual pace, as you would speak to the app. If you make a mistake, just go on: a part that does not match the text is left out. The sound is kept on the computer that runs Near.', 'Lisez à votre rythme habituel, comme vous parleriez à l’application. Si vous vous trompez, continuez : un passage qui ne correspond pas au texte est mis de côté. Le son est gardé sur l’ordinateur où tourne Near.')}</p>
      ${total ? `<p class="source">${tr(`Kept on the computer so far: ${total.readings} ${total.readings === 1 ? 'reading' : 'readings'}, about ${total.minutes} minutes.`,
        `Gardé sur l’ordinateur jusqu’ici : ${total.readings} ${total.readings === 1 ? 'lecture' : 'lectures'}, environ ${total.minutes} minutes.`)}</p>` : ''}
      <article class="card reading-text preview">
        <h2>${esc(text.title)}</h2>
        ${text.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      </article>
      <div class="account-form reading-words">
        <label>${tr('People you talk about (names, with commas)', 'Les personnes dont vous parlez (des prénoms, séparés par des virgules)')}
          <input type="text" id="my-people" autocomplete="off" value="${esc(mine.people)}" placeholder="Elinor, Lothan, Ilan"></label>
        <label>${tr('Places you go to', 'Les lieux où vous allez')}
          <input type="text" id="my-places" autocomplete="off" value="${esc(mine.places)}" placeholder="${tr('Carmel coffee, Park Leumi', 'Café Carmel, parc Leumi')}"></label>
        <p class="source">${tr('These words are given to the app so that it writes them right when you talk to it.', 'Ces mots sont donnés à l’application, pour qu’elle les écrive bien quand vous lui parlez.')}</p>
      </div>`;
  };

  const mount = () => {
    const box = $('reading');
    box.addEventListener('click', (e) => {
      const chosen = e.target.closest('[data-part]');
      if (chosen && state === 'choose') { part = Number(chosen.dataset.part); note(''); paint(); return; }
      const button = e.target.closest('[data-do]');
      if (!button) return;
      if (button.dataset.do === 'start' && state === 'choose') start();
      if (button.dataset.do === 'stop') stop();
    });
    box.addEventListener('change', (e) => {
      const key = { 'my-people': PEOPLE_KEY, 'my-places': PLACES_KEY }[e.target.id];
      if (!key) return;
      try { localStorage.setItem(key, e.target.value); } catch { /* until the page is closed */ }
    });
    paint();
    count();
  };

  return { view, mount, stop, myWords };
})();
