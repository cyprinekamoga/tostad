// Tar emot pushnotiser till personalappen och öppnar rätt sida när man trycker på notisen.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'TO Städ & Flytt', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'TO Städ & Flytt', {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: '/icon-192.png',
      badge: '/favicon-48.png',
      data: { url: data.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith('/app'));
      if (open) return open.navigate(url).then((c) => (c ?? open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
