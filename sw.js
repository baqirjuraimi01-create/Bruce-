/* Service worker: cache the shell so the app opens instantly and works
   offline. Food lookups still need a connection, but the built-in food
   table, all logging and the whole program work without one. */

const CACHE = 'bruce-v1';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './js/data.js', './js/merge.js', './js/store.js', './js/nutrition.js', './js/scanner.js',
  './js/progression.js', './js/volume.js', './js/eatout.js', './js/sync.js', './js/ui.js', './js/views.home.js', './js/views.food.js', './js/views.train.js',
  './js/views.cardio.js', './js/views.progress.js', './js/views.plan.js',
  './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  // Never cache the food APIs — stale macros would be worse than none.
  if(url.origin !== location.origin) return;

  // Network first, so a redeploy is picked up; fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
