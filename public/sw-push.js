// Service Worker for Web Push Notifications — Radar Alpha
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Radar Alpha", body: event.data.text() };
  }

  const { title, body, icon, tag, data, requireInteraction } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "Radar Alpha", {
      body: body || "",
      icon: icon || "/pwa-icon-192.png",
      badge: "/pwa-icon-192.png",
      tag: tag || `radar-${Date.now()}`,
      requireInteraction: requireInteraction ?? true,
      data: data || {},
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
