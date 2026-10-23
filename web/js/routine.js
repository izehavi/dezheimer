// The things of every day, shared with the server (server/routine.py), so that:
// - the user is reminded when the app is closed, by a notification on the phone;
// - the linked relatives are told when the pills, a meal or a drink are not noted
//   after a while, and see the day of the user in their own app.
//
// The list of the things of every day and what was done today and yesterday are sent
// each time they change, only when the user is signed in. While the app is open and
// showing, it says so every minute: it then reminds aloud by itself (reminders.js), and
// the server sends no notification to this phone.
const Routine = (() => {
  const SEND_AFTER_MS = 1000;
  const HERE_EVERY_MS = 60000;
  let sendTimer;
  let pushState = null;      // 'on', 'off', 'denied', 'unsupported' or 'error'

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const active = () => Relatives.role() === 'person' && Account.signedIn() && location.protocol !== 'file:';

  const send = async () => {
    if (!active()) return;
    const now = new Date();
    const days = [Dates.addDays(now, -1), now].map(Dates.key);
    const tasks = SampleData.tasks.filter((t) => t.list === 'day').map((t) => ({
      id: t.id, text: t.text, time: t.time || '', days: t.days || [], kind: Day.kindOf(t.text),
    }));
    const done = SampleData.ticks.filter((k) => days.includes(Dates.key(k.at))).map((k) => ({
      task_id: k.taskId, day: Dates.key(k.at), at: k.at.getTime(), how: k.how || null,
    }));
    let zone = null;
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* the offset is enough */ }
    await Account.api('PUT', 'routine', {
      name: SampleData.user.name, tasks, done, days, zone, offset: -now.getTimezoneOffset(),
    }).catch(() => {});
  };

  const later = () => { clearTimeout(sendTimer); sendTimer = setTimeout(send, SEND_AFTER_MS); };

  const here = () => {
    if (active() && document.visibilityState === 'visible') Account.api('POST', 'here').catch(() => {});
  };

  // ---- On "My day": reminders when the app is closed ----

  const PUSH = {
    on: 'Reminders come even when Near is closed.',
    off: 'Reminders only come while Near is open.',
    denied: 'Notifications are refused for Near on this phone. Allow them in the settings of the phone.',
    unsupported: 'To be reminded when Near is closed, on an iPhone: in Safari, tap Share, then "Add to Home Screen", and open Near from its icon.',
    error: 'This did not work. The Near server may not be reachable.',
  };

  const pushCard = () => (Relatives.role() === 'person' && Account.signedIn() ? `
    <section>
      <h2>Reminders</h2>
      <div id="routine-push"><p class="card">…</p></div>
    </section>` : '');

  const paint = () => {
    const box = document.getElementById('routine-push');
    if (!box || !pushState) return;
    box.innerHTML = `<div class="card"><p>${esc(PUSH[pushState])}</p></div>
      ${pushState === 'on' || pushState === 'unsupported' ? ''
        : '<p class="page-action"><button class="button primary" type="button" data-routine-push>Remind me even when it is closed</button></p>'}`;
  };

  const mount = async () => {
    const box = document.getElementById('routine-push');
    if (!box) return;
    box.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-routine-push]')) return;
      pushState = await Alerts.enable().catch(() => 'error');
      paint();
      send();
    });
    if (pushState !== 'error') pushState = await Alerts.state();
    paint();
  };

  // Called once when the app opens, on the person's phone.
  const start = () => {
    SampleData.onChange(later);
    window.addEventListener('dezheimer-account', later);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { here(); later(); } });
    setInterval(here, HERE_EVERY_MS);
    send();
  };

  return { start, pushCard, mount };
})();
