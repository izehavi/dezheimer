// Date helpers. Days are identified by a "YYYY-MM-DD" key in local time.
const Dates = (() => {
  const LOCALE = I18n.locale;
  // In French, a date opens with a capital only at the start of a line: done where it is shown.
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };

  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const fromKey = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  };

  const sameDay = (a, b) => key(a) === key(b);

  const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / 86400000);

  const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

  const long = (d) => capital(d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }));
  const weekdayShort = (d) => d.toLocaleDateString(LOCALE, { weekday: 'short' });
  const monthYear = (d) => capital(d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }));
  const time = (d) => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

  // "Today", "Yesterday", "Tomorrow", otherwise the full date.
  const relative = (d, today) => {
    const diff = daysBetween(today, d);
    if (diff === 0) return tr('Today', "Aujourd'hui");
    if (diff === -1) return tr('Yesterday', 'Hier');
    if (diff === 1) return tr('Tomorrow', 'Demain');
    return long(d);
  };

  return { startOfDay, addDays, key, fromKey, sameDay, daysBetween, mondayOf, long, weekdayShort, monthYear, time, relative };
})();
