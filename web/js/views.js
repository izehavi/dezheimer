// Screens. Each view takes the app state and returns an HTML string.
const Views = (() => {
  const { people, memos, events, diary, notes, connections, user } = SampleData;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const personById = (id) => people.find((p) => p.id === id);
  const eventsOn = (day) => events
    .filter((e) => Dates.sameDay(e.start, day))
    .sort((a, b) => a.start - b.start);

  // ---- Shared pieces ----

  const initials = (name) => name.replace(/^Dr\.\s*/, '').slice(0, 1).toUpperCase();

  const avatar = (p, size = '') => (p.photo
    ? `<img class="avatar ${size}" src="${esc(p.photo)}" alt="">`
    : `<span class="avatar ${size}" style="background:${esc(p.color)}" aria-hidden="true">${esc(initials(p.name))}</span>`);

  const chip = (p) => `<a class="chip" href="#/people/${esc(p.id)}">${avatar(p, 'small')}${esc(p.name)}</a>`;

  const chips = (ids) => {
    const list = ids.map(personById).filter(Boolean);
    return list.length ? `<div class="chips">${list.map(chip).join('')}</div>` : '';
  };

  const eventCard = (e, now, { showDay = false, highlight = false } = {}) => {
    const past = e.start < now && !highlight;
    return `
      <article class="event${past ? ' past' : ''}${highlight ? ' highlight' : ''}">
        <div class="event-time">
          ${showDay ? `<span class="event-day">${esc(Dates.relative(e.start, now))}</span>` : ''}
          ${esc(Dates.time(e.start))}
        </div>
        <div class="event-body">
          <h3>${esc(e.title)}</h3>
          <p class="event-place">${esc(e.place)}</p>
          ${e.address ? `<p class="event-address">${esc(e.address)}</p>` : ''}
          ${e.lat ? `<a class="event-map" href="${esc(Places.mapLink(e))}" target="_blank" rel="noopener">Show on the map</a>` : ''}
          ${e.note ? `<p class="event-note">${esc(e.note)}</p>` : ''}
          ${chips(e.personIds)}
          ${e.added ? `<p class="added-tag">Added by voice ${removeButton('events', e)}</p>` : ''}
        </div>
      </article>`;
  };

  const empty = (text) => `<p class="empty">${esc(text)}</p>`;

  // Only what was added from the Listen screen can be removed.
  const removeButton = (kind, item) => (item.added
    ? `<button class="link-button" type="button" data-remove="${kind}:${esc(item.id)}">Remove</button>`
    : '');

  // ---- Home ----

  const greeting = (now) => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const home = ({ now }) => {
    const todays = eventsOn(now);
    const next = todays.find((e) => e.start >= now);
    const yesterday = diary.find((d) => Dates.sameDay(d.date, Dates.addDays(now, -1)));

    return `
      <header class="hello">
        <p class="hello-date">${esc(Dates.long(now))}</p>
        <h1>${greeting(now)}, ${esc(user.name)}</h1>
        <p class="hello-time">It is ${esc(Dates.time(now))}</p>
      </header>

      ${Assistant.view()}

      <section>
        <h2>Coming next</h2>
        ${next ? eventCard(next, now, { highlight: true }) : empty('Nothing else is planned today.')}
      </section>

      <section>
        <h2>Your day</h2>
        ${todays.length ? todays.map((e) => eventCard(e, now)).join('') : empty('Nothing is planned today.')}
      </section>

      ${yesterday ? `
      <section>
        <h2>Yesterday</h2>
        <a class="card link-card" href="#/diary/${Dates.key(yesterday.date)}">
          <p>${esc(yesterday.text)}</p>
          <span class="more">Open the diary</span>
        </a>
      </section>` : ''}

      <p class="page-action account-link"><a href="#/account">Account, backup and my own data</a></p>`;
  };

  // ---- Agenda ----

  const agenda = ({ now, day }) => {
    const selected = day || Dates.startOfDay(now);
    const monday = Dates.mondayOf(selected);
    const week = Array.from({ length: 7 }, (_, i) => Dates.addDays(monday, i));
    const list = eventsOn(selected);

    const dayButton = (d) => {
      const classes = [
        'day',
        Dates.sameDay(d, selected) ? 'selected' : '',
        Dates.sameDay(d, now) ? 'is-today' : '',
      ].join(' ');
      const count = eventsOn(d).length;
      return `
        <a class="${classes}" href="#/agenda/${Dates.key(d)}"${Dates.sameDay(d, selected) ? ' aria-current="date"' : ''}>
          <span class="day-name">${esc(Dates.weekdayShort(d))}</span>
          <span class="day-number">${d.getDate()}</span>
          <span class="day-dot${count ? ' on' : ''}" aria-hidden="true"></span>
        </a>`;
    };

    return `
      <header class="page-head">
        <h1>Agenda</h1>
        <p class="sub">${esc(Dates.monthYear(selected))}</p>
      </header>

      <div class="week-nav">
        <a class="button" href="#/agenda/${Dates.key(Dates.addDays(selected, -7))}">← Week before</a>
        ${Dates.sameDay(selected, now) ? '' : '<a class="button primary" href="#/agenda">Back to today</a>'}
        <a class="button" href="#/agenda/${Dates.key(Dates.addDays(selected, 7))}">Week after →</a>
      </div>

      <div class="week">${week.map(dayButton).join('')}</div>

      <section>
        <h2>${esc(Dates.relative(selected, now))}</h2>
        ${list.length ? list.map((e) => eventCard(e, now)).join('') : empty('Nothing is planned this day.')}
      </section>`;
  };

  // ---- People ----

  const peopleList = () => `
    <header class="page-head">
      <h1>People</h1>
      <p class="sub">Your family and friends</p>
    </header>
    <p class="page-action"><a class="button" href="#/people/connections">See how everyone is connected →</a></p>
    <div class="people-grid">
      ${people.map((p) => `
        <a class="person-card" href="#/people/${esc(p.id)}">
          ${avatar(p, 'large')}
          <span class="person-name">${esc(p.name)}</span>
          <span class="person-rel">${esc(p.relationship)}</span>
        </a>`).join('')}
    </div>`;

  const person = ({ now, id }) => {
    const p = personById(id);
    if (!p) return peopleList();

    const theirs = events.filter((e) => e.personIds.includes(p.id)).sort((a, b) => a.start - b.start);
    const nextTime = theirs.find((e) => e.start >= now);
    const lastTime = theirs.filter((e) => e.start < now).pop();
    const news = memos.filter((m) => m.personId === p.id).sort((a, b) => b.date - a.date);

    return `
      <a class="back" href="#/people">← All people</a>

      <header class="person-head">
        ${avatar(p, 'huge')}
        <div>
          <h1>${esc(p.name)}</h1>
          <p class="sub">${esc(p.relationship)}</p>
        </div>
      </header>

      ${p.origin || p.added || linksOf(p).length ? `
      <section>
        <h2>How you know ${esc(p.name)}</h2>
        <div class="card">
          ${p.origin ? `<p>${esc(p.origin)}</p>` : ''}
          ${linksOf(p).map((l) => `<p class="link-line">${chip(l.other)} <span>${esc(l.text || l.label)}</span></p>`).join('')}
          ${p.added ? `<p class="added-tag">Added by voice ${removeButton('people', p)}</p>` : ''}
        </div>
      </section>` : ''}

      ${p.facts.length ? `
      <section>
        <h2>Good to know</h2>
        <ul class="card facts">${p.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </section>` : ''}

      <section>
        <h2>Latest news</h2>
        ${news.length ? news.map((m) => `
          <article class="card memo">
            <p>${esc(m.text)}</p>
            <p class="source">From your conversation ${esc(sourceLabel(m.date, now))}${m.quote ? `: “${esc(m.quote)}”` : ''}
              ${removeButton('memos', m)}</p>
          </article>`).join('') : empty('No news written down yet.')}
      </section>

      <section>
        <h2>Next time together</h2>
        ${nextTime ? eventCard(nextTime, now, { showDay: true, highlight: true }) : empty('Nothing is planned yet.')}
      </section>

      ${lastTime ? `
      <section>
        <h2>Last time together</h2>
        ${eventCard(lastTime, now, { showDay: true })}
      </section>` : ''}`;
  };

  // The people this person is connected to, other than the user.
  const linksOf = (p) => connections
    .filter((c) => c.a === p.id || c.b === p.id)
    .map((c) => ({ other: personById(c.a === p.id ? c.b : c.a), label: c.label, text: c.text }))
    .filter((l) => l.other);

  const sourceLabel = (date, now) => {
    const label = Dates.relative(date, now);
    return label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : `on ${label}`;
  };

  // ---- Diary ----

  const diaryPage = ({ now, day }) => {
    const today = Dates.startOfDay(now);
    const oldest = diary.reduce((min, d) => (d.date < min ? d.date : min), today);
    let selected = day || today;
    if (selected > today) selected = today;
    if (selected < oldest) selected = Dates.startOfDay(oldest);

    const entries = diary.filter((d) => Dates.sameDay(d.date, selected));
    const seen = [...new Set(entries.flatMap((d) => d.personIds))];
    const noted = notes.filter((n) => Dates.sameDay(n.date, selected));
    const isToday = Dates.sameDay(selected, today);
    const planned = eventsOn(selected);

    const prev = selected > Dates.startOfDay(oldest)
      ? `<a class="button" href="#/diary/${Dates.key(Dates.addDays(selected, -1))}">← Day before</a>`
      : '<span class="button disabled">← Day before</span>';
    const next = !isToday
      ? `<a class="button" href="#/diary/${Dates.key(Dates.addDays(selected, 1))}">Day after →</a>`
      : '<span class="button disabled">Day after →</span>';

    return `
      <header class="page-head">
        <h1>Diary</h1>
        <p class="sub">${esc(Dates.long(selected))}</p>
      </header>

      <div class="week-nav">${prev}${next}</div>

      <section>
        <h2>${isToday ? 'Today' : 'What happened'}</h2>
        ${entries.length
          ? entries.map((d) => `
            <article class="card diary-text">
              <p>${esc(d.text)}</p>
              ${d.added ? `<p class="added-tag">Written from a conversation ${removeButton('diary', d)}</p>` : ''}
            </article>`).join('')
          : empty(isToday ? 'Today\'s page is not written yet. It will be ready this evening.' : 'Nothing was written this day.')}
      </section>

      ${seen.length ? `
      <section>
        <h2>People you saw or spoke to</h2>
        ${chips(seen)}
      </section>` : ''}

      ${noted.length ? `
      <section>
        <h2>Also noted</h2>
        ${noted.map((n) => `
          <article class="card memo">
            <p><strong>${esc(n.subject)}:</strong> ${esc(n.text)}</p>
            <p class="source">${n.quote ? `“${esc(n.quote)}”` : ''} ${removeButton('notes', n)}</p>
          </article>`).join('')}
      </section>` : ''}

      ${planned.length ? `
      <section>
        <h2>${isToday ? 'Planned today' : 'What was planned'}</h2>
        ${planned.map((e) => eventCard(e, now)).join('')}
      </section>` : ''}`;
  };

  return { home, agenda, peopleList, person, diary: diaryPage };
})();
