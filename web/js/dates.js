// Date helpers. Days are identified by a "YYYY-MM-DD" key in local time.
const Dates = (() => {
  const LOCALE = 'en-GB';

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

  const long = (d) => d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const weekdayShort = (d) => d.toLocaleDateString(LOCALE, { weekday: 'short' });
  const monthYear = (d) => d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  const time = (d) => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

  // "Today", "Yesterday", "Tomorrow", otherwise the full date.
  const relative = (d, today) => {
    const diff = daysBetween(today, d);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    return long(d);
  };

  return { startOfDay, addDays, key, fromKey, sameDay, daysBetween, mondayOf, long, weekdayShort, monthYear, time, relative };
})();
