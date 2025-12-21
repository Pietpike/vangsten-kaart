const CACHE_NAME = 'pike-hunters-v2';
const urlsToCache = [
  '/vangsten-kaart/',
  '/vangsten-kaart/index.html',
  '/vangsten-kaart/kaart.js',
  '/vangsten-kaart/login.html',
  '/vangsten-kaart/spot.html',
  '/vangsten-kaart/spot.js',
  '/vangsten-kaart/manifest.json',
  '/vangsten-kaart/icons/icon-192.png',
  '/vangsten-kaart/icons/icon-512.png',
  '/vangsten-kaart/icons/favicon.ico'
];

// Installeer en cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache geopend');
        return cache.addAll(urlsToCache);
      })
  );
  // Forceer nieuwe service worker direct actief te worden
  self.skipWaiting();
});

// Activeer en verwijder oude caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Oude cache verwijderd:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim direct alle clients
  return self.clients.claim();
});

// Haal files uit cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
