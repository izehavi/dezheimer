// Alerts: when the person seems lost, their relatives are told.
//
// On the person's phone, the walk (walk.js) calls this after the second time the
// person is lost on the same walk, and at each time after: the position, the street
// and the event they were going to are sent to the server, which notifies the phones
// of the linked relatives (server/push.py).
//
// On a relative's phone, notifications are switched on once: the phone gives a push
// address, kept by the server. On an iPhone this only works from the icon on the home
// screen (Share, then "Add to Home Screen"), not in Safari itself.
const Alerts = (() => {
  // ---- On the person's phone ----

  Walk.onLost(async (walk) => {
    if (!Account.signedIn() || !walk.here) return null;
    const [lat, lon] = walk.here.at;
    const res = await Account.api('POST', 'alerts', {
      lat, lon, accuracy: walk.here.accuracy, street: walk.street || null,
      title: walk.title, place: walk.place || null, start: walk.start, times: walk.lost.length,
    });
    return res.ok ? res.data.told : null;
  });

  // ---- On a relative's phone ----

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // The key the server signs with, as the phone wants it.
  const bytes = (text) => {
    const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const subscription = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
  };

  const tellServer = async (sub) => {
    const { endpoint, keys } = sub.toJSON();
    // The language too: the notifications of this phone are written in it.
    const res = await Account.api('POST', 'push', { endpoint, p256dh: keys.p256dh, auth: keys.auth, lang: I18n.lang });
    return res.ok;
  };

  // 'on', 'off', 'denied' or 'unsupported'
  const state = async () => {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try { return (await subscription()) && Notification.permission === 'granted' ? 'on' : 'off'; } catch { return 'off'; }
  };

  // Called on a touch: phones only ask for the permission after one.
  const enable = async () => {
    if (!supported()) return 'unsupported';
    if ((await Notification.requestPermission()) !== 'granted') return 'denied';
    const registration = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const { key } = await (await fetch('/api/push/key')).json();
    const sub = (await registration.pushManager.getSubscription())
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
    return (await tellServer(sub)) ? 'on' : 'error';
  };

  // When the app opens: give the push address again, in case the server lost it.
  const start = async () => {
    try {
      const sub = supported() && Account.signedIn() && (await subscription());
      if (sub) await tellServer(sub);
    } catch { /* tried again next time */ }
  };

  const latest = async () => {
    const res = await Account.api('GET', 'alerts');
    return res.ok ? res.data : null;
  };

  return { state, enable, start, latest };
})();
