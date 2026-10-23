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

  const user = { name: tr('Helen', 'Hélène') };

  // `photo` is an optional image URL; without it the app shows the initials.
  const people = [
    {
      id: 'sarah', name: 'Sarah', relationship: tr('Your daughter', 'Votre fille'), color: '#5B6249', photo: null,
      // `link` is the short label on the connections graph; `origin` is how the user knows them.
      link: tr('daughter', 'fille'),
      origin: tr('She is your daughter, your first child.', 'C’est votre fille, votre premier enfant.'),
      facts: [
        tr('Lives 15 minutes away with her children, Leo and Emma.', 'Habite à 15 minutes, avec ses enfants, Leo et Emma.'),
        tr('Works as a nurse at the hospital.', 'Est infirmière à l’hôpital.'),
        tr('Calls you every evening around 7.', 'Vous appelle tous les soirs vers 19 heures.'),
      ],
    },
    {
      id: 'david', name: 'David', relationship: tr('Your son', 'Votre fils'), color: '#4F6375', photo: null,
      link: tr('son', 'fils'),
      origin: tr('He is your son, two years younger than Sarah.', 'C’est votre fils, deux ans plus jeune que Sarah.'),
      facts: [
        tr('Lives in Lyon with his wife, Claire.', 'Habite à Lyon avec sa femme, Claire.'),
        tr('Works as an engineer.', 'Est ingénieur.'),
        tr('Visits about once a month.', 'Vient vous voir environ une fois par mois.'),
      ],
    },
    {
      id: 'leo', name: 'Leo', relationship: tr('Your grandson', 'Votre petit-fils'), color: '#85633A', photo: null,
      link: tr('grandson', 'petit-fils'),
      origin: tr("He is Sarah's son, and your first grandchild.", 'C’est le fils de Sarah, et votre premier petit-enfant.'),
      facts: [
        tr('Son of Sarah. He is 19.', 'Fils de Sarah. Il a 19 ans.'),
        tr('Studies biology at university in Paris.', 'Étudie la biologie à l’université, à Paris.'),
        tr('Plays the guitar.', 'Joue de la guitare.'),
      ],
    },
    {
      id: 'emma', name: 'Emma', relationship: tr('Your granddaughter', 'Votre petite-fille'), color: '#8C5A63', photo: null,
      link: tr('granddaughter', 'petite-fille'),
      origin: tr("She is Sarah's daughter, and Leo's little sister.", 'C’est la fille de Sarah, et la petite sœur de Leo.'),
      facts: [
        tr('Daughter of Sarah. She is in high school.', 'Fille de Sarah. Elle est au lycée.'),
        tr(`Her 16th birthday is on ${Dates.long(at(4))}.`, `Ses 16 ans, c’est le ${Dates.long(at(4)).toLowerCase()}.`),
        tr('Loves horse riding.', 'Adore l’équitation.'),
      ],
    },
    {
      id: 'rose', name: 'Rose', relationship: tr('Your friend and neighbour', 'Votre amie et voisine'), color: '#6C5E7E', photo: null,
      link: tr('friend, neighbour', 'amie, voisine'),
      origin: tr('You met in 1995, when you moved into the street. She was the first neighbour to welcome you.', 'Vous vous êtes rencontrées en 1995, quand vous avez emménagé dans la rue. C’est la première voisine qui vous a accueillie.'),
      facts: [
        tr('Lives at number 12, on your street.', 'Habite au numéro 12, dans votre rue.'),
        tr('You have been friends for 30 years.', 'Vous êtes amies depuis 30 ans.'),
        tr('You often walk in the park together.', 'Vous vous promenez souvent ensemble au parc.'),
      ],
    },
    {
      id: 'paul', name: 'Paul', relationship: tr('Your friend', 'Votre ami'), color: '#5A7050', photo: null,
      link: tr('friend, former colleague', 'ami, ancien collègue'),
      origin: tr('You met at Jules Ferry school, where you both taught for twenty years.', 'Vous vous êtes rencontrés à l’école Jules Ferry, où vous avez enseigné tous les deux pendant vingt ans.'),
      facts: [
        tr('You both taught at the same school.', 'Vous avez enseigné dans la même école.'),
        tr('He is retired, like you.', 'Il est à la retraite, comme vous.'),
        tr('Loves chess.', 'Adore les échecs.'),
      ],
    },
    {
      id: 'martin', name: 'Dr. Martin', relationship: tr('Your doctor', 'Votre médecin'), color: '#4E6B73', photo: null,
      link: tr('doctor', 'médecin'),
      origin: tr('He has been your family doctor since 2010. Sarah found him for you.', 'C’est votre médecin de famille depuis 2010. Sarah l’a trouvé pour vous.'),
      facts: [
        tr('Your family doctor for many years.', 'Votre médecin de famille depuis de longues années.'),
        tr('The office is on Garden Street, 10 minutes by car.', 'Le cabinet est rue des Jardins, à 10 minutes en voiture.'),
        tr('Sarah usually drives you there.', 'Sarah vous y conduit d’habitude.'),
      ],
    },
    {
      id: 'nadia', name: 'Nadia', relationship: tr('Your home helper', 'Votre aide à domicile'), color: '#9A5B43', photo: null,
      link: tr('home helper', 'aide à domicile'),
      origin: tr('She started helping you at home last year. Sarah arranged it with the home help service.', 'Elle vient vous aider à la maison depuis l’an dernier. Sarah s’en est occupée avec le service d’aide à domicile.'),
      facts: [
        tr('Comes several mornings a week at 9.', 'Vient plusieurs matins par semaine à 9 heures.'),
        tr('Helps with the shopping and the cooking.', 'Aide pour les courses et la cuisine.'),
        tr('She has a key to the house.', 'Elle a une clé de la maison.'),
      ],
    },
  ];

  // News about a person. `date` is the day of the conversation it comes from.
  const memos = [
    { personId: 'sarah', date: at(-3), text: tr('Sarah is moving to day shifts at the hospital next month. She is happy: her evenings will be free.', 'Sarah passe en horaires de jour à l’hôpital le mois prochain. Elle est contente : ses soirées seront libres.') },
    { personId: 'sarah', date: at(-8), text: tr('Sarah is repainting her kitchen in yellow.', 'Sarah repeint sa cuisine en jaune.') },
    { personId: 'david', date: at(-1), text: tr('David and Claire are expecting a baby in the spring. It will be your third grandchild.', 'David et Claire attendent un bébé pour le printemps. Ce sera votre troisième petit-enfant.') },
    { personId: 'david', date: at(-12), text: tr('David got a promotion. He now leads a team of six people.', 'David a eu une promotion. Il dirige maintenant une équipe de six personnes.') },
    { personId: 'leo', date: at(-3), text: tr('Leo passed his first exams. He joined a band and they play a concert next month.', 'Leo a réussi ses premiers examens. Il joue dans un groupe, qui donne un concert le mois prochain.') },
    { personId: 'leo', date: at(-15), text: tr('Leo moved into a student flat with two friends.', 'Leo a emménagé dans un appartement étudiant avec deux amis.') },
    { personId: 'emma', date: at(-3), text: tr('Emma came second in her riding competition. Her horse is called Caramel.', 'Emma est arrivée deuxième à son concours d’équitation. Son cheval s’appelle Caramel.') },
    { personId: 'emma', date: at(-10), text: tr('Emma would like a riding helmet for her birthday.', 'Emma aimerait une bombe d’équitation pour son anniversaire.') },
    { personId: 'rose', date: at(-6), text: tr('Rose\'s daughter, Anne, is coming from Canada for Christmas.', 'La fille de Rose, Anne, vient du Canada pour Noël.') },
    { personId: 'rose', date: at(-14), text: tr('Rose had a knee operation. She is walking well again.', 'Rose s’est fait opérer du genou. Elle marche de nouveau bien.') },
    { personId: 'paul', date: at(-9), text: tr('Paul is back from a trip to Italy. He will bring photos next time.', 'Paul est rentré d’un voyage en Italie. Il apportera des photos la prochaine fois.') },
    { personId: 'martin', date: at(-5), text: tr('Dr. Martin said everything looks fine. Nothing changes in your treatment.', 'Le docteur Martin a dit que tout allait bien. Rien ne change dans votre traitement.') },
    { personId: 'nadia', date: at(-2), text: tr('Nadia\'s son has just started primary school. She showed you a photo.', 'Le fils de Nadia vient d’entrer à l’école primaire. Elle vous a montré une photo.') },
  ];

  const events = [
    { id: 'e1', title: tr('Coffee with Rose', 'Café avec Rose'), start: at(-6, 15, 0), place: tr('At Rose\'s home, number 12', 'Chez Rose, au numéro 12'), personIds: ['rose'] },
    { id: 'e2', title: tr('Appointment with Dr. Martin', 'Rendez-vous avec le docteur Martin'), start: at(-5, 10, 30), place: tr('Doctor\'s office, Garden Street', 'Cabinet du médecin, rue des Jardins'), personIds: ['martin', 'sarah'], note: tr('Sarah drives you.', 'Sarah vous conduit.') },
    { id: 'e3', title: tr('Family lunch', 'Déjeuner en famille'), start: at(-3, 12, 30), place: tr('At Sarah\'s home', 'Chez Sarah'), personIds: ['sarah', 'leo', 'emma'] },
    { id: 'e4', title: tr('Nadia comes to help', 'Nadia vient vous aider'), start: at(-2, 9, 0), place: tr('At home', 'À la maison'), personIds: ['nadia'] },
    { id: 'e5', title: tr('Phone call with David', 'Appel avec David'), start: at(-1, 16, 0), place: tr('At home', 'À la maison'), personIds: ['david'] },

    { id: 'e6', title: tr('Nadia comes to help', 'Nadia vient vous aider'), start: at(0, 9, 0), place: tr('At home', 'À la maison'), personIds: ['nadia'], note: tr('Shopping list is on the fridge.', 'La liste de courses est sur le frigo.') },
    { id: 'e7', title: tr('Lunch with Sarah', 'Déjeuner avec Sarah'), start: at(0, 12, 30), place: tr('At home', 'À la maison'), personIds: ['sarah'], note: tr('Sarah brings the dessert.', 'Sarah apporte le dessert.') },
    { id: 'e8', title: tr('Video call with Leo', 'Appel vidéo avec Leo'), start: at(0, 17, 0), place: tr('At home, on the tablet', 'À la maison, sur la tablette'), personIds: ['leo'] },

    { id: 'e9', title: tr('Walk in the park with Rose', 'Promenade au parc avec Rose'), start: at(1, 15, 0), place: tr('Rose comes to pick you up', 'Rose passe vous chercher'), personIds: ['rose'] },
    { id: 'e10', title: tr('Appointment with Dr. Martin', 'Rendez-vous avec le docteur Martin'), start: at(2, 10, 30), place: tr('Doctor\'s office, Garden Street', 'Cabinet du médecin, rue des Jardins'), personIds: ['martin', 'sarah'], note: tr('Sarah drives you. She arrives at 10.', 'Sarah vous conduit. Elle arrive à 10 heures.') },
    { id: 'e11', title: tr('Nadia comes to help', 'Nadia vient vous aider'), start: at(3, 9, 0), place: tr('At home', 'À la maison'), personIds: ['nadia'] },
    { id: 'e12', title: tr('Emma\'s birthday lunch', 'Déjeuner d’anniversaire d’Emma'), start: at(4, 12, 0), place: tr('At Sarah\'s home', 'Chez Sarah'), personIds: ['emma', 'sarah', 'leo', 'david'], note: tr('The present for Emma is in the hallway cupboard.', 'Le cadeau d’Emma est dans le placard de l’entrée.') },
    { id: 'e13', title: tr('Tea with Paul', 'Thé avec Paul'), start: at(6, 14, 30), place: tr('At home', 'À la maison'), personIds: ['paul'], note: tr('Paul brings his photos of Italy.', 'Paul apporte ses photos d’Italie.') },
  ];

  // One entry per day; some days have none.
  const diary = [
    { date: at(-1), personIds: ['david'], text: tr('A quiet day at home. In the afternoon David called from Lyon. He had big news: he and Claire are expecting a baby in the spring. You talked for half an hour. In the evening you watched a film about Italy.', 'Une journée calme à la maison. L’après-midi, David a appelé de Lyon. Il avait une grande nouvelle : Claire et lui attendent un bébé pour le printemps. Vous avez parlé une demi-heure. Le soir, vous avez regardé un film sur l’Italie.') },
    { date: at(-2), personIds: ['nadia'], text: tr('Nadia came in the morning. You went to the market together and bought apples, and she made an apple tart. She showed you a photo of her son on his first day of school.', 'Nadia est venue le matin. Vous êtes allées au marché ensemble et avez acheté des pommes, et elle a fait une tarte aux pommes. Elle vous a montré une photo de son fils le jour de sa rentrée.') },
    { date: at(-3), personIds: ['sarah', 'leo', 'emma'], text: tr('Lunch at Sarah\'s home with Leo and Emma. Sarah made roast chicken. Emma told everyone about her riding competition, where she came second. Leo played two songs on the guitar after dessert.', 'Déjeuner chez Sarah avec Leo et Emma. Sarah avait fait un poulet rôti. Emma a raconté son concours d’équitation, où elle est arrivée deuxième. Leo a joué deux chansons à la guitare après le dessert.') },
    { date: at(-5), personIds: ['martin', 'sarah'], text: tr('Sarah drove you to Dr. Martin in the morning. He said everything looks fine. Afterwards you had a coffee with Sarah at the bakery next door.', 'Sarah vous a conduite chez le docteur Martin le matin. Il a dit que tout allait bien. Ensuite, vous avez pris un café avec Sarah à la boulangerie d’à côté.') },
    { date: at(-6), personIds: ['rose'], text: tr('Coffee at Rose\'s home in the afternoon. She is very happy because her daughter Anne is coming from Canada for Christmas. You looked at old photos of the street together.', 'Café chez Rose l’après-midi. Elle est très heureuse, car sa fille Anne vient du Canada pour Noël. Vous avez regardé ensemble de vieilles photos de la rue.') },
    { date: at(-7), personIds: [], text: tr('It rained all day. You stayed at home, did a crossword and sorted the letters on your desk. Sarah called in the evening.', 'Il a plu toute la journée. Vous êtes restée à la maison, vous avez fait des mots croisés et rangé les lettres sur votre bureau. Sarah a appelé le soir.') },
  ];

  // How the people know each other. The user's own link to each person is on the person.
  const connections = [
    { a: 'sarah', b: 'leo', label: tr('mother and son', 'mère et fils') },
    { a: 'sarah', b: 'emma', label: tr('mother and daughter', 'mère et fille') },
    { a: 'leo', b: 'emma', label: tr('brother and sister', 'frère et sœur') },
    { a: 'sarah', b: 'david', label: tr('sister and brother', 'sœur et frère') },
  ];

  // Order of the people around the connections graph: people who know each other sit side by side.
  const ring = ['leo', 'sarah', 'emma', 'david', 'paul', 'rose', 'martin', 'nadia'];

  // Things to remember that are not about a known person: { date, subject, text, quote }.
  const notes = [];

  // The simple things of every day (day.js): { id, list, text, time }.
  // list 'day': to do every day, at `time` ('HH:MM') or at any time ('').
  // list 'leaving': to have before leaving home.
  const tasks = [
    { id: 'pills-morning', list: 'day', text: tr('Take the morning pills', 'Prendre les médicaments du matin'), time: '08:00' },
    { id: 'breakfast', list: 'day', text: tr('Breakfast', 'Petit-déjeuner'), time: '08:30' },
    { id: 'lunch', list: 'day', text: tr('Lunch', 'Déjeuner'), time: '12:30' },
    { id: 'dinner', list: 'day', text: tr('Dinner', 'Dîner'), time: '19:00' },
    { id: 'pills-evening', list: 'day', text: tr('Take the evening pills', 'Prendre les médicaments du soir'), time: '21:00' },
    // `days`: only on these days of the week (0 is Sunday). Without it, every day.
    { id: 'bins', list: 'day', text: tr('Take out the bins', 'Sortir les poubelles'), time: '18:00', days: [2] },
    { id: 'keys', list: 'leaving', text: tr('Keys', 'Clés'), time: '' },
    { id: 'phone', list: 'leaving', text: tr('Phone', 'Téléphone'), time: '' },
    { id: 'card', list: 'leaving', text: tr('Card', 'Carte'), time: '' },
  ];
  // What was done, and when: { taskId, at }. A thing of the day is done when it has one today.
  const ticks = [];
  // Things done step by step, such as a recipe: { id, name, things, steps }.
  // `things` is what is needed; `steps` are done in order.
  const guides = [
    {
      id: 'tea', name: tr('A cup of tea', 'Une tasse de thé'), things: [tr('A cup', 'Une tasse'), tr('A tea bag', 'Un sachet de thé'), tr('Water', 'De l’eau')],
      steps: [
        tr('Fill the kettle with water and switch it on.', 'Remplissez la bouilloire d’eau et allumez-la.'),
        tr('Put the tea bag in the cup.', 'Mettez le sachet de thé dans la tasse.'),
        tr('When the water has boiled, pour it in the cup.', 'Quand l’eau a bouilli, versez-la dans la tasse.'),
        tr('Wait three minutes, then take the tea bag out.', 'Attendez trois minutes, puis retirez le sachet.'),
        tr('Switch the kettle off.', 'Éteignez la bouilloire.'),
      ],
    },
    {
      id: 'omelette', name: tr('An omelette', 'Une omelette'), things: [tr('Two eggs', 'Deux œufs'), tr('Butter', 'Du beurre'), tr('Salt', 'Du sel'), tr('A pan', 'Une poêle'), tr('A bowl and a fork', 'Un bol et une fourchette')],
      steps: [
        tr('Break the two eggs in the bowl.', 'Cassez les deux œufs dans le bol.'),
        tr('Add a pinch of salt and beat with the fork.', 'Ajoutez une pincée de sel et battez avec la fourchette.'),
        tr('Melt a little butter in the pan, on a medium heat.', 'Faites fondre un peu de beurre dans la poêle, à feu moyen.'),
        tr('Pour the eggs in the pan.', 'Versez les œufs dans la poêle.'),
        tr('When the eggs are set, fold the omelette and put it on a plate.', 'Quand les œufs sont cuits, pliez l’omelette et mettez-la dans une assiette.'),
        tr('Switch the heat off.', 'Éteignez le feu.'),
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
  const listeners = [];         // called after every change: the backup, the reminders of the server

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

  const changed = () => { saveLocal(); listeners.forEach((listener) => listener()); };

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
    onChange: (listener) => { listeners.push(listener); },
  };
})();
