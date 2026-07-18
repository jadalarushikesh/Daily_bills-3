// Hamsa Milk Shop — Service Worker
// IMPORTANT: bump CACHE_VERSION every time you deploy a new index.html / app update.
// Bumping this string is what forces old cached files (and old app logic) to be
// thrown away on the next load — otherwise users can keep seeing stale behavior.
const CACHE_VERSION = 'hamsa-milk-v2';
const STATIC_CACHE = CACHE_VERSION + '-static';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png'
];

// ---------- INSTALL ----------
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      // Activate this new service worker immediately instead of waiting
      // for all tabs to close — this is what prevents "stuck on old version".
      return self.skipWaiting();
    })
  );
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== STATIC_CACHE; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ---------- FETCH ----------
self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch Firestore / Firebase / any cross-origin API calls —
  // always let those go straight to the network so bill data stays live.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first for the app shell (HTML/JS logic) so a redeployed
  // index.html is picked up on the very next load instead of being
  // served stale from cache.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(function (cache) { cache.put(req, resClone); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-first for static assets (icons, manifest) — these rarely change
  // and it's fine to serve them instantly from cache.
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        const resClone = res.clone();
        caches.open(STATIC_CACHE).then(function (cache) { cache.put(req, resClone); });
        return res;
      }).catch(function () {
        // No cache, no network — nothing we can do for this asset.
        return cached;
      });
    })
  );
});

// Allow the page to trigger an immediate update check/activation,
// e.g. after showing a "New version available" toast.
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
