// Service worker of a relative's phone: shows the notifications sent by the server
// (server/push.py) when a person they help seems lost, even when the app is closed.
// It keeps nothing: the app is always loaded from the server.

self.addEventListener('push', (event) => {
  let data;
  try { data = event.data.json(); } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Dezheimer', {
    body: data.body || '',
    data: { url: data.url || '/' },
    tag: 'dezheimer-alert',
    renotify: true,
    requireInteraction: true,
  }));
});

// Touching the notification opens the app, or brings it to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.length) return open[0].focus();
    return self.clients.openWindow(url);
  })());
});
