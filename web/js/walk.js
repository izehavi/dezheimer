// A walk to the place of an event, shown on the app's own map, with the way watched.
//
// "Take me there" on an event works out the walking way from where the user is, keeps
// it, and shows it. While the app is open the position is watched: when the user is
// off the way for a while, the app says calmly where they are going and where they
// are, works out the way again from there, and shows it. After a second time in the
// same walk, the relatives linked to the user are told (alerts.js).
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
  let here = null;                // { at: [lat, lon], accuracy }
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

  const TURN = {
    left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right',
    'sharp left': 'sharp left', 'sharp right': 'sharp right',
  };
  const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

  // A step of the routing service, as a short sentence.
  const instruction = (s) => {
    const { type, modifier, exit } = s.maneuver;
    const onto = s.name ? ` onto ${s.name}` : '';
    if (type === 'depart') return s.name ? `Walk along ${s.name}.` : 'Start walking along the line.';
    if (type === 'arrive') return 'You will be there.';
    if (type === 'roundabout' || type === 'rotary') return `At the roundabout, take the ${ORDINAL[exit] || 'next'} exit${onto}.`;
    if (modifier === 'uturn') return 'Turn around.';
    if (modifier === 'straight' || !TURN[modifier]) return `Go straight on${onto}.`;
    if (type === 'end of road') return `At the end of the road, turn ${TURN[modifier]}${onto}.`;
    return `Turn ${TURN[modifier]}${onto}.`;
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

  // The name of the street at `p`, from the same routing service, or null.
  const streetAt = async (p) => {
    const res = await fetch(`${ROUTE_URL}/nearest/v1/foot/${p[1]},${p[0]}`);
    const data = await res.json();
    return (data.waypoints && data.waypoints[0] && data.waypoints[0].name) || null;
  };

  const minutes = (seconds) => Math.max(1, Math.round(seconds / 60));
  const far = (m) => Places.far(m / 1000);
  const googleMaps = (to) => `https://www.google.com/maps/dir/?api=1&destination=${to[0]},${to[1]}&travelmode=walking`;

  // ---- Where the user is ----

  const locate = () => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ at: [coords.latitude, coords.longitude], accuracy: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
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
      ({ coords }) => moved({ at: [coords.latitude, coords.longitude], accuracy: coords.accuracy }),
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
    message = `${d > TURN_SOON_M ? `In ${far(d)}: ` : ''}${next.text}`;
    paintMessage();
    if (d <= TURN_SOON_M && !next.said) {
      next.said = true;
      save();
      say(next.text);
    }
  };

  // `at` writes the time: Dates.time on the screen, Speech.time for the voice.
  const goingTo = (at) => {
    const place = walk.place ? `, ${walk.place.replace(/^At\s+/i, 'at ')}` : '';
    return `You are going to: ${walk.title}${place}. It starts at ${at(new Date(walk.start))}.`;
  };

  // Off the way for too long, or "I am lost": where the user is going, where they
  // are, and the way again from here.
  const lost = async () => {
    if (!walk || helping) return;
    helping = true;
    offSince = null;
    walk.lost.push(Date.now());
    save();
    help = 'One moment, I am looking for the way…';
    paintHelp();
    const position = (await locate()) || here;
    const name = SampleData.user.name;
    let text = '';
    if (position) {
      here = position;
      const [street, route] = await Promise.all([
        streetAt(here.at).catch(() => null),
        fetchRoute(here.at, walk.to).catch(() => null),
      ]);
      if (street) text += ` You are on ${street}.`;
      if (route) {
        walk.route = route;
        text += ` It is ${far(route.metres)} from here. Follow the line on the map. ${route.steps[0] ? route.steps[0].text : ''}`;
        if (route.steps[0]) route.steps[0].said = true;
      } else {
        text += ' Follow the line on the map.';
      }
    }
    if (walk.lost.length >= TELL_AFTER && !walk.told) {
      const told = await tellRelatives({ ...walk, here }).catch(() => null);
      if (told && told.length) {
        walk.told = true;
        text += ` I have told ${told.join(' and ')} where you are.`;
      }
    }
    save();
    help = `${name}, do not worry. ${goingTo(Dates.time)}${text}`;
    helping = false;
    drawWay();
    paintHelp();
    await Speech.say(`${name}, do not worry. ${goingTo(Speech.time)}${text}`);
  };

  const arrived = () => {
    const text = `${SampleData.user.name}, you have arrived. ${walk.title}.`;
    end();
    message = '';
    help = text;
    const box = document.getElementById('walk');
    if (box) box.innerHTML = `<div class="card walk-help"><p>${esc(text)}</p></div>
      <p class="page-action"><a class="button primary" href="#/">Back to today</a></p>`;
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
    if (!event || !event.lat) { showError('This event has no place on the map.'); return; }
    if (walk && walk.eventId === eventId && walk.route) { drawWay(); watch(); return; }
    end();
    message = 'Looking where you are…';
    paintMessage();
    const position = await locate();
    if (!position) {
      showError('I cannot see where you are. Allow Dezheimer to use the position of the phone, then try again.');
      return;
    }
    here = position;
    const to = [event.lat, event.lon];
    const distance = metres(here.at, to);
    if (distance > TOO_FAR_KM * 1000) {
      showError(`${event.title} is ${far(distance)} from here: too far to walk. Ask someone to drive you, or take a taxi.`, to);
      return;
    }
    message = 'Looking for the way…';
    paintMessage();
    let route;
    try { route = await fetchRoute(here.at, to); } catch {
      showError('I could not find the way. The internet may not be reachable.', to);
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
    say(`Let's go. ${walk.title}. It is about ${minutes(route.seconds)} minutes on foot. ${message}`);
  };

  // ---- The screen ----

  const view = () => `
    <a class="back" href="#/">← Back</a>
    <div id="walk"></div>`;

  const showError = (text, to) => {
    const box = document.getElementById('walk');
    if (!box) return;
    box.innerHTML = `<p class="empty">${esc(text)}</p>
      ${to ? `<p class="page-action"><a class="button" href="${googleMaps(to)}" target="_blank" rel="noopener">Open in Google Maps</a></p>` : ''}`;
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
        <p class="hello-date">On the way</p>
        <h1>${esc(walk.title)}</h1>
        <p class="sub">${esc(walk.place || '')}${walk.place ? ', ' : ''}at ${esc(Dates.time(start))}</p>
      </header>
      <div id="walk-help" class="card walk-help" role="status" hidden><p></p></div>
      <p class="walk-next" id="walk-next">${esc(message)}</p>
      <div id="walk-map" class="walk-map"></div>
      <p class="source" id="walk-info">${esc(far(walk.route.metres))}, about ${minutes(walk.route.seconds)} minutes on foot.</p>
      <div class="walk-actions">
        <button class="button lost" type="button" data-walk="lost">I am lost</button>
        <a class="button" href="${googleMaps(walk.to)}" target="_blank" rel="noopener">Open in Google Maps</a>
        <button class="button" type="button" data-walk="stop">Stop the walk</button>
      </div>
      <p class="source">Keep Dezheimer open on the screen: it watches the way only while it is showing. In Google Maps, it does not.</p>`;
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
      box.innerHTML = '<p class="empty">The map could not be loaded. Follow what is written above.</p>';
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
    marks.way = L.polyline(walk.route.coords, { color: '#0F5E63', weight: 9, opacity: 0.85 }).addTo(map);
    const info = document.getElementById('walk-info');
    if (info) info.textContent = `${far(walk.route.metres)}, about ${minutes(walk.route.seconds)} minutes on foot.`;
    marks.to = L.circleMarker(walk.to, { radius: 14, color: '#FFFFFF', weight: 4, fillColor: '#A4262C', fillOpacity: 1 }).addTo(map);
    map.fitBounds(marks.way.getBounds(), { padding: [30, 30] });
  };

  const drawHere = () => {
    if (!map || !here) return;
    const L = window.L;
    if (marks.here) marks.here.setLatLng(here.at);
    else marks.here = L.circleMarker(here.at, { radius: 11, color: '#FFFFFF', weight: 4, fillColor: '#1D5C8C', fillOpacity: 1 }).addTo(map);
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
    else showError('No walk is going on. Open the agenda and press "Take me there" on an event.');
  };

  // ---- Elsewhere in the app ----

  // On the home screen, while a walk is going on.
  const homeBlock = () => (walk ? `
    <section>
      <a class="card link-card walk-home" href="#/walk">
        <p>You are on your way to: <strong>${esc(walk.title)}</strong></p>
        <span class="more">Show me the way</span>
      </a>
    </section>` : '');

  // "Take me there" on an event that is still to come and has a place on the map.
  const button = (event, now) => (event.lat && event.start > now - 3600000 ? `
    <a class="button primary event-go" href="#/walk/${esc(event.id)}">Take me there</a>` : '');

  // When the app opens on a walk that was going on: watch again.
  const start = () => { if (walk) watch(); };

  return {
    view, mount, start, homeBlock, button, going: () => !!walk,
    onLost: (send) => { tellRelatives = send; },
    // For tests: the pieces that do not need a phone.
    _: { fromWay, instruction, metres },
  };
})();
