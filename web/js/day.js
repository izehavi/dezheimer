// "My day": the simple things of every day that become hard to keep track of.
//
// - To do today: what comes back every day (the pills, the meals). Each one is marked
//   as done with one touch, or by saying it. The app can then answer "Did I take my
//   pills?" and reminds aloud of what has a time and is not done.
// - Before I leave home: what to have in the pockets (keys, phone, card), checked once.
// - Good to know: things that do not change (the code of the building, where the keys are).
//   They are the notes that "Remember that ..." adds, shown here all together.
//
// Everything is in the app: nothing here needs the server.
const Day = (() => {
  const { tasks, ticks, notes } = SampleData;
  const USUAL = [
    { list: 'day', text: 'Take the morning pills', time: '08:00' },
    { list: 'day', text: 'Breakfast', time: '08:30' },
    { list: 'day', text: 'Lunch', time: '12:30' },
    { list: 'day', text: 'Dinner', time: '19:00' },
    { list: 'day', text: 'Take the evening pills', time: '21:00' },
    { list: 'leaving', text: 'Keys', time: '' },
    { list: 'leaving', text: 'Phone', time: '' },
    { list: 'leaving', text: 'Card', time: '' },
  ];
  const POCKET_MS = 10 * 60000;   // the check before leaving is forgotten after this long

  let pocket = new Set();         // what was checked before leaving, this time
  let pocketAt = 0;
  let refresh = () => {};         // redraws the screen
  let editing = false;            // "Change my lists" stays open while the user is in it

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // ---- What there is to do, and what is done ----

  const minutesOf = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const today = () => tasks.filter((t) => t.list === 'day')
    .sort((a, b) => (a.time ? minutesOf(a.time) : 1e4) - (b.time ? minutesOf(b.time) : 1e4));
  const leaving = () => tasks.filter((t) => t.list === 'leaving');
  const at = (task, now) => { const d = new Date(now); d.setHours(0, minutesOf(task.time), 0, 0); return d; };

  // The moment a thing was done today, or nothing.
  const doneAt = (task, now) => {
    const tick = ticks.find((k) => k.taskId === task.id && Dates.sameDay(k.at, now));
    return tick ? tick.at : null;
  };

  const tick = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && !doneAt(task, new Date())) SampleData.add('ticks', { taskId, at: new Date() });
  };

  const untick = (taskId) => {
    for (const k of ticks.filter((x) => x.taskId === taskId && Dates.sameDay(x.at, new Date()))) SampleData.remove('ticks', k.id);
  };

  // ---- By voice ----

  const SMALL = new Set(['take', 'took', 'the', 'your', 'my', 'have', 'had', 'eat', 'ate', 'and', 'some', 'for', 'did', 'done', 'with']);
  // "pills" and "pill" are the same word; so are "medicines" and "medicine".
  const keys = (text) => (text.toLowerCase().match(/[a-zà-ÿ]+/g) || [])
    .filter((w) => w.length > 2 && !SMALL.has(w)).map((w) => w.replace(/s$/, ''));

  // The thing of the day the words are about. When several fit ("my pills": morning or
  // evening), a question is about the last one that was due, a "done" about the first not done.
  const meant = (text, now, asking) => {
    const said = new Set(keys(text));
    const scored = today().map((t) => ({ t, score: keys(t.text).filter((w) => said.has(w)).length }))
      .filter((x) => x.score > 0);
    if (!scored.length) return null;
    const best = Math.max(...scored.map((x) => x.score));
    const fit = scored.filter((x) => x.score === best).map((x) => x.t);
    if (asking) {
      const due = fit.filter((t) => !t.time || at(t, now) - now < 30 * 60000);
      return due[due.length - 1] || fit[0];
    }
    return fit.find((t) => !doneAt(t, now)) || fit[fit.length - 1];
  };

  // What a sentence said to the assistant means here, or nothing when it is about something else.
  //   { say }            an answer to give
  //   { task, say }      a thing to mark as done, after a "yes"
  const understand = (text, now) => {
    const t = text.toLowerCase();
    // Another day than today is a question for the agenda or the diary.
    if (/\b(yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|last|next)\b/.test(t)) return null;

    if (leaving().length && /\b(i am|i'm|i’m) (leaving|going out)\b|\bbefore i (leave|go out)\b|\bready to (leave|go)\b/.test(t)) {
      return { say: `Before you leave, check that you have: ${leaving().map((x) => x.text.toLowerCase()).join(', ')}.`, link: '#/day', linkText: 'Open the list' };
    }
    if (/\bwhat\b.*\b(still|left)\b|\bwhat (else|more) (do i|is there)\b/.test(t) && today().length) {
      const left = today().filter((x) => !doneAt(x, now));
      return { say: left.length ? `You still have: ${left.map((x) => x.text).join(', ')}.` : 'You have done everything for today.', link: '#/day', linkText: 'Open my day' };
    }

    const asking = /^\W*(did|have|do|am|was|is)\b/.test(t) || /\?\s*$/.test(text);
    const telling = /^\W*(i|we|i've|i’ve|ok|okay|yes|so)\b.*\b(took|taken|had|ate|eaten|did|done|finished|made|drank|swallowed)\b/.test(t);
    if (!asking && !telling) return null;
    const task = meant(text, now, asking);
    if (!task) return null;
    const done = doneAt(task, now);
    const link = { link: '#/day', linkText: 'Open my day' };
    if (asking) {
      return { say: done ? `Yes. ${task.text}: done at ${Speech.time(done)}.`
        : `Not yet. ${task.text}${task.time ? `, planned at ${Speech.time(at(task, now))}` : ''}.`, ...link };
    }
    if (done) return { say: `${task.text}: it is already noted, at ${Speech.time(done)}.`, ...link };
    return { task, say: `${task.text}.`, ...link };
  };

  // ---- Reminders ----

  // The thing to remind of now, if any: at its time, and once more half an hour later.
  const due = (now, said) => {
    for (const task of today()) {
      if (!task.time || doneAt(task, now)) continue;
      const late = (now - at(task, now)) / 60000;
      const lead = late >= 0 && late < 3 ? 0 : late >= 30 && late < 33 ? 30 : null;
      const key = `${task.id}:${Dates.key(now)}:${lead}`;
      if (lead === null || said.has(key)) continue;
      return { key, text: `${SampleData.user.name}, ${lead ? 'a small reminder' : 'it is time'}: ${task.text}.` };
    }
    return null;
  };

  // ---- Screens ----

  const row = (task, now) => {
    const done = doneAt(task, now);
    return `
      <article class="event task${done ? ' past' : ''}">
        <p class="event-time">${task.time ? esc(Dates.time(at(task, now))) : ''}</p>
        <div class="event-body">
          <h3>${esc(task.text)}</h3>
          ${done ? `<p class="event-place">✓ Done at ${esc(Dates.time(done))}
            <button class="link-button" type="button" data-untick="${esc(task.id)}">Not done</button></p>` : ''}
        </div>
        ${done ? '' : `<button class="button primary" type="button" data-tick="${esc(task.id)}">Done</button>`}
      </article>`;
  };

  const todayList = (now) => (today().length ? today().map((t) => row(t, now)).join('')
    : '<p class="card empty">Nothing is on the list yet.</p>');

  // On the home screen.
  const homeBlock = (now) => (tasks.length ? `
    <section>
      <h2>To do today</h2>
      ${todayList(now)}
      <p class="day-links">
        ${leaving().length ? '<a class="button" href="#/day">Before I leave home</a>' : ''}
        <a class="button" href="#/day">Good to know</a>
      </p>
    </section>` : `
    <section>
      <h2>To do today</h2>
      <a class="card link-card" href="#/day">
        <p>The pills, the meals, what to take before leaving home, the code of the building.</p>
        <span class="more">Set up my day</span>
      </a>
    </section>`);

  const pocketList = () => {
    if (Date.now() - pocketAt > POCKET_MS) pocket = new Set();
    const items = leaving();
    const all = items.length && items.every((t) => pocket.has(t.id));
    return `
      <div class="pocket">
        ${items.map((t) => `
          <button class="place-choice${pocket.has(t.id) ? ' chosen' : ''}" type="button" data-pocket="${esc(t.id)}" aria-pressed="${pocket.has(t.id)}">
            <strong>${pocket.has(t.id) ? '✓ ' : ''}${esc(t.text)}</strong>
            <span>${pocket.has(t.id) ? 'I have it' : 'Touch when you have it'}</span>
          </button>`).join('')}
      </div>
      ${all ? '<p class="card pocket-ok"><strong>You have everything. You can go.</strong></p>' : ''}`;
  };

  const view = ({ now }) => `
    <a class="back" href="#/">← Back</a>
    <header class="page-head with-back">
      <h1>My day</h1>
      <p class="sub">What to do today, what to take before leaving, and what is good to know.</p>
    </header>

    <section>
      <h2>To do today</h2>
      ${todayList(now)}
    </section>

    <section>
      <h2>Before I leave home</h2>
      ${leaving().length ? pocketList() : '<p class="card empty">Nothing is on the list yet.</p>'}
    </section>

    <section>
      <h2>Good to know</h2>
      ${notes.length ? [...notes].sort((a, b) => b.date - a.date).map((n) => `
        <article class="card">
          <p>${esc(n.text)}</p>
          ${n.added ? `<button class="link-button" type="button" data-remove="notes:${esc(n.id)}">Remove</button>` : ''}
        </article>`).join('') : '<p class="card empty">Nothing yet. For example: the code of the building, where the keys are.</p>'}
      <form class="account-form day-form" data-day-form="note">
        <label>Something to know
          <input type="text" name="text" autocomplete="off" placeholder="The keys are in the blue bowl next to the door"></label>
        <div class="account-actions"><button class="button" type="submit">Add</button></div>
        <p class="source">You can also say it: “Remember that the keys are in the blue bowl.” Then ask: “Where are my keys?”</p>
      </form>
    </section>

    <details class="examples day-edit"${editing ? ' open' : ''}>
      <summary>Change my lists</summary>
      ${tasks.length ? '' : '<p class="page-action"><button class="button primary" type="button" data-usual>Start with the usual ones</button></p>'}
      <ul class="day-items">
        ${[...today(), ...leaving()].map((t) => `
          <li>${t.time ? `${esc(Dates.time(at(t, now)))} · ` : ''}${esc(t.text)}
            <span class="source">${t.list === 'day' ? 'every day' : 'before leaving'}</span>
            ${t.added ? `<button class="link-button" type="button" data-remove="tasks:${esc(t.id)}">Remove</button>` : ''}</li>`).join('')}
      </ul>
      <form class="account-form day-form" data-day-form="task">
        <label>Something to do every day
          <input type="text" name="text" autocomplete="off" placeholder="Water the plants"></label>
        <label>At what time (leave empty if any time)
          <input type="time" name="time"></label>
        <div class="account-actions"><button class="button" type="submit">Add to every day</button></div>
      </form>
      <form class="account-form day-form" data-day-form="leaving">
        <label>Something to have before leaving home
          <input type="text" name="text" autocomplete="off" placeholder="Glasses"></label>
        <div class="account-actions"><button class="button" type="submit">Add to before leaving</button></div>
      </form>
    </details>`;

  // Called once when the app opens. The touches are the same on the home screen and on "My day".
  const start = (redraw) => {
    refresh = redraw;
    const screen = document.getElementById('screen');
    screen.addEventListener('click', (e) => {
      const done = e.target.closest('[data-tick]');
      const undone = e.target.closest('[data-untick]');
      const have = e.target.closest('[data-pocket]');
      if (done) tick(done.dataset.tick);
      else if (undone) untick(undone.dataset.untick);
      else if (have) {
        if (pocket.has(have.dataset.pocket)) pocket.delete(have.dataset.pocket); else pocket.add(have.dataset.pocket);
        pocketAt = Date.now();
      } else if (e.target.closest('[data-usual]')) {
        for (const item of USUAL) SampleData.add('tasks', item);
        editing = true;
      } else return;
      refresh();
    });
    screen.addEventListener('submit', (e) => {
      const kind = e.target.dataset && e.target.dataset.dayForm;
      if (!kind) return;
      editing = kind !== 'note';
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;
      if (kind === 'note') SampleData.add('notes', { date: new Date(), subject: 'Note', text });
      else SampleData.add('tasks', { list: kind === 'task' ? 'day' : 'leaving', text, time: kind === 'task' ? e.target.time.value : '' });
      refresh();
    });
  };

  return { view, homeBlock, start, understand, tick, due };
})();
