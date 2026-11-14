const CACHE_NAME = "presensi-pkl-v40";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Image/icon-192.png",
  "./Image/icon-512.png",
  "./Image/icon-maskable-192.png",
  "./Image/icon-maskable.png",
  "./Image/apple-touch-icon.png",
  "./Image/Logo-PWA.png",
  "./Image/Logo-Daihatsu.png",
  "./Image/Picture-Hero.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    // Network-First untuk navigasi halaman HTML agar user langsung mendapat update terbaru
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return networkResponse;
          })
          .catch(() => caches.match(event.request).then((res) => res || caches.match("./index.html")))
      );
      return;
    }

    // Cache-First untuk aset gambar & file statis lainnya
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return (
          cachedResponse ||
          fetch(event.request).then((networkResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
              if (event.request.url.startsWith("http")) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            });
          })
        );
      }).catch(() => caches.match("./index.html"))
    );
  }
});
