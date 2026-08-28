/* Studio notifications — show when app posts to SW */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'notify') {
    self.registration.showNotification(d.title || "Artist's Studio", {
      body: d.body || '',
      icon: '/favicon.svg',
      tag: d.tag || 'studio-msg'
    });
  }
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/contact.html'));
});
