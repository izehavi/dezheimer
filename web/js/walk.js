// A walk to the place of an event, shown on the app's own map, with the way watched.
//
// "Take me there" on an event works out the walking way from where the user is, keeps
// it, and shows it. While the app is open the position is watched: when the user is
// off the way for a while, the app says calmly where they are going and where they
// are, works out the way again from there, and shows it. After a second time in the
// same walk, and each time after, the relatives linked to the user are told (alerts.js).
//
// The way is asked of an open routing service built on OpenStreetMap, with the
// position of the start and of the place. The map is drawn with Leaflet.
//
// A web page only gets the position while it is showing: if the phone is locked or
// another app (Google Maps) is in front, nothing is watched. The screen is kept on.
const Walk = (() => {
  const ROUTE_URL = 'https://routing.openstreetmap.de/routed-foot';
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const STATE_KEY = 'dezheimer.walk';
  const OFF_WAY_M = 60;           // further than this from the way is off the way
  const OFF_FOR_MS = 30000;       // off the way this long: the user is lost
  const POOR_FIX_M = 50;          // a position less precise than this is not used to judge
  const ARRIVED_M = 30;
  const TURN_SOON_M = 35;         // a turn is said when this close to it
  const SLOWER = 1.4;             // older people walk slower than the service expects
  const TOO_FAR_KM = 5;
  const TELL_AFTER = 2;           // lost this many times in one walk: the relatives are told
  const KEEP_MS = 6 * 3600000;    // a walk left open longer than this is forgotten

  // { eventId, title, place, start, to: [lat, lon], route, lost: [times], told, began }
  // route: { coords: [[lat, lon]], steps: [{ at, idx, text, said }], metres, seconds }
  let walk = null;
  let here = null;                // { at: [lat, lon], accuracy, time }
  let watchId = null;
  let offSince = null;
  let helping = false;            // the app is telling the user the way again
  let wakeLock = null;
  let map = null;
  let marks = {};
  let message = '';               // what the walk screen says above the map
  let help = '';                  // what the app said when the user was lost
  let tellRelatives = async () => null;   // set by alerts.js; returns the names told

  try {
    const kept = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (kept && Date.now() - kept.began < KEEP_MS) walk = kept;
  } catch { /* no walk going on */ }

  const save = () => {
    try {
      if (walk) localStorage.setItem(STATE_KEY, JSON.stringify(walk));
      else localStorage.removeItem(STATE_KEY);
    } catch { /* kept until the page is closed */ }
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // ---- Distances, in metres ----

  const metres = (a, b) => {
    const rad = Math.PI / 180;
    const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
    const y = (b[0] - a[0]) * rad;
    return Math.sqrt(x * x + y * y) * 6371000;
  };

  // How far `p` is from the way, and the piece of the way it is closest to.
  const fromWay = (p, coords) => {
    const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
    const xy = (q) => [(q[1] - p[1]) * k, (q[0] - p[0]) * 111320];
    let best = { m: Infinity, i: 0 };
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = xy(coords[i]);
      const [bx, by] = xy(coords[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const m = Math.hypot(ax + t * dx, ay + t * dy);
      if (m < best.m) best = { m, i };
    }
    return best;
  };

  // ---- The way ----

  const TURN = tr({
    left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right',
    'sharp left': 'sharp left', 'sharp right': 'sharp right',
  }, {
    left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
    'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite',
  });
  const ORDINAL = tr(['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'],
    ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième']);

  // A step of the routing service, as a short sentence.
  const instruction = (s) => {
    const { type, modifier, exit } = s.maneuver;
    const onto = s.name ? tr(` onto ${s.name}`, ` dans ${s.name}`) : '';
    if (type === 'depart') return s.name ? tr(`Walk along ${s.name}.`, `Suivez ${s.name}.`) : tr('Start walking along the line.', 'Commencez à marcher en suivant la ligne.');
    if (type === 'arrive') return tr('You will be there.', 'Vous y serez.');
    if (type === 'roundabout' || type === 'rotary') {
      return tr(`At the roundabout, take the ${ORDINAL[exit] || 'next'} exit${onto}.`, `Au rond-point, prenez la ${ORDINAL[exit] || 'prochaine'} sortie${onto}.`);
    }
    if (modifier === 'uturn') return tr('Turn around.', 'Faites demi-tour.');
    if (modifier === 'straight' || !TURN[modifier]) return tr(`Go straight on${onto}.`, `Continuez tout droit${onto}.`);
    if (type === 'end of road') return tr(`At the end of the road, turn ${TURN[modifier]}${onto}.`, `Au bout de la rue, tournez ${TURN[modifier]}${onto}.`);
    return tr(`Turn ${TURN[modifier]}${onto}.`, `Tournez ${TURN[modifier]}${onto}.`);
  };

  // A street that only changes its name is not worth a word.
  const worthSaying = (s) => !(['new name', 'continue', 'notification'].includes(s.maneuver.type)
    && (!s.maneuver.modifier || s.maneuver.modifier === 'straight'));

  const nearestPoint = (p, coords) => coords.reduce((best, q, i) => (metres(p, q) < metres(p, coords[best]) ? i : best), 0);

  const fetchRoute = async (from, to) => {
    const res = await fetch(`${ROUTE_URL}/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}`
      + '?overview=full&geometries=geojson&steps=true');
    if (!res.ok) throw new Error(`the routing service answered ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) throw new Error('no way found');
    const r = data.routes[0];
    const coords = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    const steps = r.legs[0].steps.filter(worthSaying).map((s) => {
      const at = [s.maneuver.location[1], s.maneuver.location[0]];
      return { at, idx: nearestPoint(at, coords), text: instruction(s), said: false };
    });
    return { coords, steps, metres: r.distance, seconds: r.duration * SLOWER };
  };

  // The name of the street at `p`, from the same routing service, or null. The very
  // nearest path is often a pavement with no name: the nearest named one, if close.
  const STREET_WITHIN_M = 40;
  const streetAt = async (p) => {
    const res = await fetch(`${ROUTE_URL}/nearest/v1/foot/${p[1]},${p[0]}?number=10`);
    const data = await res.json();
    const named = (data.waypoints || []).find((w) => w.name && w.distance <= STREET_WITHIN_M);
    return named ? named.name : null;
  };

  const minutes = (seconds) => Math.max(1, Math.round(seconds / 60));
  const onFoot = () => tr(`${far(walk.route.metres)}, about ${minutes(walk.route.seconds)} minutes on foot.`,
    `${far(walk.route.metres)}, environ ${minutes(walk.route.seconds)} minutes à pied.`);
  const far = (m) => Places.far(m / 1000);
  const googleMaps = (to) => `https://www.google.com/maps/dir/?api=1&destination=${to[0]},${to[1]}&travelmode=walking`;

  // ---- Where the user is ----

  const FRESH_MS = 15000;

  const locate = (wait = 20000) => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ at: [coords.latitude, coords.longitude], accuracy: coords.accuracy, time: Date.now() }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: wait, maximumAge: 10000 },
    );
  });

  const keepAwake = async () => {
    try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* the screen may go dark */ }
    if (wakeLock) wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
  };
  // The screen lock is let go when the page is hidden; take it again when it comes back.
  document.addEventListener('visibilitychange', () => { if (walk && document.visibilityState === 'visible') keepAwake(); });

  const watch = () => {
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => moved({ at: [coords.latitude, coords.longitude], accuracy: coords.accuracy, time: Date.now() }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    keepAwake();
  };

  const stopWatching = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  };

  const say = (text) => {
    if (!(typeof Assistant !== 'undefined' && Assistant.busy())) Speech.say(text);
  };

  // A new position while walking.
  const moved = (position) => {
    here = position;
    drawHere();
    if (!walk || !walk.route || helping) return;
    if (metres(here.at, walk.to) <= ARRIVED_M + Math.min(here.accuracy || 0, 30)) { arrived(); return; }
    if (here.accuracy > POOR_FIX_M) return;
    const { m, i } = fromWay(here.at, walk.route.coords);
    if (m > OFF_WAY_M) {
      offSince = offSince || Date.now();
      if (Date.now() - offSince >= OFF_FOR_MS) lost();
      return;
    }
    offSince = null;
    guide(i);
  };

  // On the way: the next turn, said once when it is close.
  const guide = (i) => {
    const next = walk.route.steps.find((s) => s.idx > i);
    if (!next) return;
    const d = metres(here.at, next.at);
    message = `${d > TURN_SOON_M ? tr(`In ${far(d)}: `, `Dans ${far(d)} : `) : ''}${next.text}`;
    paintMessage();
    if (d <= TURN_SOON_M && !next.said) {
      next.said = true;
      save();
      say(next.text);
    }
  };

  // `at` writes the time: Dates.time on the screen, Speech.time for the voice.
  const goingTo = (at) => {
    const place = walk.place ? `, ${walk.place.replace(/^At\s+/i, 'at ').replace(/^(À|Au|Aux|Chez)\b/, (w) => w.toLowerCase())}` : '';
    return tr(`You are going to: ${walk.title}${place}. It starts at ${at(new Date(walk.start))}.`,
      `Vous allez à : ${walk.title}${place}. Ça commence à ${at(new Date(walk.start))}.`);
  };

  // Off the way for too long, or "I am lost": where the user is going, where they
  // are, and the way again from here.
  const lost = async () => {
    if (!walk || helping) return;
    helping = true;
    offSince = null;
    walk.lost.push(Date.now());
    save();
    help = tr('One moment, I am looking for the way…', 'Un instant, je cherche le chemin…');
    paintHelp();
    // Someone who is lost should not wait: the position of the walk, if it is recent.
    const fresh = here && Date.now() - here.time < FRESH_MS && here.accuracy <= POOR_FIX_M;
    const position = (fresh ? here : await locate(8000)) || here;
    const name = SampleData.user.name;
    let text = '';
    let street = null;
    if (position) {
      here = position;
      let route;
      [street, route] = await Promise.all([
        streetAt(here.at).catch(() => null),
        fetchRoute(here.at, walk.to).catch(() => null),
      ]);
      if (street) text += tr(` You are on ${street}.`, ` Vous êtes dans ${street}.`);
      if (route) {
        walk.route = route;
        text += tr(` It is ${far(route.metres)} from here. Follow the line on the map.`, ` C'est à ${far(route.metres)} d'ici. Suivez la ligne sur la carte.`)
          + ` ${route.steps[0] ? route.steps[0].text : ''}`;
        if (route.steps[0]) route.steps[0].said = true;
      } else {
        text += tr(' Follow the line on the map.', ' Suivez la ligne sur la carte.');
      }
    }
    // From the second time, the relatives are told each time, with where the user is now.
    if (walk.lost.length >= TELL_AFTER) {
      const told = await tellRelatives({ ...walk, here, street }).catch(() => null);
      if (told && told.length) {
        walk.told = true;
        text += tr(` I have told ${told.join(' and ')} where you are.`, ` J'ai prévenu ${told.join(' et ')} de l'endroit où vous êtes.`);
      }
    }
    save();
    help = `${name}, ${tr('do not worry.', 'ne vous inquiétez pas.')} ${goingTo(Dates.time)}${text}`;
    helping = false;
    drawWay();
    paintHelp();
    await Speech.say(`${name}, ${tr('do not worry.', 'ne vous inquiétez pas.')} ${goingTo(Speech.time)}${text}`);
  };

  const arrived = () => {
    const text = tr(`${SampleData.user.name}, you have arrived. ${walk.title}.`, `${SampleData.user.name}, vous êtes arrivé·e. ${walk.title}.`);
    end();
    message = '';
    help = text;
    const box = document.getElementById('walk');
    if (box) box.innerHTML = `<div class="card walk-help"><p>${esc(text)}</p></div>
      <p class="page-action"><a class="button primary" href="#/">${tr('Back to today', 'Revenir à aujourd’hui')}</a></p>`;
    say(text);
  };

  const end = () => {
    stopWatching();
    walk = null;
    offSince = null;
    save();
  };

  // ---- Starting ----

  const begin = async (eventId) => {
    const event = SampleData.events.find((e) => e.id === eventId);
    if (!event || !event.lat) { showError(tr('This event has no place on the map.', 'Ce rendez-vous n’a pas de lieu sur la carte.')); return; }
    if (walk && walk.eventId === eventId && walk.route) { drawWay(); watch(); return; }
    end();
    message = tr('Looking where you are…', 'Je regarde où vous êtes…');
    paintMessage();
    const position = await locate();
    if (!position) {
      showError(tr('I cannot see where you are. Allow Near to use the position of the phone, then try again.', 'Je ne vois pas où vous êtes. Autorisez Near à utiliser la position du téléphone, puis réessayez.'));
      return;
    }
    here = position;
    const to = [event.lat, event.lon];
    const distance = metres(here.at, to);
    if (distance > TOO_FAR_KM * 1000) {
      showError(tr(`${event.title} is ${far(distance)} from here: too far to walk. Ask someone to drive you, or take a taxi.`,
        `${event.title} : c'est à ${far(distance)} d'ici, trop loin pour y aller à pied. Demandez à quelqu'un de vous conduire, ou prenez un taxi.`), to);
      return;
    }
    message = tr('Looking for the way…', 'Je cherche le chemin…');
    paintMessage();
    let route;
    try { route = await fetchRoute(here.at, to); } catch {
      showError(tr('I could not find the way. The internet may not be reachable.', 'Je n’ai pas trouvé le chemin. Internet n’est peut-être pas joignable.'), to);
      return;
    }
    walk = {
      eventId, title: event.title, place: event.place, start: new Date(event.start).getTime(), to,
      route, lost: [], told: false, began: Date.now(),
    };
    save();
    help = '';
    message = route.steps[0] ? route.steps[0].text : '';
    if (route.steps[0]) route.steps[0].said = true;
    paint();
    watch();
    say(tr(`Let's go. ${walk.title}. It is about ${minutes(route.seconds)} minutes on foot. ${message}`,
      `Allons-y. ${walk.title}. C'est à environ ${minutes(route.seconds)} minutes à pied. ${message}`));
  };

  // ---- The screen ----

  const view = () => `
    <a class="back" href="#/">← ${tr('Back', 'Retour')}</a>
    <div id="walk"></div>`;

  const showError = (text, to) => {
    const box = document.getElementById('walk');
    if (!box) return;
    box.innerHTML = `<p class="empty">${esc(text)}</p>
      ${to ? `<p class="page-action"><a class="button" href="${googleMaps(to)}" target="_blank" rel="noopener">${tr('Open in Google Maps', 'Ouvrir dans Google Maps')}</a></p>` : ''}`;
  };

  const paintMessage = () => {
    const el = document.getElementById('walk-next');
    if (el) el.textContent = message;
    else if (!walk && document.getElementById('walk')) document.getElementById('walk').innerHTML = `<p class="walk-next">${esc(message)}</p>`;
  };

  const paintHelp = () => {
    const el = document.getElementById('walk-help');
    if (!el) return;
    el.hidden = !help;
    el.querySelector('p').textContent = help;
  };

  const paint = () => {
    const box = document.getElementById('walk');
    if (!box || !walk) return;
    const start = new Date(walk.start);
    box.innerHTML = `
      <header class="page-head with-back">
        <p class="hello-date">${tr('On the way', 'En chemin')}</p>
        <h1>${esc(walk.title)}</h1>
        <p class="sub">${esc(walk.place || '')}${walk.place ? ', ' : ''}${tr('at', 'à')} ${esc(Dates.time(start))}</p>
      </header>
      <div id="walk-help" class="card walk-help" role="status" hidden><p></p></div>
      <p class="walk-next" id="walk-next">${esc(message)}</p>
      <div id="walk-map" class="walk-map"></div>
      <p class="source" id="walk-info">${esc(onFoot())}</p>
      <div class="walk-actions">
        <button class="button lost" type="button" data-walk="lost">${tr('I am lost', 'Je suis perdu·e')}</button>
        <a class="button" href="${googleMaps(walk.to)}" target="_blank" rel="noopener">${tr('Open in Google Maps', 'Ouvrir dans Google Maps')}</a>
        <button class="button" type="button" data-walk="stop">${tr('Stop the walk', 'Arrêter la marche')}</button>
      </div>
      <p class="source">${tr('Keep Near open on the screen: it watches the way only while it is showing. In Google Maps, it does not.', 'Gardez Near ouvert à l’écran : il ne surveille le chemin que quand il est affiché. Dans Google Maps, il ne le fait pas.')}</p>`;
    paintHelp();
    drawMap();
  };

  // ---- The map ----

  let leaflet = null;
  const loadLeaflet = () => {
    if (window.L) return Promise.resolve(window.L);
    if (leaflet) return leaflet;
    leaflet = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET}leaflet.min.css`;
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = `${LEAFLET}leaflet.min.js`;
      script.onload = () => resolve(window.L);
      script.onerror = () => { leaflet = null; reject(new Error('the map could not be loaded')); };
      document.head.appendChild(script);
    });
    return leaflet;
  };

  const drawMap = async () => {
    const box = document.getElementById('walk-map');
    if (!box) return;
    let L;
    try { L = await loadLeaflet(); } catch {
      box.innerHTML = `<p class="empty">${tr('The map could not be loaded. Follow what is written above.', 'La carte n’a pas pu être chargée. Suivez ce qui est écrit au-dessus.')}</p>`;
      return;
    }
    if (!document.body.contains(box) || !walk) return;
    if (map) map.remove();
    map = L.map(box, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);
    marks = {};
    drawWay();
    drawHere();
  };

  const drawWay = () => {
    if (!map || !walk || !walk.route) return;
    const L = window.L;
    if (marks.way) marks.way.remove();
    if (marks.to) marks.to.remove();
    marks.way = L.polyline(walk.route.coords, { color: '#5B6249', weight: 9, opacity: 0.85 }).addTo(map);
    const info = document.getElementById('walk-info');
    if (info) info.textContent = onFoot();
    marks.to = L.circleMarker(walk.to, { radius: 14, color: '#FFFFFF', weight: 4, fillColor: '#A04A35', fillOpacity: 1 }).addTo(map);
    map.fitBounds(marks.way.getBounds(), { padding: [30, 30] });
  };

  const drawHere = () => {
    if (!map || !here) return;
    const L = window.L;
    if (marks.here) marks.here.setLatLng(here.at);
    else marks.here = L.circleMarker(here.at, { radius: 11, color: '#FFFFFF', weight: 4, fillColor: '#4E6B73', fillOpacity: 1 }).addTo(map);
    if (!map.getBounds().contains(here.at)) map.panTo(here.at);
  };

  const mount = (arg) => {
    map = null;
    const box = document.getElementById('walk');
    box.addEventListener('click', (e) => {
      const button = e.target.closest('[data-walk]');
      if (!button) return;
      if (button.dataset.walk === 'lost') lost();
      if (button.dataset.walk === 'stop') {
        end();
        Speech.stop();
        location.hash = '#/';
      }
    });
    if (arg && (!walk || walk.eventId !== arg)) begin(arg);
    else if (walk) { paint(); watch(); }
    else showError(tr('No walk is going on. Open the agenda and press "Take me there" on an event.', 'Aucune marche en cours. Ouvrez l’agenda et touchez « Y aller » sur un rendez-vous.'));
  };

  // ---- Elsewhere in the app ----

  // On the home screen, while a walk is going on.
  const homeBlock = () => (walk ? `
    <section>
      <a class="card link-card walk-home" href="#/walk">
        <p>${tr('You are on your way to:', 'Vous êtes en chemin vers :')} <strong>${esc(walk.title)}</strong></p>
        <span class="more">${tr('Show me the way', 'Me montrer le chemin')}</span>
      </a>
    </section>` : '');

  // "Take me there" on an event that is still to come and has a place on the map.
  const button = (event, now) => (event.lat && event.start > now - 3600000 ? `
    <a class="button primary event-go" href="#/walk/${esc(event.id)}">${tr('Take me there', 'Y aller')}</a>` : '');

  // When the app opens on a walk that was going on: watch again.
  const start = () => { if (walk) watch(); };

  return {
    view, mount, start, homeBlock, button, going: () => !!walk,
    onLost: (send) => { tellRelatives = send; },
    // For tests: the pieces that do not need a phone.
    _: { fromWay, instruction, metres },
  };
})();
