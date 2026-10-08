// The connections map: the user in the middle, the people around, grouped as
// family, friends and care. Touching a person shows how the user knows them and
// who they are linked to. The search box finds a person from any word about them.
const Graph = (() => {
  const SIZE = 800, CENTER = SIZE / 2, RADIUS = 280, NODE = 46;

  const GROUPS = [
    { id: 'family', label: 'Family', color: '#0F5E63' },
    { id: 'friends', label: 'Friends', color: '#6B3FA0' },
    { id: 'care', label: 'Care and help', color: '#1D5C8C' },
  ];
  const FAMILY = /\b(daughter|son|grand\w+|wife|husband|sister|brother|mother|father|mum|dad|niece|nephew|cousin|aunt|uncle|in-law|child|partner|fianc\w+|boyfriend|girlfriend)\b/i;
  const CARE = /\b(doctor|nurse|helper|carer|caregiver|physio\w*|dentist|pharmacist|therapist|optician|aide)\b/i;

  let selected = null;   // id of the person whose links are shown
  let query = '';

  const { people, memos, connections, ring } = SampleData;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const at = (n) => n.toFixed(1);
  const personById = (id) => people.find((p) => p.id === id);
  const initial = (name) => name.replace(/^Dr\.\s*/, '').slice(0, 1).toUpperCase();

  const groupOf = (p) => {
    const text = `${p.relationship} ${p.link || ''}`;
    if (CARE.test(text)) return 'care';
    // "Rose's daughter" is not the user's own family.
    return /^your\b/i.test(p.relationship) && FAMILY.test(text) ? 'family' : 'friends';
  };

  const linksOf = (id) => connections
    .filter((c) => c.a === id || c.b === id)
    .map((c) => ({ other: personById(c.a === id ? c.b : c.a), label: c.label, text: c.text }))
    .filter((l) => l.other);

  // Everything written about a person, for the search.
  const haystack = (p) => [
    p.name, p.relationship, p.link, p.origin, ...(p.facts || []),
    ...memos.filter((m) => m.personId === p.id).map((m) => m.text),
    ...linksOf(p.id).map((l) => `${l.label} ${l.other.name}`),
  ].filter(Boolean).join(' ').toLowerCase();

  const matches = () => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return new Set(people.filter((p) => words.every((w) => haystack(p).includes(w))).map((p) => p.id));
  };

  // People of the same group sit side by side, family at the top.
  const layout = () => {
    const order = (p) => GROUPS.findIndex((g) => g.id === groupOf(p)) * 100
      + (ring.includes(p.id) ? ring.indexOf(p.id) : 99);
    const ordered = [...people].sort((a, b) => order(a) - order(b));
    const family = ordered.filter((p) => groupOf(p) === 'family').length;
    const step = 360 / Math.max(ordered.length, 1);
    const spot = {};
    ordered.forEach((p, i) => {
      const angle = (-90 + (i - (family - 1) / 2) * step) * Math.PI / 180;
      spot[p.id] = { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle), angle };
    });
    return { ordered, spot };
  };

  // ---- Drawing ----

  const svg = () => {
    const { ordered, spot } = layout();
    const found = matches();
    const focus = selected && spot[selected] ? selected : null;
    const near = focus ? new Set([focus, ...linksOf(focus).map((l) => l.other.id)]) : null;
    const dim = (id) => (found && !found.has(id)) || (near && !near.has(id));

    const spokes = ordered.map((p) => {
      const { x, y } = spot[p.id];
      const color = GROUPS.find((g) => g.id === groupOf(p)).color;
      return `<line class="graph-line${dim(p.id) ? ' dim' : ''}${p.id === focus ? ' strong' : ''}" stroke="${color}"
        x1="${CENTER}" y1="${CENTER}" x2="${at(x)}" y2="${at(y)}" />`;
    }).join('');

    // Links between two people bend towards the middle, so they do not hide the names.
    const chords = connections.filter((c) => spot[c.a] && spot[c.b]).map((c) => {
      const a = spot[c.a], b = spot[c.b];
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const bendX = midX + (CENTER - midX) * 0.3, bendY = midY + (CENTER - midY) * 0.3;
      const shown = focus && (c.a === focus || c.b === focus);
      const hidden = (found && !(found.has(c.a) && found.has(c.b))) || (focus && !shown);
      // No words on these lines: the panel under the map says what each link is.
      return `<path class="graph-link${hidden ? ' dim' : ''}${shown ? ' strong' : ''}"
          d="M ${at(a.x)} ${at(a.y)} Q ${at(bendX)} ${at(bendY)} ${at(b.x)} ${at(b.y)}" />`;
    }).join('');

    const nodes = ordered.map((p) => {
      const { x, y, angle } = spot[p.id];
      // The name is written outside the circle, away from the lines.
      const side = Math.cos(angle);
      const anchor = side > 0.3 ? 'start' : side < -0.3 ? 'end' : 'middle';
      const nameX = x + side * (NODE + 16);
      const nameY = y + Math.sin(angle) * (NODE + 34) - (anchor === 'middle' ? 0 : 10);
      return `
        <g class="graph-node${dim(p.id) ? ' dim' : ''}${p.id === focus ? ' selected' : ''}" data-person="${esc(p.id)}"
           tabindex="0" role="button" aria-label="${esc(p.name)}, ${esc(p.relationship)}">
          <circle class="graph-halo" cx="${at(x)}" cy="${at(y)}" r="${NODE + 9}" />
          <circle cx="${at(x)}" cy="${at(y)}" r="${NODE}" fill="${esc(p.color)}" />
          <text class="graph-initial" x="${at(x)}" y="${at(y)}">${esc(initial(p.name))}</text>
          <text class="graph-name" style="text-anchor: ${anchor}" x="${at(nameX)}" y="${at(nameY)}">${esc(p.name)}</text>
          <text class="graph-role" style="text-anchor: ${anchor}" x="${at(nameX)}" y="${at(nameY + 27)}">${esc(p.link || '')}</text>
        </g>`;
    }).join('');

    return `
      <svg class="graph" viewBox="-190 -40 ${SIZE + 380} ${SIZE + 90}" role="group" aria-label="Map of the people you know">
        ${spokes}${chords}
        <circle cx="${CENTER}" cy="${CENTER}" r="60" class="graph-you" />
        <text class="graph-initial" x="${CENTER}" y="${CENTER}">You</text>
        ${nodes}
      </svg>`;
  };

  const panel = () => {
    const found = matches();
    const p = selected && personById(selected);
    if (!p) {
      if (found && !found.size) return `<p class="empty">Nobody matches “${esc(query)}”.</p>`;
      if (found) {
        return `
          <article class="card graph-panel">
            <p>${found.size} people match “${esc(query)}”. Touch one:</p>
            <ul class="panel-links">${people.filter((x) => found.has(x.id)).map((x) => `
              <li><button class="chip" type="button" data-person="${esc(x.id)}">${esc(x.name)}</button>
                <span>${esc(x.relationship)}</span></li>`).join('')}</ul>
          </article>`;
      }
      return '<p class="empty">Touch a person to see how you know them and who they are linked to.</p>';
    }
    const links = linksOf(p.id);
    const news = memos.filter((m) => m.personId === p.id).sort((a, b) => b.date - a.date)[0];
    return `
      <article class="card graph-panel">
        <h2 class="panel-name">${esc(p.name)}</h2>
        <p class="sub">${esc(p.relationship)}</p>
        ${p.origin ? `<p class="panel-origin">${esc(p.origin)}</p>` : ''}
        ${links.length ? `<ul class="panel-links">${links.map((l) => `
          <li><button class="chip" type="button" data-person="${esc(l.other.id)}">${esc(l.other.name)}</button>
            <span>${esc(l.text || l.label)}</span></li>`).join('')}</ul>` : ''}
        ${news ? `<p class="panel-news"><strong>Latest news:</strong> ${esc(news.text)}</p>` : ''}
        <p class="panel-actions">
          <a class="button primary" href="#/people/${esc(p.id)}">Open ${esc(p.name)}'s page</a>
          <button class="button" type="button" data-person="">Show everyone</button>
        </p>
      </article>`;
  };

  const view = () => `
    <a class="back" href="#/people">← All people</a>

    <header class="page-head with-back">
      <h1>How everyone is connected</h1>
      <p class="sub">You are in the middle. Touch a person to see how you know them.</p>
    </header>

    <div class="graph-tools">
      <label for="graph-search">Search for a person, a place or a word</label>
      <input id="graph-search" type="search" autocomplete="off" placeholder="For example: school, neighbour, Sarah" value="${esc(query)}">
    </div>

    <ul class="graph-legend">
      ${GROUPS.map((g) => `<li><span style="background:${g.color}"></span>${g.label}</li>`).join('')}
      <li><span class="dashed"></span>They know each other</li>
    </ul>

    <div id="graph-map"></div>
    <div id="graph-panel" aria-live="polite"></div>`;

  // Only the map and the panel are redrawn, so the search box keeps its text and focus.
  const draw = () => {
    const map = document.getElementById('graph-map');
    if (!map) return;
    map.innerHTML = svg();
    document.getElementById('graph-panel').innerHTML = panel();
  };

  const select = (id) => {
    selected = id && id !== selected ? id : null;
    draw();
  };

  const mount = () => {
    const screen = document.getElementById('graph-map').parentElement;
    document.getElementById('graph-search').addEventListener('input', (e) => {
      query = e.target.value.trim();
      const found = matches();
      // A single match is opened directly.
      selected = found && found.size === 1 ? [...found][0] : null;
      draw();
    });
    for (const id of ['graph-map', 'graph-panel']) {
      document.getElementById(id).addEventListener('click', (e) => {
        const target = e.target.closest('[data-person]');
        if (target) select(target.dataset.person);
      });
    }
    document.getElementById('graph-map').addEventListener('keydown', (e) => {
      const target = e.target.closest('[data-person]');
      if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(target.dataset.person); }
    });
    if (selected && !personById(selected)) selected = null;
    draw();
    return screen;
  };

  return { view, mount };
})();
