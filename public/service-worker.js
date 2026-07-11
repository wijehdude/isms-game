const retireLegacyApp = async () => {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  await self.clients.claim();
  await self.registration.unregister();

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(windows.map((client) => client.navigate(client.url)));
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(retireLegacyApp()));
self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));
