// Agenda commands heard on the Listen screen.
//
// Each phrase that was written down is sent to the server, which looks for an
// agenda command in it ("Add to my agenda a coffee with Sarah tomorrow at 3 pm").
// A command becomes a proposal on screen; nothing is added to the agenda until
// the user accepts it.
const Commands = (() => {
  const FOLLOW_UP_MS = 20000;   // a later phrase can still complete a proposal for this long
  const FIELDS = ['date', 'time', 'place', 'activity'];

  const proposals = [];         // { text, result, state: 'pending' | 'added', heardAt, date }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const ask = async (text) => {
    const d = new Date();
    const now = `${Dates.key(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        now,
        people: SampleData.people.map(({ id, name, relationship }) => ({ id, name, relationship })),
        lang: I18n.lang,
      }),
    });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    return res.json();
  };

  // True when `after` keeps everything `before` had understood and adds something to it.
  const completes = (before, after) => {
    const kept = FIELDS.every((f) => !before[f] || before[f] === after[f])
      && before.people.every((p) => after.people.some((q) => q.name === p.name));
    const added = FIELDS.some((f) => !before[f] && after[f]) || after.people.length > before.people.length;
    return kept && added;
  };

  // Called with each phrase that was written down.
  const heard = async (text) => {
    const result = await ask(text);
    if (result.recognized) {
      proposals.push({ text, result, state: 'pending', heardAt: Date.now() });
    } else {
      // Not a command by itself: it may complete the last one ("... tomorrow at 3 pm").
      const open = proposals[proposals.length - 1];
      if (!open || open.state !== 'pending' || Date.now() - open.heardAt > FOLLOW_UP_MS) return;
      const joined = `${open.text} ${text}`;
      const merged = await ask(joined);
      if (!merged.recognized || !completes(open.result, merged)) return;
      Object.assign(open, { text: joined, result: merged, heardAt: Date.now() });
    }
    render();
  };

  const accept = (proposal) => {
    const r = proposal.result;
    const [hours, minutes] = r.time.split(':').map(Number);
    const start = Dates.fromKey(r.date);
    start.setHours(hours, minutes, 0, 0);
    SampleData.add('events', {
      title: r.title,
      start,
      place: r.place || '',
      personIds: r.people.filter((p) => p.id).map((p) => p.id),
    });
    proposal.state = 'added';
    proposal.date = r.date;
  };

  // ---- Screen ----

  const MISSING = { date: tr('the day', 'le jour'), time: tr('the time', 'l’heure') };

  const card = (p, index) => {
    const r = p.result;
    const day = r.date ? esc(Dates.long(Dates.fromKey(r.date))) : `<span class="missing">${tr('day not heard', 'jour pas entendu')}</span>`;
    const time = r.time ? esc(r.time) : `<span class="missing">${tr('time not heard', 'heure pas entendue')}</span>`;
    const missing = r.missing.map((m) => MISSING[m]).join(tr(' and ', ' et '));

    const actions = p.state === 'added'
      ? `<p class="proposal-done">${tr('Added to the agenda.', 'Ajouté à l’agenda.')}
           <a href="#/agenda/${esc(p.date)}">${tr('See it in the agenda', 'Le voir dans l’agenda')}</a></p>`
      : `${missing ? `<p class="proposal-hint">${tr(`I did not hear ${missing}. Say it now, for example “tomorrow at 3 pm”.`, `Je n’ai pas entendu ${missing}. Dites-le maintenant, par exemple « demain à 15 heures ».`)}</p>` : ''}
         <div class="proposal-actions">
           <button class="button primary" type="button" data-proposal="${index}" data-action="add"${missing ? ' disabled' : ''}>${tr('Add to the agenda', 'Ajouter à l’agenda')}</button>
           <button class="button" type="button" data-proposal="${index}" data-action="ignore">${tr('Ignore', 'Ignorer')}</button>
         </div>`;

    return `
      <article class="card proposal${p.state === 'added' ? ' added' : ''}">
        <p class="proposal-heard">“${esc(p.text)}”</p>
        <h3>${esc(r.title)}</h3>
        <dl>
          <dt>${tr('When', 'Quand')}</dt><dd>${day}, ${time}</dd>
          ${r.place ? `<dt>${tr('Where', 'Où')}</dt><dd>${esc(r.place)}</dd>` : ''}
          ${r.people.length ? `<dt>${tr('With', 'Avec')}</dt><dd>${esc(r.people.map((x) => x.name).join(', '))}</dd>` : ''}
        </dl>
        ${actions}
      </article>`;
  };

  const view = () => `
    <section>
      <h2>${tr('Understood for the agenda', 'Compris pour l’agenda')}</h2>
      <div id="proposals"></div>
    </section>`;

  const render = () => {
    const box = document.getElementById('proposals');
    if (!box) return; // another screen is showing
    box.innerHTML = proposals.map(card).join('')
      || `<p class="empty">${tr('Say for example: “Add to my agenda a coffee with Sarah tomorrow at 3 pm at Carmel coffee.”', 'Dites par exemple : « Ajoute dans mon agenda un café avec Sarah demain à 15 heures au café Carmel. »')}</p>`;
  };

  const mount = () => {
    document.getElementById('proposals').addEventListener('click', (e) => {
      const button = e.target.closest('[data-proposal]');
      if (!button) return;
      const index = Number(button.dataset.proposal);
      if (button.dataset.action === 'add') accept(proposals[index]);
      else proposals.splice(index, 1);
      render();
    });
    render();
  };

  return { heard, view, mount };
})();
