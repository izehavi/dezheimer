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
    { list: 'day', text: tr('Take the morning pills', 'Prendre les médicaments du matin'), time: '08:00' },
    { list: 'day', text: tr('Breakfast', 'Petit-déjeuner'), time: '08:30' },
    { list: 'day', text: tr('Lunch', 'Déjeuner'), time: '12:30' },
    { list: 'day', text: tr('Dinner', 'Dîner'), time: '19:00' },
    { list: 'day', text: tr('Take the evening pills', 'Prendre les médicaments du soir'), time: '21:00' },
    { list: 'leaving', text: tr('Keys', 'Clés'), time: '' },
    { list: 'leaving', text: tr('Phone', 'Téléphone'), time: '' },
    { list: 'leaving', text: tr('Card', 'Carte'), time: '' },
  ];
  const USUAL_GUIDES = I18n.fr ? [
    { name: 'Une tasse de thé', things: ['Une tasse', 'Un sachet de thé', 'De l’eau'], steps: ['Remplissez la bouilloire d’eau et allumez-la.', 'Mettez le sachet de thé dans la tasse.', 'Quand l’eau a bouilli, versez-la dans la tasse.', 'Attendez trois minutes, puis retirez le sachet.', 'Éteignez la bouilloire.'] },
    { name: 'Une omelette', things: ['Deux œufs', 'Du beurre', 'Du sel', 'Une poêle', 'Un bol et une fourchette'], steps: ['Cassez les deux œufs dans le bol.', 'Ajoutez une pincée de sel et battez avec la fourchette.', 'Faites fondre un peu de beurre dans la poêle, à feu moyen.', 'Versez les œufs dans la poêle.', 'Quand les œufs sont cuits, pliez l’omelette et mettez-la dans une assiette.', 'Éteignez le feu.'] },
  ] : [
    { name: 'A cup of tea', things: ['A cup', 'A tea bag', 'Water'], steps: ['Fill the kettle with water and switch it on.', 'Put the tea bag in the cup.', 'When the water has boiled, pour it in the cup.', 'Wait three minutes, then take the tea bag out.', 'Switch the kettle off.'] },
    { name: 'An omelette', things: ['Two eggs', 'Butter', 'Salt', 'A pan', 'A bowl and a fork'], steps: ['Break the two eggs in the bowl.', 'Add a pinch of salt and beat with the fork.', 'Melt a little butter in the pan, on a medium heat.', 'Pour the eggs in the pan.', 'When the eggs are set, fold the omelette and put it on a plate.', 'Switch the heat off.'] },
  ];
  const POCKET_MS = 10 * 60000;     // the check before leaving is forgotten after this long
  const STEPS_MS = 6 * 3600000;     // something step by step left alone this long is forgotten
  const STEPS_KEY = `dezheimer.${SampleData.profile() ? 'own.' : ''}steps`;
  const EARLY_MS = 60 * 60000;     // more than this before its time, a thing is "not time yet"
  const WEEK = tr(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']);
  const PART = tr(['morning', 'midday', 'evening', 'night'], ['matin', 'midi', 'soir', 'nuit']);

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
  const when = (task) => (task.days && task.days.length ? task.days.map((d) => WEEK[d]).join(', ') : tr('every day', 'tous les jours'));

  // What kind of thing it is. The pills need the most care; a meal or a drink missed
  // matters too (server/routine.py tells the relatives); the rest is only reminded.
  // The same words in French: "médicaments", "petit-déjeuner", "boire", "douche".
  const kindOf = (text) => (/\b(pills?|medicines?|medication|tablets?|capsules?|drops|insulin|inhaler|m[ée]dicaments?|comprim[ée]s?|cachets?|g[ée]lules?|pilules?|gouttes|insuline|inhalateur)\b/i.test(text) ? 'pills'
    : /\b(breakfast|lunch|dinner|supper|meal|eat|snack|d[ée]jeuner|d[îi]ner|souper|repas|manger|go[ûu]ter|collation)\b/i.test(text) ? 'meal'
      : /\bdrink\b|\bglass of water\b|\bcup of tea\b|\bhydrat|\bboire\b|\bverre d'eau\b|\btasse de th/i.test(text) ? 'drink'
        : /\b(shower|bath|wash|teeth|shave|toilet|douche|bain|laver|dents|raser|toilette)\b/i.test(text) ? 'hygiene' : 'other');
  const isPills = (task) => kindOf(task.text) === 'pills';

  // The box of a pill box for a thing at its time: "Wednesday morning". The same parts
  // of the day as the server's (routine.py).
  const box = (task, date) => {
    const hour = task.time ? Number(task.time.split(':')[0]) : 8;
    return `${WEEK[date.getDay()]} ${PART[hour < 11 ? 0 : hour < 15 ? 1 : hour < 20 ? 2 : 3]}`;
  };
  // "Take the morning pills" -> "the morning pills"; "Prendre les médicaments du matin" -> "les médicaments du matin".
  const what = (task) => task.text.replace(/^(take|prendre)\s+/i, '').replace(/^\w/, (c) => c.toLowerCase());

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
    ? tr(`${guide.name}: everything is done.`, `${guide.name} : tout est fait.`)
    : tr(`Step ${doing.step + 1} of ${guide.steps.length}. ${guide.steps[doing.step]}`, `Étape ${doing.step + 1} sur ${guide.steps.length}. ${guide.steps[doing.step]}`));

  // ---- By voice ----

  const SMALL = new Set(['take', 'took', 'the', 'your', 'my', 'have', 'had', 'eat', 'ate', 'and', 'some', 'for', 'did', 'done',
    'with', 'put', 'add', 'added', 'make', 'made', 'want', 'help', 'cook', 'prepare', 'start', 'let', 'when', 'then', 'little',
    'already', 'yet', 'now', 'into', 'out', 'off', 'two', 'three', 'one',
    // In French.
    'prendre', 'pris', 'prise', 'les', 'des', 'mes', 'mon', 'est', 'que', 'qui', 'fait', 'faire', 'avec', 'pour',
    'dans', 'sur', 'une', 'deux', 'trois', 'déjà', 'encore', 'mis', 'mise', 'mettre', 'ajouté', 'ajouter', 'bien',
    'ensuite', 'maintenant', 'veux', 'vais', 'voudrais', 'commence', 'commencer', 'préparer', 'prépare', 'cuisiner',
    'aide', 'aider', 'moi', 'tout', 'toute', 'cest', 'quoi', 'peu', 'aussi']);
  // "pills" and "pill" are the same word; so are "eggs" and "egg", "poured" and "pour".
  // In French, "déjeuner" and "déjeuné", "cassez" and "cassé" are the same word too.
  const stem = I18n.fr
    ? (w) => (w.length > 4 ? w.replace(/s$/, '').replace(/(ez|er|ée|é|e)$/, '') : w.replace(/s$/, ''))
    : (w) => (w.length > 5 ? w.replace(/ed$/, '') : w).replace(/s$/, '');
  const keys = (text) => (text.toLowerCase().replace(/[’']/g, ' ').match(/[a-zà-ÿœæ]+/g) || [])
    .filter((w) => w.length > 2 && !SMALL.has(w)).map(stem);
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

  // "at 10", "at 8:30", "at 9 pm" -> "10:00", "08:30", "21:00". In French: "à 10h", "à 8 h 30", "à 21 heures".
  const timeIn = (text) => {
    const m = I18n.fr ? text.match(/(?:^|\s)à (\d{1,2})(?:\s*(?:h|heures?|:)\s*(\d{2})?)?()/i)
      : text.match(/\bat (\d{1,2})(?:[:.h ](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (!m || Number(m[1]) > 23) return { time: '', rest: text };
    let hour = Number(m[1]);
    if (m[3] && /^p/i.test(m[3]) && hour < 12) hour += 12;
    if (m[3] && /^a/i.test(m[3]) && hour === 12) hour = 0;
    return { time: `${String(hour).padStart(2, '0')}:${m[2] || '00'}`, rest: text.replace(m[0], ' ') };
  };

  const DAY_LINK = { link: '#/day', linkText: tr('Open my day', 'Ouvrir ma journée') };
  const STEPS_LINK = { link: '#/day/steps', linkText: tr('See the steps', 'Voir les étapes') };

  // What a sentence says, in English or in French. French words often open with an accent,
  // which \b does not see: `(?<![a-zà-ÿ])` is used there instead.
  const FR = {
    stop: /(?<![a-zà-ÿ])(arr[eê]te|stop|annule|termine)(?![a-zà-ÿ]).*(recette|cuisine|[ée]tapes?|[çc]a)(?![a-zà-ÿ])|^\W*j'ai (fini|termin[ée])\W*$/,
    done: /^\W*(c'est fait|fait|j'ai fini|termin[ée]|suivant|[ée]tape suivante|et ensuite|ensuite|ok,? c'est fait|voil[aà])\W*$/,
    next: /^\W*(qu'est-ce que je fais (maintenant|ensuite)|qu'est-ce qu'il faut faire( maintenant| ensuite)?|et maintenant|c'est quoi la suite|la suite|quelle [ée]tape)\W*$/,
    where: /o[uù] (en )?suis-je|o[uù] j'en suis|qu'est-ce que je (fais|pr[ée]pare|cuisine)(?! (maintenant|ensuite))/,
    need: /de quoi (ai-je|j'ai) besoin|qu'est-ce qu'il (me )?faut|quels sont les ingr[ée]dients/,
    stepAsking: /^\W*(est-ce|ai-je)/,
    stepTelling: /^\W*(j'ai|j’ai|on a|c'est|ok|oui|le|la|les|l')(?![a-zà-ÿ]).*(?<![a-zà-ÿ])(mis|ajout[ée]e?s?|vers[ée]e?s?|cass[ée]e?s?|battue?s?|fondue?|m[ée]lang[ée]e?s?|coup[ée]e?s?|dedans|allum[ée]e?|[ée]teinte?)(?![a-zà-ÿ])/,
    make: /(?<![a-zà-ÿ])(faire|cuisiner|pr[ée]parer|pr[ée]pare|commencer)(?![a-zà-ÿ])/,
    notMake: /rendez-vous|agenda|r[ée]union/,
    every: /^\W*(?:rappelle-moi\s+)?(?:ajoute à ma journée|tous les jours|chaque jour|(?:chaque|tous les) (dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)s?)(?![a-zà-ÿ])/,
    box: /(?<![a-zà-ÿ])(bo[iî]te|compartiment|pilulier|case)(?![a-zà-ÿ]).*(?<![a-zà-ÿ])vide(?![a-zà-ÿ])|(?<![a-zà-ÿ])vide(?![a-zà-ÿ]).*(bo[iî]te|compartiment|case)/,
    otherDay: /(?<![a-zà-ÿ])(hier|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|dernier|derni[èe]re|prochain|prochaine)(?![a-zà-ÿ])/,
    leaving: /(?<![a-zà-ÿ])je (sors|pars|m'en vais)(?![a-zà-ÿ])|avant de (sortir|partir)|pr[eê]te? [àa] (sortir|partir)/,
    left: /qu'est-ce qu'il (me )?reste|que (me )?reste-t-il|qu'est-ce que je dois encore|il me reste quoi|reste-t-il/,
    asking: /^\W*(est-ce qu|ai-je|ai je|qu'est-ce)/,
    telling: /(?<![a-zà-ÿ])(pris|mang[ée]e?s?|bu|fait|fini|termin[ée]e?|aval[ée]e?s?|d[ée]jeun[ée]|d[îi]n[ée])(?![a-zà-ÿ])/,
  };

  // While something is being done step by step.
  const aboutSteps = (text, t, guide) => {
    const said = new Set(keys(text));
    if (I18n.fr ? FR.stop.test(t) : /\b(stop|cancel|end|leave)\b.*\b(recipe|cooking|steps?|this|it)\b|^\W*i (have|am) (finished|done)( with (it|this))?\W*$/.test(t)) {
      return { say: tr(`All right. ${guide.name} is stopped.`, `Très bien. ${guide.name} : c'est arrêté.`), ...DAY_LINK, act: end };
    }
    if (I18n.fr ? FR.done.test(t) : /^\W*(done|it is done|it's done|i did it|ok(ay)?,? done|that is done|next( step)?|and then|then)\W*$/.test(t)) {
      if (doing.step >= guide.steps.length) return { say: nowSay(guide), ...STEPS_LINK };
      return { act: stepDone, sayAfter: () => nowSay(guide), ...STEPS_LINK };
    }
    if (I18n.fr ? FR.next.test(t) : /^\W*(what('s| is)? next|what now|and now|what do i do( now| next)?|what is the next step|which step)\W*$/.test(t)) {
      return { say: nowSay(guide), ...STEPS_LINK };
    }
    if (I18n.fr ? FR.where.test(t) : /\bwhere (am|was) i\b|\bwhat am i (doing|making|cooking)\b/.test(t)) {
      const done = guide.steps.slice(0, doing.step);
      return {
        say: tr(`You are making: ${guide.name}. ${done.length ? `Already done: ${done.join(' ')}` : 'Nothing is done yet.'} Now: ${nowSay(guide)}`,
          `Vous préparez : ${guide.name}. ${done.length ? `Déjà fait : ${done.join(' ')}` : "Rien n'est encore fait."} Maintenant : ${nowSay(guide)}`),
        ...STEPS_LINK,
      };
    }
    if (I18n.fr ? FR.need.test(t) : /\bwhat do i need\b|\bwhat (are|were) the ingredients\b/.test(t)) {
      return { say: tr(`For ${guide.name}, you need: ${guide.things.join(', ')}.`, `Pour ${guide.name}, il vous faut : ${guide.things.join(', ')}.`), ...STEPS_LINK };
    }

    // About one step: "Did I put the salt?", "The salt is in."
    // The step with the most words in common; between equals, the one to do now or the next ones.
    const scores = guide.steps.map((s) => shared(s, said));
    const best = Math.max(...scores);
    if (best <= 0) return null;
    const fits = scores.map((score, i) => (score === best ? i : -1)).filter((i) => i >= 0);
    const index = fits.find((i) => i >= doing.step) ?? fits[0];
    const asking = (I18n.fr ? FR.stepAsking : /^\W*(did|have|do|is|are|was)\b/).test(t) || /\?\s*$/.test(text);
    const telling = I18n.fr ? FR.stepTelling.test(t)
      : /^\W*(i|we|i've|i’ve|the|ok|okay|yes)\b.*\b(put|added|did|done|poured|broke|broken|beat|beaten|melted|mixed|cut|is in|are in|is on|is off)\b/.test(t);
    if (asking) {
      return { say: index < doing.step ? tr(`Yes. It is done: ${guide.steps[index]}`, `Oui. C'est fait : ${guide.steps[index]}`)
        : index === doing.step ? tr(`Not yet. It is the step to do now: ${guide.steps[index]}`, `Pas encore. C'est l'étape à faire maintenant : ${guide.steps[index]}`)
          : tr(`Not yet. It comes later, at step ${index + 1}. Now: ${nowSay(guide)}`, `Pas encore. Ça vient plus tard, à l'étape ${index + 1}. Maintenant : ${nowSay(guide)}`), ...STEPS_LINK };
    }
    if (!telling) return null;
    if (index < doing.step) return { say: tr(`Yes, it is already noted. Now: ${nowSay(guide)}`, `Oui, c'est déjà noté. Maintenant : ${nowSay(guide)}`), ...STEPS_LINK };
    if (index === doing.step) return { act: stepDone, sayAfter: () => `${tr('Good.', 'Bien.')} ${nowSay(guide)}`, ...STEPS_LINK };
    // A later step: the ones before were skipped, or done without saying it.
    return {
      say: tr(`That is step ${index + 1}. Before it, there is: ${guide.steps[doing.step]} Tell me when it is done.`,
        `C'est l'étape ${index + 1}. Avant, il y a : ${guide.steps[doing.step]} Dites-moi quand c'est fait.`),
      ...STEPS_LINK,
    };
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
    if (I18n.fr ? FR.make.test(t) && !FR.notMake.test(t) : /\b(make|cook|prepare|start|do)\b/.test(t) && !/\b(appointment|agenda|meeting)\b/.test(t)) {
      const said = new Set(keys(text));
      const wanted = guides.map((g) => ({ g, score: shared(g.name, said) })).filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (wanted) {
        return {
          act: () => begin(wanted.g.id), ...STEPS_LINK,
          sayAfter: () => tr(`${wanted.g.name}. You need: ${wanted.g.things.join(', ')}. Then: ${nowSay(wanted.g)} Tell me when it is done.`,
            `${wanted.g.name}. Il vous faut : ${wanted.g.things.join(', ')}. Ensuite : ${nowSay(wanted.g)} Dites-moi quand c'est fait.`),
        };
      }
    }

    // "Every day at 10, water the plants", "Remind me every Tuesday to take out the bins at 8".
    const every = t.match(I18n.fr ? FR.every : /^\W*(?:please\s+)?(?:remind me\s+)?(?:add to my day|every\s*day|each day|every (sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/);
    if (every) {
      const days = every[1] ? [WEEK.findIndex((d) => d.toLowerCase() === every[1])] : [];
      const { time, rest } = timeIn(text.slice(every[0].length));
      const what = rest.replace(/^[\s,:]*(to|i must|i have to|i need to|i|il faut|je dois|je)\s+/i, '').replace(/[\s,.]+$/, '').replace(/^[\s,:]+/, '').replace(/\s+/g, ' ');
      if (!what) return { say: tr('Tell me what to do, for example: every day at 10, water the plants.', 'Dites-moi quoi faire, par exemple : tous les jours à 10 heures, arroser les plantes.') };
      const item = { list: 'day', text: what[0].toUpperCase() + what.slice(1), time, ...(days.length ? { days } : {}) };
      const often = days.length ? tr(`Every ${WEEK[days[0]]}`, `Chaque ${WEEK[days[0]]}`) : tr('Every day', 'Tous les jours');
      return {
        say: `${often}${time ? ` ${tr('at', 'à')} ${Speech.time(at(item, now))}` : ''} : ${item.text}.`.replace(/^([^:]*?) :/, I18n.fr ? '$1 :' : '$1:'),
        ask: { question: tr('Shall I add it to your day?', 'Je l’ajoute à votre journée ?'), apply: () => { SampleData.add('tasks', item); }, done: tr('Done. It is in your day.', 'C’est fait. C’est dans votre journée.') },
        ...DAY_LINK,
      };
    }

    // "The box is empty": the pills were taken, even if nothing was noted.
    if (I18n.fr ? FR.box.test(t) : /\b(box|compartment|pill ?box|dosette)\b.*\bempty\b|\bempty\b.*\b(box|compartment)\b/.test(t)) {
      const open = today(now).filter((x) => isPills(x) && !doneAt(x, now) && (!x.time || at(x, now) - now < 30 * 60000));
      const task = open[open.length - 1];
      if (!task) return { say: tr('Your pills of today are already noted.', 'Vos médicaments d’aujourd’hui sont déjà notés.'), ...DAY_LINK };
      return {
        say: tr(`The box of ${box(task, now)} is empty: you have taken ${what(task)}.`, `La case du ${box(task, now)} est vide : vous avez pris ${what(task)}.`), ...DAY_LINK,
        ask: { question: tr('Shall I note it?', 'Je le note ?'), apply: () => { tick(task.id, 'box'); }, done: tr('Done. It is noted.', 'C’est fait. C’est noté.') },
      };
    }

    // Another day than today is a question for the agenda or the diary.
    if ((I18n.fr ? FR.otherDay : /\b(yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|last|next)\b/).test(t)) return null;

    if (leaving().length && (I18n.fr ? FR.leaving : /\b(i am|i'm|i’m) (leaving|going out)\b|\bbefore i (leave|go out)\b|\bready to (leave|go)\b/).test(t)) {
      const things = leaving().map((x) => x.text.toLowerCase()).join(', ');
      return { say: tr(`Before you leave, check that you have: ${things}.`, `Avant de partir, vérifiez que vous avez : ${things}.`), link: '#/day', linkText: tr('Open the list', 'Ouvrir la liste') };
    }
    if ((I18n.fr ? FR.left : /\bwhat\b.*\b(still|left)\b|\bwhat (else|more) (do i|is there)\b/).test(t) && today(now).length) {
      const left = today(now).filter((x) => !doneAt(x, now));
      return {
        say: left.length ? tr(`You still have: ${left.map((x) => x.text).join(', ')}.`, `Il vous reste : ${left.map((x) => x.text).join(', ')}.`)
          : tr('You have done everything for today.', 'Vous avez tout fait pour aujourd’hui.'),
        ...DAY_LINK,
      };
    }

    const asking = (I18n.fr ? FR.asking : /^\W*(did|have|do|am|was|is)\b/).test(t) || /\?\s*$/.test(text);
    const telling = I18n.fr ? FR.telling.test(t)
      : /^\W*(i|we|i've|i’ve|ok|okay|yes|so)\b.*\b(took|taken|had|ate|eaten|did|done|finished|made|drank|swallowed)\b/.test(t);
    if (!asking && !telling) return null;
    const task = meant(text, now, asking);
    if (!task) return null;
    const done = doneAt(task, now);
    if (asking) return { say: answer(task, now), ...DAY_LINK };
    if (done) {
      return { say: tr(`${task.text}: it is already noted, at ${Speech.time(done)}.${isPills(task) ? ' Do not take them again.' : ''}`,
        `${task.text} : c'est déjà noté, à ${Speech.time(done)}.${isPills(task) ? ' Ne les reprenez pas.' : ''}`), ...DAY_LINK };
    }
    // Pills taken long before their time are noted, but said: the relatives will see it.
    const early = isPills(task) && task.time && at(task, now) - now > EARLY_MS;
    return {
      say: `${task.text}.${early ? tr(` These are the pills of ${Speech.time(at(task, now))}, not of now.`, ` Ce sont les médicaments de ${Speech.time(at(task, now))}, pas ceux de maintenant.`) : ''}`, ...DAY_LINK,
      ask: { question: tr('Shall I note that it is done?', 'Je note que c’est fait ?'), apply: () => { tick(task.id, 'voice'); }, done: tr('Done. It is noted.', 'C’est fait. C’est noté.') },
    };
  };

  // "Did I take my pills?", "Have I had lunch?": from the note, never from memory.
  const answer = (task, now) => {
    const done = doneAt(task, now);
    if (done) {
      return tr(`Yes. ${task.text}: done at ${Speech.time(done)}.${isPills(task) ? ' You do not need to take them again.' : ''}`,
        `Oui. ${task.text} : fait à ${Speech.time(done)}.${isPills(task) ? ' Vous n’avez pas besoin de les reprendre.' : ''}`);
    }
    const time = task.time ? at(task, now) : null;
    if (time && time > now) return tr(`Not yet. ${task.text}: planned at ${Speech.time(time)}.`, `Pas encore. ${task.text} : prévu à ${Speech.time(time)}.`);
    const kind = kindOf(task.text);
    if (kind === 'pills') {
      return tr(`I have no note of it. Look at your pill box, at ${box(task, now)}. If the pills are still in it, take them now, then tell me. If it is empty, you have already taken them.`,
        `Je n'ai rien de noté. Regardez votre pilulier, à la case du ${box(task, now)}. Si les médicaments y sont encore, prenez-les maintenant, puis dites-le-moi. Si la case est vide, vous les avez déjà pris.`);
    }
    if (kind === 'meal') {
      return tr(`I have no note of ${what(task)}. It is a good time to eat something. Tell me when you have eaten.`,
        `Je n'ai rien de noté pour : ${what(task)}. C'est un bon moment pour manger quelque chose. Dites-moi quand vous aurez mangé.`);
    }
    if (kind === 'drink') return tr('I have no note of it. Have a glass of water now: it does no harm.', "Je n'ai rien de noté. Buvez un verre d'eau maintenant : ça ne peut pas faire de mal.");
    return tr(`Not noted yet. ${task.text}${time ? `, planned at ${Speech.time(time)}` : ''}.`, `Pas encore noté. ${task.text}${time ? `, prévu à ${Speech.time(time)}` : ''}.`);
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
      const where2 = isPills(task) ? tr(where, ` Ils sont dans la case : ${box(task, now)}.`) : '';
      return { key, taskId: task.id, text: tr(`${SampleData.user.name}, ${lead ? 'a small reminder' : 'it is time'}: ${task.text}.${where2}`,
        `${SampleData.user.name}, ${lead ? 'un petit rappel' : "c'est l'heure"} : ${task.text}.${where2}`) };
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
            <button class="link-button" type="button" data-untick="${esc(task.id)}">${tr('Not done', 'Pas fait')}</button></p>` : ''}
        </div>
        ${done ? '' : `<button class="button primary" type="button" data-tick="${esc(task.id)}">${tr('Done', 'Fait')}</button>`}
      </article>`;
  };

  const todayList = (now) => (today(now).length ? today(now).map((t) => row(t, now)).join('')
    : `<p class="card empty">${tr('Nothing is on the list for today.', 'Rien n’est sur la liste aujourd’hui.')}</p>`);

  // What is going on step by step, as a card that leads back to it.
  const doingCard = () => {
    const guide = current();
    return guide ? `
      <a class="card link-card doing" href="#/day/steps">
        <p><strong>You are making: ${esc(guide.name)}</strong></p>
        <p>${esc(nowSay(guide))}</p>
        <span class="more">${tr('Go on', 'Continuer')}</span>
      </a>` : '';
  };

  // On the home screen.
  const homeBlock = (now) => (tasks.length || guides.length ? `
    <section>
      <h2>${tr('To do today', 'À faire aujourd’hui')}</h2>
      ${doingCard()}
      ${todayList(now)}
      <p class="day-links">
        ${guides.length ? `<a class="button" href="#/day/steps">${tr('Step by step', 'Pas à pas')}</a>` : ''}
        ${leaving().length ? `<a class="button" href="#/day">${tr('Before I leave home', 'Avant de sortir')}</a>` : ''}
        <a class="button" href="#/day">${tr('Good to know', 'Bon à savoir')}</a>
      </p>
    </section>` : `
    <section>
      <h2>${tr('To do today', 'À faire aujourd’hui')}</h2>
      <a class="card link-card" href="#/day">
        <p>${tr('The pills, the meals, a recipe step by step, what to take before leaving home, the code of the building.', 'Les médicaments, les repas, une recette pas à pas, ce qu’il faut prendre avant de sortir, le code de l’immeuble.')}</p>
        <span class="more">${tr('Set up my day', 'Préparer ma journée')}</span>
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
            <span>${pocket.has(t.id) ? tr('I have it', 'Je l’ai') : tr('Touch when you have it', 'Touchez quand vous l’avez')}</span>
          </button>`).join('')}
      </div>
      ${all ? `<p class="card pocket-ok"><strong>${tr('You have everything. You can go.', 'Vous avez tout. Vous pouvez y aller.')}</strong></p>` : ''}`;
  };

  // The last seven days: what was done, for the user and for whoever helps them.
  const lastDays = (now) => {
    const days = [...Array(7)].map((_, i) => Dates.addDays(Dates.startOfDay(now), i - 6));
    if (!everyDay().length) return '';
    return `
      <section>
        <h2>${tr('The last seven days', 'Les sept derniers jours')}</h2>
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
          <p class="source">${tr('✓ done · – not noted', '✓ fait · – pas noté')}</p>
        </div>
      </section>`;
  };

  const stepsView = () => {
    const guide = current();
    if (!guide) {
      return `
        <a class="back" href="#/day">← ${tr('Back', 'Retour')}</a>
        <header class="page-head with-back">
          <h1>${tr('Step by step', 'Pas à pas')}</h1>
          <p class="sub">${tr('Choose what you want to do. I keep your place, one step at a time.', 'Choisissez ce que vous voulez faire. Je garde votre place, une étape à la fois.')}</p>
        </header>
        <div class="pocket">
          ${guides.map((g) => `
            <button class="place-choice" type="button" data-begin="${esc(g.id)}">
              <strong>${esc(g.name)}</strong>
              <span>${g.steps.length} ${tr('steps', 'étapes')}</span>
            </button>`).join('') || `<p class="card empty">${tr('Nothing yet. Add one under “Change my lists”, in My day.', 'Rien pour l’instant. Ajoutez-en un dans « Modifier mes listes », dans Ma journée.')}</p>`}
        </div>
        <p class="source">${tr('You can also say: “I want to make an omelette.” Then: “What is next?”, “Did I put the salt?”, “Done.”', 'Vous pouvez aussi dire : « Je veux faire une omelette. » Puis : « Et maintenant ? », « Est-ce que j’ai mis le sel ? », « C’est fait. »')}</p>`;
    }
    const finished = doing.step >= guide.steps.length;
    return `
      <a class="back" href="#/day">← ${tr('Back', 'Retour')}</a>
      <header class="page-head with-back">
        <h1>${esc(guide.name)}</h1>
      </header>
      <div class="card step-now">
        ${finished ? `<p class="step-text">${tr('Everything is done. Well done.', 'Tout est fait. Bravo.')}</p>` : `
          <p class="reading-count">${tr(`Step ${doing.step + 1} of ${guide.steps.length}`, `Étape ${doing.step + 1} sur ${guide.steps.length}`)}</p>
          <p class="step-text">${esc(guide.steps[doing.step])}</p>`}
        <p class="account-actions step-actions">
          ${finished ? `<button class="button primary big" type="button" data-steps="end">${tr('I have finished', 'J’ai fini')}</button>`
            : `<button class="button primary big" type="button" data-steps="next">${tr('Done, next step', 'Fait, étape suivante')}</button>`}
          ${doing.step > 0 ? `<button class="button" type="button" data-steps="back">${tr('Go back one step', 'Revenir d’une étape')}</button>` : ''}
        </p>
      </div>

      ${guide.things.length ? `
      <section>
        <h2>${tr('What you need', 'Ce qu’il vous faut')}</h2>
        <div class="pocket">
          ${guide.things.map((thing, i) => `
            <button class="place-choice${doing.have.includes(i) ? ' chosen' : ''}" type="button" data-have="${i}" aria-pressed="${doing.have.includes(i)}">
              <strong>${doing.have.includes(i) ? '✓ ' : ''}${esc(thing)}</strong>
            </button>`).join('')}
        </div>
      </section>` : ''}

      <section>
        <h2>${tr('All the steps', 'Toutes les étapes')}</h2>
        <ol class="step-list">
          ${guide.steps.map((s, i) => `<li class="${i < doing.step ? 'done' : i === doing.step ? 'now' : ''}">${i < doing.step ? '✓ ' : ''}${esc(s)}</li>`).join('')}
        </ol>
      </section>
      <p class="page-action"><button class="button" type="button" data-steps="end">${tr('Stop', 'Arrêter')}</button></p>`;
  };

  // The screen a notification opens: one thing to do now, and one big button.
  const nowView = (taskId, now) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return `<a class="back" href="#/">← ${tr('Back', 'Retour')}</a><p class="empty">${tr('This is no longer in your day.', 'Ce n’est plus dans votre journée.')}</p>`;
    const done = doneAt(task, now);
    const pills = isPills(task);
    const early = task.time && at(task, now) - now > EARLY_MS;
    return `
      <a class="back" href="#/">← ${tr('Back', 'Retour')}</a>
      ${!done && early ? `<p class="card now-early">${tr(`It is not time yet: this is for ${esc(Dates.time(at(task, now)))}.${pills ? ' Do not take these pills now.' : ''}`,
        `Ce n’est pas encore l’heure : c’est pour ${esc(Dates.time(at(task, now)))}.${pills ? ' Ne prenez pas ces médicaments maintenant.' : ''}`)}</p>` : ''}
      <div class="card now-card${done ? ' done' : ''}">
        ${done ? `
          <p class="now-title">✓ ${esc(task.text)}</p>
          <p class="now-text">${tr(`Done at ${esc(Dates.time(done))}.${pills ? ' You do not need to take them again.' : ''}`,
            `Fait à ${esc(Dates.time(done))}.${pills ? ' Vous n’avez pas besoin de les reprendre.' : ''}`)}</p>
          <p class="page-action"><a class="button primary big" href="#/">${tr('Back to today', 'Revenir à aujourd’hui')}</a></p>` : `
          <p class="hello-date">${task.time ? `${tr('At', 'À')} ${esc(Dates.time(at(task, now)))}` : tr('Today', 'Aujourd’hui')}</p>
          <p class="now-title">${esc(task.text)}</p>
          ${pills ? `<p class="now-text">${tr('Take them from your pill box:', 'Prenez-les dans votre pilulier :')} <strong>${esc(box(task, now))}</strong>.</p>` : ''}
          <p class="page-action"><button class="button${early ? '' : ' primary big'}" type="button" data-now-done="${esc(task.id)}">${pills ? tr('I took them', 'Je les ai pris') : tr('It is done', 'C’est fait')}</button></p>
          ${pills ? `<p class="page-action"><button class="button" type="button" data-now-box="${esc(task.id)}">${tr('The box is already empty', 'La case est déjà vide')}</button></p>` : ''}
          <p class="page-action"><a class="button" href="#/">${tr('Not now', 'Pas maintenant')}</a></p>`}
      </div>`;
  };

  const view = ({ now, arg, more }) => (arg === 'now' ? nowView(more, now) : arg === 'steps' ? stepsView() : `
    <a class="back" href="#/">← ${tr('Back', 'Retour')}</a>
    <header class="page-head with-back">
      <h1>${tr('My day', 'Ma journée')}</h1>
      <p class="sub">${tr('What to do today, what to take before leaving, and what is good to know.', 'Ce qu’il y a à faire aujourd’hui, ce qu’il faut prendre avant de sortir, et ce qui est bon à savoir.')}</p>
    </header>

    <section>
      <h2>${tr('To do today', 'À faire aujourd’hui')}</h2>
      ${doingCard()}
      ${todayList(now)}
      ${guides.length ? `<p class="day-links"><a class="button" href="#/day/steps">${tr('Do something step by step', 'Faire quelque chose pas à pas')}</a></p>` : ''}
    </section>

    ${Routine.pushCard()}

    <section>
      <h2>${tr('Before I leave home', 'Avant de sortir')}</h2>
      ${leaving().length ? pocketList() : `<p class="card empty">${tr('Nothing is on the list yet.', 'Rien n’est encore sur la liste.')}</p>`}
    </section>

    <section>
      <h2>${tr('Good to know', 'Bon à savoir')}</h2>
      ${notes.length ? [...notes].sort((a, b) => b.date - a.date).map((n) => `
        <article class="card">
          <p>${esc(n.text)}</p>
          ${n.added ? `<button class="link-button" type="button" data-remove="notes:${esc(n.id)}">${tr('Remove', 'Retirer')}</button>` : ''}
        </article>`).join('') : `<p class="card empty">${tr('Nothing yet. For example: the code of the building, where the keys are.', 'Rien pour l’instant. Par exemple : le code de l’immeuble, où sont les clés.')}</p>`}
      <form class="account-form day-form" data-day-form="note">
        <label>${tr('Something to know', 'Quelque chose à savoir')}
          <input type="text" name="text" autocomplete="off" placeholder="${tr('The keys are in the blue bowl next to the door', 'Les clés sont dans le bol bleu près de la porte')}"></label>
        <div class="account-actions"><button class="button" type="submit">${tr('Add', 'Ajouter')}</button></div>
        <p class="source">${tr('You can also say it: “Remember that the keys are in the blue bowl.” Then ask: “Where are my keys?”', 'Vous pouvez aussi le dire : « Retiens que les clés sont dans le bol bleu. » Puis demander : « Où sont mes clés ? »')}</p>
      </form>
    </section>

    ${lastDays(now)}

    <details class="examples day-edit"${editing ? ' open' : ''}>
      <summary>${tr('Change my lists', 'Modifier mes listes')}</summary>
      ${tasks.length || guides.length ? '' : `<p class="page-action"><button class="button primary" type="button" data-usual>${tr('Start with the usual ones', 'Commencer avec les habituels')}</button></p>`}
      <ul class="day-items">
        ${[...everyDay(), ...leaving()].map((t) => `
          <li>${t.time ? `${esc(Dates.time(at(t, now)))} · ` : ''}${esc(t.text)}
            <span class="source">${t.list === 'day' ? esc(when(t)) : tr('before leaving', 'avant de sortir')}</span>
            ${t.added ? `<button class="link-button" type="button" data-remove="tasks:${esc(t.id)}">${tr('Remove', 'Retirer')}</button>` : ''}</li>`).join('')}
        ${guides.map((g) => `
          <li>${esc(g.name)} <span class="source">${tr(`step by step, ${g.steps.length} steps`, `pas à pas, ${g.steps.length} étapes`)}</span>
            ${g.added ? `<button class="link-button" type="button" data-remove="guides:${esc(g.id)}">${tr('Remove', 'Retirer')}</button>` : ''}</li>`).join('')}
      </ul>
      <form class="account-form day-form" data-day-form="task">
        <label>${tr('Something to do', 'Quelque chose à faire')}
          <input type="text" name="text" autocomplete="off" placeholder="${tr('Water the plants', 'Arroser les plantes')}"></label>
        <label>${tr('At what time (leave empty if any time)', 'À quelle heure (laissez vide si c’est à n’importe quelle heure)')}
          <input type="time" name="time"></label>
        <fieldset class="weekdays">
          <legend>${tr('On which days (none ticked: every day)', 'Quels jours (aucun coché : tous les jours)')}</legend>
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="days" value="${d}"> ${WEEK[d].slice(0, 3)}${I18n.fr ? '.' : ''}</label>`).join('')}
        </fieldset>
        <div class="account-actions"><button class="button" type="submit">${tr('Add to my day', 'Ajouter à ma journée')}</button></div>
        <p class="source">${tr('You can also say: “Every day at 10, water the plants.” or “Every Tuesday at 8, take out the bins.”', 'Vous pouvez aussi dire : « Tous les jours à 10 heures, arroser les plantes. » ou « Chaque mardi à 8 heures, sortir les poubelles. »')}</p>
      </form>
      <form class="account-form day-form" data-day-form="leaving">
        <label>${tr('Something to have before leaving home', 'Quelque chose à avoir avant de sortir')}
          <input type="text" name="text" autocomplete="off" placeholder="${tr('Glasses', 'Lunettes')}"></label>
        <div class="account-actions"><button class="button" type="submit">${tr('Add to before leaving', 'Ajouter à avant de sortir')}</button></div>
      </form>
      <form class="account-form day-form" data-day-form="guide">
        <label>${tr('Something to do step by step', 'Quelque chose à faire pas à pas')}
          <input type="text" name="text" autocomplete="off" placeholder="${tr('Pasta with tomato sauce', 'Pâtes à la sauce tomate')}"></label>
        <label>${tr('What is needed (one on each line)', 'Ce qu’il faut (un par ligne)')}
          <textarea name="things" rows="4" placeholder="${tr('Pasta&#10;A jar of tomato sauce&#10;Salt', 'Des pâtes&#10;Un pot de sauce tomate&#10;Du sel')}"></textarea></label>
        <label>${tr('The steps (one on each line)', 'Les étapes (une par ligne)')}
          <textarea name="steps" rows="6" placeholder="${tr('Boil water in a large pan.&#10;Add salt and the pasta.&#10;After ten minutes, drain the pasta.', 'Faites bouillir de l’eau dans une grande casserole.&#10;Ajoutez le sel et les pâtes.&#10;Après dix minutes, égouttez les pâtes.')}"></textarea></label>
        <div class="account-actions"><button class="button" type="submit">${tr('Add to step by step', 'Ajouter au pas à pas')}</button></div>
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
      else if (hit('now-done')) { tick(hit('now-done').dataset.nowDone, 'button'); Speech.say(tr('Good. It is noted.', 'Bien. C’est noté.')); }
      else if (hit('now-box')) { tick(hit('now-box').dataset.nowBox, 'box'); Speech.say(tr('Then you have already taken them. It is noted.', 'Alors vous les avez déjà pris. C’est noté.')); }
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
      if (kind === 'note') SampleData.add('notes', { date: new Date(), subject: tr('Note', 'Note'), text });
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
