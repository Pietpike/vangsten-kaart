const CACHE_NAME = 'pike-hunters-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/kaart.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.ico'
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