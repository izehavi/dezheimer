// Finding a place on the map, near the user.
//
// When an event is added, its place ("Carmel coffee") is looked for around the user,
// so that the event keeps a real address. The position comes from the device; when
// the device does not give it, the app asks once for the town and remembers it.
//
// This is the one thing that leaves the device without an account: the name of the
// place and a rough position (rounded to about one kilometre) are sent to an open
// map service built on OpenStreetMap. Distances are worked out on the device.
const Places = (() => {
  const SEARCH_URL = 'https://photon.komoot.io/api/';
  const MAX_KM = 30;             // further than this is not "around"
  const MAX_FOUND = 3;
  const POSITION_WAIT_MS = 20000;
  const POSITION_FRESH_MS = 5 * 60 * 1000;
  const TOWN_KEY = 'dezheimer.town';

  let last = null;               // the last position of the device: { lat, lon, at }
  let declined = false;          // the user did not want to say where they are, until the page is closed

  // Places that are not on a map: "At home", "At Sarah's home", "On the phone".
  const PRIVATE = /\b(home|house|nowhere|phone|tablet|online|video|pick you up)\b/i;
  const searchable = (place) => !!place && !PRIVATE.test(place) && !declined;

  const query = (place) => place.replace(/^(at|in|to|on)\s+/i, '').replace(/^the\s+/i, '').replace(/[.?!]+$/, '').trim();

  // ---- Where the user is ----

  // The position of the device, or null when it is refused or not available.
  const position = () => new Promise((resolve) => {
    if (last && Date.now() - last.at < POSITION_FRESH_MS) { resolve(last); return; }
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), POSITION_WAIT_MS);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(timer);
        last = { lat: coords.latitude, lon: coords.longitude, exact: true, at: Date.now() };
        resolve(last);
      },
      () => { clearTimeout(timer); resolve(null); },
      { timeout: POSITION_WAIT_MS - 2000, maximumAge: POSITION_FRESH_MS },
    );
  });

  const town = () => {
    try { return JSON.parse(localStorage.getItem(TOWN_KEY) || 'null'); } catch { return null; }
  };

  // Around where to search: the device's position, or else the town the user gave.
  const here = async () => (declined ? null : (await position()) || town());

  // "I am in Lyon." -> the town of Lyon, remembered. Null when no such town is found.
  const setTown = async (text) => {
    const name = text.replace(/^\W*(i am|i'm|i live|we are|it is|it's)?\s*(in|at|near)?\s+/i, ' ').replace(/[.?!,]+\s*$/, '').trim();
    if (!name) return null;
    const first = async (extra) => (await fetchPlaces(`q=${encodeURIComponent(name)}&limit=1${extra}`))[0];
    const f = (await first('&layer=city')) || (await first(''));
    if (!f) return null;
    const found = { name: f.properties.name || name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    try { localStorage.setItem(TOWN_KEY, JSON.stringify(found)); } catch { /* until the page is closed */ }
    return found;
  };

  const forgetTown = () => {
    declined = false;
    try { localStorage.removeItem(TOWN_KEY); } catch { /* nothing to forget */ }
  };

  const decline = () => { declined = true; return null; };

  // ---- Searching ----

  const fetchPlaces = async (params) => {
    const res = await fetch(`${SEARCH_URL}?${params}`);
    if (!res.ok) throw new Error(`the map service answered ${res.status}`);
    return (await res.json()).features || [];
  };

  const km = (a, b) => {
    const rad = Math.PI / 180;
    const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
    const y = (b.lat - a.lat) * rad;
    return Math.sqrt(x * x + y * y) * 6371;
  };

  // "Café de la Mairie" -> ["cafe", "de", "la", "mairie"]
  const words = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  // The places called `place` around `near`: those whose name is what was said come
  // first, and among them the nearest. [{ name, address, lat, lon, km }]
  // `km` is only given when `near` is the real position of the device.
  const search = async (place, near) => {
    const q = query(place);
    if (!q) return [];
    // A rough position is enough to search around, and says less about the user.
    const features = await fetchPlaces(
      `q=${encodeURIComponent(q)}&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}&limit=10`);
    const found = [];
    for (const f of features) {
      const p = f.properties;
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const name = p.name || street;
      if (!name) continue;
      const address = [p.name ? street : '', p.city || p.town || p.village || p.county].filter(Boolean).join(', ');
      const spot = { name, address, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      spot.km = km(near, spot);
      const named = words(name);
      // 2: exactly the name that was said; 1: the name contains it; 0: only close.
      const said = words(q);
      spot.match = said.every((w) => named.includes(w)) ? (named.length === said.length ? 2 : 1) : 0;
      // The same place is often on the map twice, as a point and as a building.
      const twice = found.some((o) => o.name.toLowerCase() === name.toLowerCase() && km(o, spot) < 0.1);
      if (spot.km <= MAX_KM && !twice) found.push(spot);
    }
    found.sort((a, b) => b.match - a.match || a.km - b.km);
    // `sure`: the name is the one that was said, not only a name that looks like it.
    return found.slice(0, MAX_FOUND).map(({ match, km: d, ...spot }) => ({ ...spot, sure: match > 0, ...(near.exact ? { km: d } : {}) }));
  };

  // "600 metres", "2.5 kilometres"
  const far = (d) => (d === undefined ? '' : d < 0.95
    ? `${Math.max(50, Math.round(d * 20) * 50)} metres`
    : `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)} kilometres`);

  const mapLink = ({ lat, lon }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;

  return { searchable, here, town, setTown, forgetTown, decline, search, far, mapLink };
})();
