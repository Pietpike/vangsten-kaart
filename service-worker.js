const CACHE_NAME = 'pike-hunters-v3';

// Statische bestanden: worden gecached bij installatie
const STATIC_ASSETS = [
    '/vangsten-kaart/icons/icon-192.png',
    '/vangsten-kaart/icons/icon-512.png',
    '/vangsten-kaart/icons/favicon.ico',
    '/vangsten-kaart/manifest.json'
];

// App bestanden: ook gecached bij installatie (fallback voor offline)
const APP_FILES = [
    '/vangsten-kaart/',
    '/vangsten-kaart/index.html',
    '/vangsten-kaart/kaart.js',
    '/vangsten-kaart/login.html',
    '/vangsten-kaart/spot.html',
    '/vangsten-kaart/spot.js'
];

// Installeer: cache alle bestanden voor offline fallback
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache geopend, bestanden cachen');
                return cache.addAll(STATIC_ASSETS.concat(APP_FILES));
            })
    );
    self.skipWaiting();
});

// Activeer: verwijder oude caches
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
    self.clients.claim();
});

// Fetch strategie
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1) Supabase API verzoeken: nooit cachen, altijd netwerk
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2) Externe libraries (Leaflet, MarkerCluster, etc.): cache-first
    //    Deze veranderen nooit voor een gegeven versie-URL
    if (url.hostname !== location.hostname) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
            })
        );
        return;
    }

    // 3) Eigen app bestanden: network-first met cache fallback
    //    Dit zorgt ervoor dat code-updates direct worden uitgediend,
    //    maar dat de app ook werkt zonder netwerk (offline).
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Bewaar de nieuwe versie in cache voor offline gebruik
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            })
            .catch(() => {
                // Geen netwerk beschikbaar: val terug op gecachte versie
                console.log('Geen netwerk, cache gebruiken voor:', event.request.url);
                return caches.match(event.request);
            })
    );
});
