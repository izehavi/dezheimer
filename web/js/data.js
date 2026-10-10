// Example data for a fictional user. Everything is dated relative to the real
// current day, so the prototype always shows a "live" week whenever it is opened.
// The shapes follow the data model in GUIDELINE.md, section 4.
const SampleData = (() => {
  const today = Dates.startOfDay(new Date());

  // A moment `offset` days from today, at the given time.
  const at = (offset, hour = 0, minute = 0) => {
    const d = Dates.addDays(today, offset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const user = { name: 'Helen' };

  // `photo` is an optional image URL; without it the app shows the initials.
  const people = [
    {
      id: 'sarah', name: 'Sarah', relationship: 'Your daughter', color: '#0F5E63', photo: null,
      // `link` is the short label on the connections graph; `origin` is how the user knows them.
      link: 'daughter',
      origin: 'She is your daughter, your first child.',
      facts: [
        'Lives 15 minutes away with her children, Leo and Emma.',
        'Works as a nurse at the hospital.',
        'Calls you every evening around 7.',
      ],
    },
    {
      id: 'david', name: 'David', relationship: 'Your son', color: '#3B4BA3', photo: null,
      link: 'son',
      origin: 'He is your son, two years younger than Sarah.',
      facts: [
        'Lives in Lyon with his wife, Claire.',
        'Works as an engineer.',
        'Visits about once a month.',
      ],
    },
    {
      id: 'leo', name: 'Leo', relationship: 'Your grandson', color: '#8A4B08', photo: null,
      link: 'grandson',
      origin: "He is Sarah's son, and your first grandchild.",
      facts: [
        'Son of Sarah. He is 19.',
        'Studies biology at university in Paris.',
        'Plays the guitar.',
      ],
    },
    {
      id: 'emma', name: 'Emma', relationship: 'Your granddaughter', color: '#A3285A', photo: null,
      link: 'granddaughter',
      origin: "She is Sarah's daughter, and Leo's little sister.",
      facts: [
        'Daughter of Sarah. She is in high school.',
        `Her 16th birthday is on ${Dates.long(at(4))}.`,
        'Loves horse riding.',
      ],
    },
    {
      id: 'rose', name: 'Rose', relationship: 'Your friend and neighbour', color: '#6B3FA0', photo: null,
      link: 'friend, neighbour',
      origin: 'You met in 1995, when you moved into the street. She was the first neighbour to welcome you.',
      facts: [
        'Lives at number 12, on your street.',
        'You have been friends for 30 years.',
        'You often walk in the park together.',
      ],
    },
    {
      id: 'paul', name: 'Paul', relationship: 'Your friend', color: '#2F6B2F', photo: null,
      link: 'friend, former colleague',
      origin: 'You met at Jules Ferry school, where you both taught for twenty years.',
      facts: [
        'You both taught at the same school.',
        'He is retired, like you.',
        'Loves chess.',
      ],
    },
    {
      id: 'martin', name: 'Dr. Martin', relationship: 'Your doctor', color: '#1D5C8C', photo: null,
      link: 'doctor',
      origin: 'He has been your family doctor since 2010. Sarah found him for you.',
      facts: [
        'Your family doctor for many years.',
        'The office is on Garden Street, 10 minutes by car.',
        'Sarah usually drives you there.',
      ],
    },
    {
      id: 'nadia', name: 'Nadia', relationship: 'Your home helper', color: '#9C3D2B', photo: null,
      link: 'home helper',
      origin: 'She started helping you at home last year. Sarah arranged it with the home help service.',
      facts: [
        'Comes several mornings a week at 9.',
        'Helps with the shopping and the cooking.',
        'She has a key to the house.',
      ],
    },
  ];

  // News about a person. `date` is the day of the conversation it comes from.
  const memos = [
    { personId: 'sarah', date: at(-3), text: 'Sarah is moving to day shifts at the hospital next month. She is happy: her evenings will be free.' },
    { personId: 'sarah', date: at(-8), text: 'Sarah is repainting her kitchen in yellow.' },
    { personId: 'david', date: at(-1), text: 'David and Claire are expecting a baby in the spring. It will be your third grandchild.' },
    { personId: 'david', date: at(-12), text: 'David got a promotion. He now leads a team of six people.' },
    { personId: 'leo', date: at(-3), text: 'Leo passed his first exams. He joined a band and they play a concert next month.' },
    { personId: 'leo', date: at(-15), text: 'Leo moved into a student flat with two friends.' },
    { personId: 'emma', date: at(-3), text: 'Emma came second in her riding competition. Her horse is called Caramel.' },
    { personId: 'emma', date: at(-10), text: 'Emma would like a riding helmet for her birthday.' },
    { personId: 'rose', date: at(-6), text: 'Rose\'s daughter, Anne, is coming from Canada for Christmas.' },
    { personId: 'rose', date: at(-14), text: 'Rose had a knee operation. She is walking well again.' },
    { personId: 'paul', date: at(-9), text: 'Paul is back from a trip to Italy. He will bring photos next time.' },
    { personId: 'martin', date: at(-5), text: 'Dr. Martin said everything looks fine. Nothing changes in your treatment.' },
    { personId: 'nadia', date: at(-2), text: 'Nadia\'s son has just started primary school. She showed you a photo.' },
  ];

  const events = [
    { id: 'e1', title: 'Coffee with Rose', start: at(-6, 15, 0), place: 'At Rose\'s home, number 12', personIds: ['rose'] },
    { id: 'e2', title: 'Appointment with Dr. Martin', start: at(-5, 10, 30), place: 'Doctor\'s office, Garden Street', personIds: ['martin', 'sarah'], note: 'Sarah drives you.' },
    { id: 'e3', title: 'Family lunch', start: at(-3, 12, 30), place: 'At Sarah\'s home', personIds: ['sarah', 'leo', 'emma'] },
    { id: 'e4', title: 'Nadia comes to help', start: at(-2, 9, 0), place: 'At home', personIds: ['nadia'] },
    { id: 'e5', title: 'Phone call with David', start: at(-1, 16, 0), place: 'At home', personIds: ['david'] },

    { id: 'e6', title: 'Nadia comes to help', start: at(0, 9, 0), place: 'At home', personIds: ['nadia'], note: 'Shopping list is on the fridge.' },
    { id: 'e7', title: 'Lunch with Sarah', start: at(0, 12, 30), place: 'At home', personIds: ['sarah'], note: 'Sarah brings the dessert.' },
    { id: 'e8', title: 'Video call with Leo', start: at(0, 17, 0), place: 'At home, on the tablet', personIds: ['leo'] },

    { id: 'e9', title: 'Walk in the park with Rose', start: at(1, 15, 0), place: 'Rose comes to pick you up', personIds: ['rose'] },
    { id: 'e10', title: 'Appointment with Dr. Martin', start: at(2, 10, 30), place: 'Doctor\'s office, Garden Street', personIds: ['martin', 'sarah'], note: 'Sarah drives you. She arrives at 10.' },
    { id: 'e11', title: 'Nadia comes to help', start: at(3, 9, 0), place: 'At home', personIds: ['nadia'] },
    { id: 'e12', title: 'Emma\'s birthday lunch', start: at(4, 12, 0), place: 'At Sarah\'s home', personIds: ['emma', 'sarah', 'leo', 'david'], note: 'The present for Emma is in the hallway cupboard.' },
    { id: 'e13', title: 'Tea with Paul', start: at(6, 14, 30), place: 'At home', personIds: ['paul'], note: 'Paul brings his photos of Italy.' },
  ];

  // One entry per day; some days have none.
  const diary = [
    { date: at(-1), personIds: ['david'], text: 'A quiet day at home. In the afternoon David called from Lyon. He had big news: he and Claire are expecting a baby in the spring. You talked for half an hour. In the evening you watched a film about Italy.' },
    { date: at(-2), personIds: ['nadia'], text: 'Nadia came in the morning. You went to the market together and bought apples, and she made an apple tart. She showed you a photo of her son on his first day of school.' },
    { date: at(-3), personIds: ['sarah', 'leo', 'emma'], text: 'Lunch at Sarah\'s home with Leo and Emma. Sarah made roast chicken. Emma told everyone about her riding competition, where she came second. Leo played two songs on the guitar after dessert.' },
    { date: at(-5), personIds: ['martin', 'sarah'], text: 'Sarah drove you to Dr. Martin in the morning. He said everything looks fine. Afterwards you had a coffee with Sarah at the bakery next door.' },
    { date: at(-6), personIds: ['rose'], text: 'Coffee at Rose\'s home in the afternoon. She is very happy because her daughter Anne is coming from Canada for Christmas. You looked at old photos of the street together.' },
    { date: at(-7), personIds: [], text: 'It rained all day. You stayed at home, did a crossword and sorted the letters on your desk. Sarah called in the evening.' },
  ];

  // How the people know each other. The user's own link to each person is on the person.
  const connections = [
    { a: 'sarah', b: 'leo', label: 'mother and son' },
    { a: 'sarah', b: 'emma', label: 'mother and daughter' },
    { a: 'leo', b: 'emma', label: 'brother and sister' },
    { a: 'sarah', b: 'david', label: 'sister and brother' },
  ];

  // Order of the people around the connections graph: people who know each other sit side by side.
  const ring = ['leo', 'sarah', 'emma', 'david', 'paul', 'rose', 'martin', 'nadia'];

  // Things to remember that are not about a known person: { date, subject, text, quote }.
  const notes = [];

  // The simple things of every day (day.js): { id, list, text, time }.
  // list 'day': to do every day, at `time` ('HH:MM') or at any time ('').
  // list 'leaving': to have before leaving home.
  const tasks = [
    { id: 'pills-morning', list: 'day', text: 'Take the morning pills', time: '08:00' },
    { id: 'breakfast', list: 'day', text: 'Breakfast', time: '08:30' },
    { id: 'lunch', list: 'day', text: 'Lunch', time: '12:30' },
    { id: 'dinner', list: 'day', text: 'Dinner', time: '19:00' },
    { id: 'pills-evening', list: 'day', text: 'Take the evening pills', time: '21:00' },
    // `days`: only on these days of the week (0 is Sunday). Without it, every day.
    { id: 'bins', list: 'day', text: 'Take out the bins', time: '18:00', days: [2] },
    { id: 'keys', list: 'leaving', text: 'Keys', time: '' },
    { id: 'phone', list: 'leaving', text: 'Phone', time: '' },
    { id: 'card', list: 'leaving', text: 'Card', time: '' },
  ];
  // What was done, and when: { taskId, at }. A thing of the day is done when it has one today.
  const ticks = [];
  // Things done step by step, such as a recipe: { id, name, things, steps }.
  // `things` is what is needed; `steps` are done in order.
  const guides = [
    {
      id: 'tea', name: 'A cup of tea', things: ['A cup', 'A tea bag', 'Water'],
      steps: [
        'Fill the kettle with water and switch it on.',
        'Put the tea bag in the cup.',
        'When the water has boiled, pour it in the cup.',
        'Wait three minutes, then take the tea bag out.',
        'Switch the kettle off.',
      ],
    },
    {
      id: 'omelette', name: 'An omelette', things: ['Two eggs', 'Butter', 'Salt', 'A pan', 'A bowl and a fork'],
      steps: [
        'Break the two eggs in the bowl.',
        'Add a pinch of salt and beat with the fork.',
        'Melt a little butter in the pan, on a medium heat.',
        'Pour the eggs in the pan.',
        'When the eggs are set, fold the omelette and put it on a plate.',
        'Switch the heat off.',
      ],
    },
  ];

  // What the user adds. It is kept in this browser, and in the backup of the account
  // when the user is signed in (account.js). Each added item has `added: true`.
  const lists = { events, memos, notes, diary, people, connections, tasks, ticks, guides };
  const dateField = { events: 'start', memos: 'date', notes: 'date', diary: 'date', ticks: 'at' };

  // Whose data this is. Without a profile, the app shows the example user, Helen.
  // With one, { name }, it starts empty and holds only what this person adds. The two
  // are stored apart, so that going back to the example loses nothing.
  const PROFILE_KEY = 'dezheimer.profile';
  const EXAMPLE = 'dezheimer.';
  const OWN = 'dezheimer.own.';
  let profile = null;
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { /* the example */ }
  if (profile && profile.name) {
    user.name = profile.name;
    for (const list of Object.values(lists)) list.length = 0;
  } else {
    profile = null;
  }
  const prefix = profile ? OWN : EXAMPLE;
  const storeKey = (kind, at = prefix) => `${at}added${kind[0].toUpperCase()}${kind.slice(1)}`;
  const HIDDEN_KEY = `${prefix}hiddenEvents`;
  const EDITS_KEY = `${prefix}personEdits`;

  // Choose whose data the app shows: a name, or nothing for the example. The page must
  // be loaded again afterwards. Returns false when the browser could not keep the choice.
  const setProfile = (name) => {
    try {
      if (name) localStorage.setItem(PROFILE_KEY, JSON.stringify({ name }));
      else localStorage.removeItem(PROFILE_KEY);
      return true;
    } catch { return false; }
  };

  // The example data, as it is before anything is added or cancelled.
  const base = Object.fromEntries(Object.entries(lists).map(([kind, list]) => [kind, [...list]]));
  let hidden = [];              // ids of example events the user cancelled or moved
  let edits = {};               // what the user changed about a person: { personId: { relationship, ... } }
  let onChange = () => {};      // called after every change, for the backup

  // Dates are saved as text.
  const revive = (kind, item) => {
    const field = dateField[kind];
    return field ? { ...item, [field]: new Date(item[field]) } : item;
  };

  // Everything the user added, as plain data.
  const exportAdded = () => ({
    ...Object.fromEntries(Object.keys(lists).map((kind) => [kind, lists[kind].filter((x) => x.added)])),
    hidden,
    edits,
    profile,
  });

  // Replace everything the user added with `doc`. The lists are changed in place,
  // because the screens keep a reference to them.
  const importAdded = (doc) => {
    hidden = Array.isArray(doc.hidden) ? doc.hidden : [];
    edits = doc.edits && typeof doc.edits === 'object' ? doc.edits : {};
    for (const kind of Object.keys(lists)) {
      const kept = base[kind].filter((x) => !(kind === 'events' && hidden.includes(x.id)));
      const added = (doc[kind] || []).map((item) => revive(kind, item));
      lists[kind].splice(0, lists[kind].length, ...kept, ...added);
    }
    people.forEach((p, i) => { if (edits[p.id]) people[i] = { ...p, ...edits[p.id] }; });
  };

  const saveLocal = () => {
    try {
      const doc = exportAdded();
      for (const kind of Object.keys(lists)) localStorage.setItem(storeKey(kind), JSON.stringify(doc[kind]));
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
      localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    } catch { /* storage unavailable: the changes last until the page is closed */ }
  };

  const changed = () => { saveLocal(); onChange(); };

  try {
    const doc = {
      hidden: JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'),
      edits: JSON.parse(localStorage.getItem(EDITS_KEY) || '{}'),
    };
    for (const kind of Object.keys(lists)) doc[kind] = JSON.parse(localStorage.getItem(storeKey(kind)) || '[]');
    importAdded(doc);
  } catch { /* nothing saved, or not readable */ }

  let counter = 0;

  // kind: 'events', 'memos', 'notes', 'diary', 'people' or 'connections'
  const add = (kind, item) => {
    const added = { ...item, id: `added-${Date.now()}-${counter++}`, added: true };
    lists[kind].push(added);
    changed();
    return added;
  };

  const drop = (kind, id) => {
    const index = lists[kind].findIndex((x) => x.id === id && x.added);
    if (index >= 0) lists[kind].splice(index, 1);
    return index >= 0;
  };

  const remove = (kind, id) => {
    if (!lists[kind] || !drop(kind, id)) return;
    if (kind === 'people') {
      // What was written about a removed person goes with them.
      for (const c of connections.filter((x) => x.added && (x.a === id || x.b === id))) drop('connections', c.id);
      for (const m of memos.filter((x) => x.added && x.personId === id)) drop('memos', m.id);
    }
    changed();
  };

  // Cancel any event. An example event cannot be deleted, so it is hidden.
  const cancelEvent = (id) => {
    const index = events.findIndex((e) => e.id === id);
    if (index < 0) return;
    if (!events[index].added) hidden.push(id);
    events.splice(index, 1);
    changed();
  };

  // Change the start or the place of any event. It becomes an event of the user's own.
  const changeEvent = (id, changes) => {
    const event = events.find((e) => e.id === id);
    if (!event) return null;
    const { id: _id, added: _added, ...rest } = event;
    cancelEvent(id);
    return add('events', { ...rest, ...changes });
  };

  // Change what is known about a person: their relationship, how the user knows them...
  const updatePerson = (id, fields) => {
    const index = people.findIndex((p) => p.id === id);
    if (index < 0) return;
    edits[id] = { ...edits[id], ...fields };
    people[index] = { ...people[index], ...fields };
    changed();
  };

  return {
    today, user, people, memos, events, diary, notes, connections, ring, tasks, ticks, guides,
    add, remove, cancelEvent, changeEvent, updatePerson, exportAdded,
    profile: () => profile, setProfile,
    // Used by the backup: load what another device saved.
    importAdded: (doc) => {
      const theirs = doc.profile === undefined ? profile : (doc.profile && doc.profile.name ? { name: doc.profile.name } : null);
      if ((theirs && theirs.name) !== (profile && profile.name)) {
        // Saved by a device that shows other data (the example, or someone's own):
        // this device does the same, and starts again with it.
        try {
          const at = theirs ? OWN : EXAMPLE;
          for (const kind of Object.keys(lists)) localStorage.setItem(storeKey(kind, at), JSON.stringify(doc[kind] || []));
          localStorage.setItem(`${at}hiddenEvents`, JSON.stringify(Array.isArray(doc.hidden) ? doc.hidden : []));
          localStorage.setItem(`${at}personEdits`, JSON.stringify(doc.edits || {}));
          if (setProfile(theirs && theirs.name)) { location.reload(); return; }
        } catch { /* storage unavailable: shown until the page is closed */ }
      }
      importAdded(doc);
      saveLocal();
    },
    onChange: (listener) => { onChange = listener; },
  };
})();
