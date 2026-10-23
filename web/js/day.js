// "My day": the simple things of every day that become hard to keep track of.
//
// - To do today: what comes back every day, or on some days of the week (the pills, the
//   meals, the bins on Tuesday). Each one is marked as done with one touch, or by saying
//   it. The app can then answer "Did I take my pills?" and reminds aloud of what has a
//   time and is not done. The last seven days stay visible.
// - Step by step: something with steps, such as a recipe. The app keeps the place: what
//   is already out, which step comes now, whether the salt is in.
// - Before I leave home: what to have in the pockets (keys, phone, card), checked once.
// - Good to know: things that do not change (the code of the building, where the keys are).
//   They are the notes that "Remember that ..." adds, shown here all together.
//
// Everything works in the app alone. When the user is signed in, the things of the day
// and what is done are also sent to the server (routine.js), which reminds when the app
// is closed and tells the relatives when the pills or a meal are not noted.
//
// "Did I take my pills?" is never answered from the user's memory: from the note made at
// the moment, or else, for the pills, from the pill box. A double dose is more dangerous
// than a late one.
const Day = (() => {
  const { tasks, ticks, notes, guides } = SampleData;
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
  const USUAL_GUIDES = [
    { name: 'A cup of tea', things: ['A cup', 'A tea bag', 'Water'], steps: ['Fill the kettle with water and switch it on.', 'Put the tea bag in the cup.', 'When the water has boiled, pour it in the cup.', 'Wait three minutes, then take the tea bag out.', 'Switch the kettle off.'] },
    { name: 'An omelette', things: ['Two eggs', 'Butter', 'Salt', 'A pan', 'A bowl and a fork'], steps: ['Break the two eggs in the bowl.', 'Add a pinch of salt and beat with the fork.', 'Melt a little butter in the pan, on a medium heat.', 'Pour the eggs in the pan.', 'When the eggs are set, fold the omelette and put it on a plate.', 'Switch the heat off.'] },
  ];
  const POCKET_MS = 10 * 60000;     // the check before leaving is forgotten after this long
  const STEPS_MS = 6 * 3600000;     // something step by step left alone this long is forgotten
  const STEPS_KEY = `dezheimer.${SampleData.profile() ? 'own.' : ''}steps`;
  const EARLY_MS = 60 * 60000;     // more than this before its time, a thing is "not time yet"
  const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let pocket = new Set();           // what was checked before leaving, this time
  let pocketAt = 0;
  let refresh = () => {};           // redraws the screen
  let editing = false;              // "Change my lists" stays open while the user is in it

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // ---- What there is to do, and what is done ----

  const minutesOf = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const byTime = (a, b) => (a.time ? minutesOf(a.time) : 1e4) - (b.time ? minutesOf(b.time) : 1e4);
  const everyDay = () => tasks.filter((t) => t.list === 'day').sort(byTime);
  // A thing with `days` only comes on those days of the week (0 is Sunday).
  const on = (task, date) => !task.days || !task.days.length || task.days.includes(date.getDay());
  const today = (now = new Date()) => everyDay().filter((t) => on(t, now));
  const leaving = () => tasks.filter((t) => t.list === 'leaving');
  const at = (task, now) => { const d = new Date(now); d.setHours(0, minutesOf(task.time), 0, 0); return d; };
  const when = (task) => (task.days && task.days.length ? task.days.map((d) => WEEK[d]).join(', ') : 'every day');

  // What kind of thing it is. The pills need the most care; a meal or a drink missed
  // matters too (server/routine.py tells the relatives); the rest is only reminded.
  const kindOf = (text) => (/\b(pills?|medicines?|medication|tablets?|capsules?|drops|insulin|inhaler)\b/i.test(text) ? 'pills'
    : /\b(breakfast|lunch|dinner|supper|meal|eat|snack)\b/i.test(text) ? 'meal'
      : /\bdrink\b|\bglass of water\b|\bcup of tea\b|\bhydrat/i.test(text) ? 'drink'
        : /\b(shower|bath|wash|teeth|shave|toilet)\b/i.test(text) ? 'hygiene' : 'other');
  const isPills = (task) => kindOf(task.text) === 'pills';

  // The box of a pill box for a thing at its time: "Wednesday morning". The same parts
  // of the day as the server's (routine.py).
  const box = (task, date) => {
    const hour = task.time ? Number(task.time.split(':')[0]) : 8;
    return `${WEEK[date.getDay()]} ${hour < 11 ? 'morning' : hour < 15 ? 'midday' : hour < 20 ? 'evening' : 'night'}`;
  };
  // "Take the morning pills" -> "the morning pills"
  const what = (task) => task.text.replace(/^take\s+/i, '').replace(/^\w/, (c) => c.toLowerCase());

  // The moment a thing was done on that day, or nothing.
  const doneAt = (task, day) => {
    const tick = ticks.find((k) => k.taskId === task.id && Dates.sameDay(k.at, day));
    return tick ? tick.at : null;
  };

  // `how`: "button", "voice" or "box" (the pill box was found empty), for the relatives.
  const tick = (taskId, how = 'button') => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && !doneAt(task, new Date())) SampleData.add('ticks', { taskId, at: new Date(), how });
  };

  const untick = (taskId) => {
    for (const k of ticks.filter((x) => x.taskId === taskId && Dates.sameDay(x.at, new Date()))) SampleData.remove('ticks', k.id);
  };

  // ---- Step by step ----

  // The thing being done now: { guideId, step, have, startedAt }. `step` is the number of
  // steps already done; `have` the things already out. Kept if the app is closed meanwhile.
  let doing = null;
  try { doing = JSON.parse(localStorage.getItem(STEPS_KEY) || 'null'); } catch { /* nothing going on */ }

  const keep = () => {
    try {
      if (doing) localStorage.setItem(STEPS_KEY, JSON.stringify(doing)); else localStorage.removeItem(STEPS_KEY);
    } catch { /* kept until the page is closed */ }
  };

  // The guide being followed, or nothing. Forgotten when it was left alone for hours.
  const current = () => {
    if (!doing) return null;
    const guide = guides.find((g) => g.id === doing.guideId);
    if (!guide || Date.now() - doing.startedAt > STEPS_MS) { doing = null; keep(); return null; }
    return guide;
  };

  const begin = (guideId) => { doing = { guideId, step: 0, have: [], startedAt: Date.now() }; keep(); };
  const end = () => { doing = null; keep(); };
  const stepDone = () => { const g = current(); if (g && doing.step < g.steps.length) { doing.step += 1; keep(); } };
  const stepBack = () => { if (current() && doing.step > 0) { doing.step -= 1; keep(); } };

  // What to say about where things stand: the step to do now, or that it is finished.
  const nowSay = (guide) => (doing.step >= guide.steps.length
    ? `${guide.name}: everything is done.`
    : `Step ${doing.step + 1} of ${guide.steps.length}. ${guide.steps[doing.step]}`);

  // ---- By voice ----

  const SMALL = new Set(['take', 'took', 'the', 'your', 'my', 'have', 'had', 'eat', 'ate', 'and', 'some', 'for', 'did', 'done',
    'with', 'put', 'add', 'added', 'make', 'made', 'want', 'help', 'cook', 'prepare', 'start', 'let', 'when', 'then', 'little',
    'already', 'yet', 'now', 'into', 'out', 'off', 'two', 'three', 'one']);
  // "pills" and "pill" are the same word; so are "eggs" and "egg", "poured" and "pour".
  const keys = (text) => (text.toLowerCase().match(/[a-zà-ÿ]+/g) || [])
    .filter((w) => w.length > 2 && !SMALL.has(w)).map((w) => (w.length > 5 ? w.replace(/ed$/, '') : w).replace(/s$/, ''));
  const shared = (text, said) => keys(text).filter((w) => said.has(w)).length;

  // The thing of the day the words are about. When several fit ("my pills": morning or
  // evening), a question is about the last one that was due, a "done" about the first not done.
  const meant = (text, now, asking) => {
    const said = new Set(keys(text));
    const scored = today(now).map((t) => ({ t, score: shared(t.text, said) })).filter((x) => x.score > 0);
    if (!scored.length) return null;
    const best = Math.max(...scored.map((x) => x.score));
    const fit = scored.filter((x) => x.score === best).map((x) => x.t);
    if (asking) {
      const due = fit.filter((t) => !t.time || at(t, now) - now < 30 * 60000);
      return due[due.length - 1] || fit[0];
    }
    return fit.find((t) => !doneAt(t, now)) || fit[fit.length - 1];
  };

  // "at 10", "at 8:30", "at 9 pm" -> "10:00", "08:30", "21:00".
  const timeIn = (text) => {
    const m = text.match(/\bat (\d{1,2})(?:[:.h ](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (!m || Number(m[1]) > 23) return { time: '', rest: text };
    let hour = Number(m[1]);
    if (m[3] && /^p/i.test(m[3]) && hour < 12) hour += 12;
    if (m[3] && /^a/i.test(m[3]) && hour === 12) hour = 0;
    return { time: `${String(hour).padStart(2, '0')}:${m[2] || '00'}`, rest: text.replace(m[0], ' ') };
  };

  const DAY_LINK = { link: '#/day', linkText: 'Open my day' };
  const STEPS_LINK = { link: '#/day/steps', linkText: 'See the steps' };

  // While something is being done step by step.
  const aboutSteps = (text, t, guide) => {
    const said = new Set(keys(text));
    if (/\b(stop|cancel|end|leave)\b.*\b(recipe|cooking|steps?|this|it)\b|^\W*i (have|am) (finished|done)( with (it|this))?\W*$/.test(t)) {
      return { say: `All right. ${guide.name} is stopped.`, ...DAY_LINK, act: end };
    }
    if (/^\W*(done|it is done|it's done|i did it|ok(ay)?,? done|that is done|next( step)?|and then|then)\W*$/.test(t)) {
      if (doing.step >= guide.steps.length) return { say: nowSay(guide), ...STEPS_LINK };
      return { act: stepDone, sayAfter: () => nowSay(guide), ...STEPS_LINK };
    }
    if (/^\W*(what('s| is)? next|what now|and now|what do i do( now| next)?|what is the next step|which step)\W*$/.test(t)) {
      return { say: nowSay(guide), ...STEPS_LINK };
    }
    if (/\bwhere (am|was) i\b|\bwhat am i (doing|making|cooking)\b/.test(t)) {
      const done = guide.steps.slice(0, doing.step);
      return { say: `You are making: ${guide.name}. ${done.length ? `Already done: ${done.join(' ')}` : 'Nothing is done yet.'} Now: ${nowSay(guide)}`, ...STEPS_LINK };
    }
    if (/\bwhat do i need\b|\bwhat (are|were) the ingredients\b/.test(t)) {
      return { say: `For ${guide.name}, you need: ${guide.things.join(', ')}.`, ...STEPS_LINK };
    }

    // About one step: "Did I put the salt?", "The salt is in."
    // The step with the most words in common; between equals, the one to do now or the next ones.
    const scores = guide.steps.map((s) => shared(s, said));
    const best = Math.max(...scores);
    if (best <= 0) return null;
    const fits = scores.map((score, i) => (score === best ? i : -1)).filter((i) => i >= 0);
    const index = fits.find((i) => i >= doing.step) ?? fits[0];
    const asking = /^\W*(did|have|do|is|are|was)\b/.test(t) || /\?\s*$/.test(text);
    const telling = /^\W*(i|we|i've|i’ve|the|ok|okay|yes)\b.*\b(put|added|did|done|poured|broke|broken|beat|beaten|melted|mixed|cut|is in|are in|is on|is off)\b/.test(t);
    if (asking) {
      return { say: index < doing.step ? `Yes. It is done: ${guide.steps[index]}`
        : index === doing.step ? `Not yet. It is the step to do now: ${guide.steps[index]}`
          : `Not yet. It comes later, at step ${index + 1}. Now: ${nowSay(guide)}`, ...STEPS_LINK };
    }
    if (!telling) return null;
    if (index < doing.step) return { say: `Yes, it is already noted. Now: ${nowSay(guide)}`, ...STEPS_LINK };
    if (index === doing.step) return { act: stepDone, sayAfter: () => `Good. ${nowSay(guide)}`, ...STEPS_LINK };
    // A later step: the ones before were skipped, or done without saying it.
    return { say: `That is step ${index + 1}. Before it, there is: ${guide.steps[doing.step]} Tell me when it is done.`, ...STEPS_LINK };
  };

  // What a sentence said to the assistant means here, or nothing when it is about something else.
  //   { say }                        an answer to give
  //   { act, sayAfter }              something to do at once (a step), then an answer
  //   { say, ask: { question, apply, done } }   something to write down, after a "yes"
  const understand = (text, now) => {
    const t = text.toLowerCase().trim();
    const guide = current();
    if (guide) {
      const found = aboutSteps(text, t, guide);
      if (found) return found;
    }

    // "I want to make an omelette", "Help me make tea", "Start the omelette".
    if (/\b(make|cook|prepare|start|do)\b/.test(t) && !/\b(appointment|agenda|meeting)\b/.test(t)) {
      const said = new Set(keys(text));
      const wanted = guides.map((g) => ({ g, score: shared(g.name, said) })).filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (wanted) {
        return {
          act: () => begin(wanted.g.id), ...STEPS_LINK,
          sayAfter: () => `${wanted.g.name}. You need: ${wanted.g.things.join(', ')}. Then: ${nowSay(wanted.g)} Tell me when it is done.`,
        };
      }
    }

    // "Every day at 10, water the plants", "Remind me every Tuesday to take out the bins at 8".
    const every = t.match(/^\W*(?:please\s+)?(?:remind me\s+)?(?:add to my day|every\s*day|each day|every (sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/);
    if (every) {
      const days = every[1] ? [WEEK.findIndex((d) => d.toLowerCase() === every[1])] : [];
      const { time, rest } = timeIn(text.slice(every[0].length));
      const what = rest.replace(/^[\s,:]*(to|i must|i have to|i need to|i)\s+/i, '').replace(/[\s,.]+$/, '').replace(/^[\s,:]+/, '').replace(/\s+/g, ' ');
      if (!what) return { say: 'Tell me what to do, for example: every day at 10, water the plants.' };
      const item = { list: 'day', text: what[0].toUpperCase() + what.slice(1), time, ...(days.length ? { days } : {}) };
      return {
        say: `${days.length ? `Every ${WEEK[days[0]]}` : 'Every day'}${time ? ` at ${Speech.time(at(item, now))}` : ''}: ${item.text}.`,
        ask: { question: 'Shall I add it to your day?', apply: () => { SampleData.add('tasks', item); }, done: 'Done. It is in your day.' },
        ...DAY_LINK,
      };
    }

    // "The box is empty": the pills were taken, even if nothing was noted.
    if (/\b(box|compartment|pill ?box|dosette)\b.*\bempty\b|\bempty\b.*\b(box|compartment)\b/.test(t)) {
      const open = today(now).filter((x) => isPills(x) && !doneAt(x, now) && (!x.time || at(x, now) - now < 30 * 60000));
      const task = open[open.length - 1];
      if (!task) return { say: 'Your pills of today are already noted.', ...DAY_LINK };
      return {
        say: `The box of ${box(task, now)} is empty: you have taken ${what(task)}.`, ...DAY_LINK,
        ask: { question: 'Shall I note it?', apply: () => { tick(task.id, 'box'); }, done: 'Done. It is noted.' },
      };
    }

    // Another day than today is a question for the agenda or the diary.
    if (/\b(yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|last|next)\b/.test(t)) return null;

    if (leaving().length && /\b(i am|i'm|i’m) (leaving|going out)\b|\bbefore i (leave|go out)\b|\bready to (leave|go)\b/.test(t)) {
      return { say: `Before you leave, check that you have: ${leaving().map((x) => x.text.toLowerCase()).join(', ')}.`, link: '#/day', linkText: 'Open the list' };
    }
    if (/\bwhat\b.*\b(still|left)\b|\bwhat (else|more) (do i|is there)\b/.test(t) && today(now).length) {
      const left = today(now).filter((x) => !doneAt(x, now));
      return { say: left.length ? `You still have: ${left.map((x) => x.text).join(', ')}.` : 'You have done everything for today.', ...DAY_LINK };
    }

    const asking = /^\W*(did|have|do|am|was|is)\b/.test(t) || /\?\s*$/.test(text);
    const telling = /^\W*(i|we|i've|i’ve|ok|okay|yes|so)\b.*\b(took|taken|had|ate|eaten|did|done|finished|made|drank|swallowed)\b/.test(t);
    if (!asking && !telling) return null;
    const task = meant(text, now, asking);
    if (!task) return null;
    const done = doneAt(task, now);
    if (asking) return { say: answer(task, now), ...DAY_LINK };
    if (done) return { say: `${task.text}: it is already noted, at ${Speech.time(done)}.${isPills(task) ? ' Do not take them again.' : ''}`, ...DAY_LINK };
    // Pills taken long before their time are noted, but said: the relatives will see it.
    const early = isPills(task) && task.time && at(task, now) - now > EARLY_MS;
    return {
      say: `${task.text}.${early ? ` These are the pills of ${Speech.time(at(task, now))}, not of now.` : ''}`, ...DAY_LINK,
      ask: { question: 'Shall I note that it is done?', apply: () => { tick(task.id, 'voice'); }, done: 'Done. It is noted.' },
    };
  };

  // "Did I take my pills?", "Have I had lunch?": from the note, never from memory.
  const answer = (task, now) => {
    const done = doneAt(task, now);
    if (done) return `Yes. ${task.text}: done at ${Speech.time(done)}.${isPills(task) ? ' You do not need to take them again.' : ''}`;
    const time = task.time ? at(task, now) : null;
    if (time && time > now) return `Not yet. ${task.text}: planned at ${Speech.time(time)}.`;
    const kind = kindOf(task.text);
    if (kind === 'pills') {
      return `I have no note of it. Look at your pill box, at ${box(task, now)}. If the pills are still in it, take them now, then tell me. If it is empty, you have already taken them.`;
    }
    if (kind === 'meal') return `I have no note of ${what(task)}. It is a good time to eat something. Tell me when you have eaten.`;
    if (kind === 'drink') return 'I have no note of it. Have a glass of water now: it does no harm.';
    return `Not noted yet. ${task.text}${time ? `, planned at ${Speech.time(time)}` : ''}.`;
  };

  // ---- Reminders ----

  // The thing to remind of now, if any: at its time, and once more half an hour later.
  const due = (now, said) => {
    for (const task of today(now)) {
      if (!task.time || doneAt(task, now)) continue;
      const late = (now - at(task, now)) / 60000;
      const lead = late >= 0 && late < 3 ? 0 : late >= 30 && late < 33 ? 30 : null;
      const key = `${task.id}:${Dates.key(now)}:${lead}`;
      if (lead === null || said.has(key)) continue;
      const where = isPills(task) ? ` They are in the box: ${box(task, now)}.` : '';
      return { key, taskId: task.id, text: `${SampleData.user.name}, ${lead ? 'a small reminder' : 'it is time'}: ${task.text}.${where}` };
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

  const todayList = (now) => (today(now).length ? today(now).map((t) => row(t, now)).join('')
    : '<p class="card empty">Nothing is on the list for today.</p>');

  // What is going on step by step, as a card that leads back to it.
  const doingCard = () => {
    const guide = current();
    return guide ? `
      <a class="card link-card doing" href="#/day/steps">
        <p><strong>You are making: ${esc(guide.name)}</strong></p>
        <p>${esc(nowSay(guide))}</p>
        <span class="more">Go on</span>
      </a>` : '';
  };

  // On the home screen.
  const homeBlock = (now) => (tasks.length || guides.length ? `
    <section>
      <h2>To do today</h2>
      ${doingCard()}
      ${todayList(now)}
      <p class="day-links">
        ${guides.length ? '<a class="button" href="#/day/steps">Step by step</a>' : ''}
        ${leaving().length ? '<a class="button" href="#/day">Before I leave home</a>' : ''}
        <a class="button" href="#/day">Good to know</a>
      </p>
    </section>` : `
    <section>
      <h2>To do today</h2>
      <a class="card link-card" href="#/day">
        <p>The pills, the meals, a recipe step by step, what to take before leaving home, the code of the building.</p>
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

  // The last seven days: what was done, for the user and for whoever helps them.
  const lastDays = (now) => {
    const days = [...Array(7)].map((_, i) => Dates.addDays(Dates.startOfDay(now), i - 6));
    if (!everyDay().length) return '';
    return `
      <section>
        <h2>The last seven days</h2>
        <div class="card week">
          <table>
            <thead><tr><th></th>${days.map((d) => `<th>${esc(WEEK[d.getDay()].slice(0, 2))}</th>`).join('')}</tr></thead>
            <tbody>
              ${everyDay().map((t) => `<tr><th>${esc(t.text)}</th>${days.map((d) => {
                if (!on(t, d)) return '<td></td>';
                const done = doneAt(t, d);
                return done ? `<td class="yes" title="Done at ${esc(Dates.time(done))}">✓</td>` : '<td class="no">–</td>';
              }).join('')}</tr>`).join('')}
            </tbody>
          </table>
          <p class="source">✓ done · – not noted</p>
        </div>
      </section>`;
  };

  const stepsView = () => {
    const guide = current();
    if (!guide) {
      return `
        <a class="back" href="#/day">← Back</a>
        <header class="page-head with-back">
          <h1>Step by step</h1>
          <p class="sub">Choose what you want to do. I keep your place, one step at a time.</p>
        </header>
        <div class="pocket">
          ${guides.map((g) => `
            <button class="place-choice" type="button" data-begin="${esc(g.id)}">
              <strong>${esc(g.name)}</strong>
              <span>${g.steps.length} steps</span>
            </button>`).join('') || '<p class="card empty">Nothing yet. Add one under “Change my lists”, in My day.</p>'}
        </div>
        <p class="source">You can also say: “I want to make an omelette.” Then: “What is next?”, “Did I put the salt?”, “Done.”</p>`;
    }
    const finished = doing.step >= guide.steps.length;
    return `
      <a class="back" href="#/day">← Back</a>
      <header class="page-head with-back">
        <h1>${esc(guide.name)}</h1>
      </header>
      <div class="card step-now">
        ${finished ? '<p class="step-text">Everything is done. Well done.</p>' : `
          <p class="reading-count">Step ${doing.step + 1} of ${guide.steps.length}</p>
          <p class="step-text">${esc(guide.steps[doing.step])}</p>`}
        <p class="account-actions step-actions">
          ${finished ? '<button class="button primary big" type="button" data-steps="end">I have finished</button>'
            : '<button class="button primary big" type="button" data-steps="next">Done, next step</button>'}
          ${doing.step > 0 ? '<button class="button" type="button" data-steps="back">Go back one step</button>' : ''}
        </p>
      </div>

      ${guide.things.length ? `
      <section>
        <h2>What you need</h2>
        <div class="pocket">
          ${guide.things.map((thing, i) => `
            <button class="place-choice${doing.have.includes(i) ? ' chosen' : ''}" type="button" data-have="${i}" aria-pressed="${doing.have.includes(i)}">
              <strong>${doing.have.includes(i) ? '✓ ' : ''}${esc(thing)}</strong>
            </button>`).join('')}
        </div>
      </section>` : ''}

      <section>
        <h2>All the steps</h2>
        <ol class="step-list">
          ${guide.steps.map((s, i) => `<li class="${i < doing.step ? 'done' : i === doing.step ? 'now' : ''}">${i < doing.step ? '✓ ' : ''}${esc(s)}</li>`).join('')}
        </ol>
      </section>
      <p class="page-action"><button class="button" type="button" data-steps="end">Stop</button></p>`;
  };

  // The screen a notification opens: one thing to do now, and one big button.
  const nowView = (taskId, now) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return '<a class="back" href="#/">← Back</a><p class="empty">This is no longer in your day.</p>';
    const done = doneAt(task, now);
    const pills = isPills(task);
    const early = task.time && at(task, now) - now > EARLY_MS;
    return `
      <a class="back" href="#/">← Back</a>
      ${!done && early ? `<p class="card now-early">It is not time yet: this is for ${esc(Dates.time(at(task, now)))}.${pills ? ' Do not take these pills now.' : ''}</p>` : ''}
      <div class="card now-card${done ? ' done' : ''}">
        ${done ? `
          <p class="now-title">✓ ${esc(task.text)}</p>
          <p class="now-text">Done at ${esc(Dates.time(done))}.${pills ? ' You do not need to take them again.' : ''}</p>
          <p class="page-action"><a class="button primary big" href="#/">Back to today</a></p>` : `
          <p class="hello-date">${task.time ? `At ${esc(Dates.time(at(task, now)))}` : 'Today'}</p>
          <p class="now-title">${esc(task.text)}</p>
          ${pills ? `<p class="now-text">Take them from your pill box: <strong>${esc(box(task, now))}</strong>.</p>` : ''}
          <p class="page-action"><button class="button${early ? '' : ' primary big'}" type="button" data-now-done="${esc(task.id)}">${pills ? 'I took them' : 'It is done'}</button></p>
          ${pills ? `<p class="page-action"><button class="button" type="button" data-now-box="${esc(task.id)}">The box is already empty</button></p>` : ''}
          <p class="page-action"><a class="button" href="#/">Not now</a></p>`}
      </div>`;
  };

  const view = ({ now, arg, more }) => (arg === 'now' ? nowView(more, now) : arg === 'steps' ? stepsView() : `
    <a class="back" href="#/">← Back</a>
    <header class="page-head with-back">
      <h1>My day</h1>
      <p class="sub">What to do today, what to take before leaving, and what is good to know.</p>
    </header>

    <section>
      <h2>To do today</h2>
      ${doingCard()}
      ${todayList(now)}
      ${guides.length ? '<p class="day-links"><a class="button" href="#/day/steps">Do something step by step</a></p>' : ''}
    </section>

    ${Routine.pushCard()}

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

    ${lastDays(now)}

    <details class="examples day-edit"${editing ? ' open' : ''}>
      <summary>Change my lists</summary>
      ${tasks.length || guides.length ? '' : '<p class="page-action"><button class="button primary" type="button" data-usual>Start with the usual ones</button></p>'}
      <ul class="day-items">
        ${[...everyDay(), ...leaving()].map((t) => `
          <li>${t.time ? `${esc(Dates.time(at(t, now)))} · ` : ''}${esc(t.text)}
            <span class="source">${t.list === 'day' ? esc(when(t)) : 'before leaving'}</span>
            ${t.added ? `<button class="link-button" type="button" data-remove="tasks:${esc(t.id)}">Remove</button>` : ''}</li>`).join('')}
        ${guides.map((g) => `
          <li>${esc(g.name)} <span class="source">step by step, ${g.steps.length} steps</span>
            ${g.added ? `<button class="link-button" type="button" data-remove="guides:${esc(g.id)}">Remove</button>` : ''}</li>`).join('')}
      </ul>
      <form class="account-form day-form" data-day-form="task">
        <label>Something to do
          <input type="text" name="text" autocomplete="off" placeholder="Water the plants"></label>
        <label>At what time (leave empty if any time)
          <input type="time" name="time"></label>
        <fieldset class="weekdays">
          <legend>On which days (none ticked: every day)</legend>
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="days" value="${d}"> ${WEEK[d].slice(0, 3)}</label>`).join('')}
        </fieldset>
        <div class="account-actions"><button class="button" type="submit">Add to my day</button></div>
        <p class="source">You can also say: “Every day at 10, water the plants.” or “Every Tuesday at 8, take out the bins.”</p>
      </form>
      <form class="account-form day-form" data-day-form="leaving">
        <label>Something to have before leaving home
          <input type="text" name="text" autocomplete="off" placeholder="Glasses"></label>
        <div class="account-actions"><button class="button" type="submit">Add to before leaving</button></div>
      </form>
      <form class="account-form day-form" data-day-form="guide">
        <label>Something to do step by step
          <input type="text" name="text" autocomplete="off" placeholder="Pasta with tomato sauce"></label>
        <label>What is needed (one on each line)
          <textarea name="things" rows="4" placeholder="Pasta&#10;A jar of tomato sauce&#10;Salt"></textarea></label>
        <label>The steps (one on each line)
          <textarea name="steps" rows="6" placeholder="Boil water in a large pan.&#10;Add salt and the pasta.&#10;After ten minutes, drain the pasta."></textarea></label>
        <div class="account-actions"><button class="button" type="submit">Add to step by step</button></div>
      </form>
    </details>`);

  // Called once when the app opens. The touches are the same on the home screen and on "My day".
  const start = (redraw) => {
    refresh = redraw;
    const screen = document.getElementById('screen');
    const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
    screen.addEventListener('click', (e) => {
      const hit = (name) => e.target.closest(`[data-${name}]`);
      if (hit('tick')) tick(hit('tick').dataset.tick);
      else if (hit('now-done')) { tick(hit('now-done').dataset.nowDone, 'button'); Speech.say('Good. It is noted.'); }
      else if (hit('now-box')) { tick(hit('now-box').dataset.nowBox, 'box'); Speech.say('Then you have already taken them. It is noted.'); }
      else if (hit('untick')) untick(hit('untick').dataset.untick);
      else if (hit('pocket')) {
        const id = hit('pocket').dataset.pocket;
        if (pocket.has(id)) pocket.delete(id); else pocket.add(id);
        pocketAt = Date.now();
      } else if (hit('usual')) {
        for (const item of USUAL) SampleData.add('tasks', item);
        for (const guide of USUAL_GUIDES) SampleData.add('guides', guide);
        editing = true;
      } else if (hit('begin')) {
        begin(hit('begin').dataset.begin);
        const guide = current();
        Speech.say(`${guide.name}. ${nowSay(guide)}`);
      } else if (hit('have') && current()) {
        const i = Number(hit('have').dataset.have);
        doing.have = doing.have.includes(i) ? doing.have.filter((x) => x !== i) : [...doing.have, i];
        keep();
      } else if (hit('steps')) {
        const action = hit('steps').dataset.steps;
        if (action === 'end') { end(); Speech.stop(); }
        if (action === 'back') stepBack();
        if (action === 'next') stepDone();
        // The step to do now is said aloud: the eyes and the hands are busy.
        if (action !== 'end' && current()) Speech.say(nowSay(current()));
      } else return;
      refresh();
    });
    screen.addEventListener('submit', (e) => {
      const kind = e.target.dataset && e.target.dataset.dayForm;
      if (!kind) return;
      e.preventDefault();
      const form = e.target;
      const text = form.text.value.trim();
      if (!text) return;
      editing = kind !== 'note';
      if (kind === 'note') SampleData.add('notes', { date: new Date(), subject: 'Note', text });
      else if (kind === 'guide') {
        const steps = lines(form.steps.value);
        if (!steps.length) { form.steps.focus(); return; }
        SampleData.add('guides', { name: text, things: lines(form.things.value), steps });
      } else if (kind === 'task') {
        const days = [...form.querySelectorAll('[name=days]:checked')].map((box) => Number(box.value));
        SampleData.add('tasks', { list: 'day', text, time: form.time.value, ...(days.length ? { days } : {}) });
      } else SampleData.add('tasks', { list: 'leaving', text, time: '' });
      refresh();
    });
  };

  // From the reminder: done, and the screen shows it.
  const markDone = (taskId) => { tick(taskId, 'button'); refresh(); };

  return { view, homeBlock, start, understand, tick, markDone, due, kindOf, today, doneAt };
})();
