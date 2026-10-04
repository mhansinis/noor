// Service worker: makes the app work with no network after the first visit.
//
// - App files: network first (so updates show up), cached copy when offline.
// - Transformers.js library from the CDN: cached once, then served from cache.
// - The model and its WASM runtime are cached by Transformers.js itself
//   (in "transformers-cache"), so they are not cached here a second time.
const APP_CACHE = 'farmvisits-app-v8';
const LIB_CACHE = 'farmvisits-lib-v1';
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const NETWORK_TIMEOUT_MS = 3000;

const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'js/storage.js',
  'js/ai.js',
  'js/embed-worker.js',
  'js/profile.js',
  'js/privacy.js',
  'js/paste-parser.js',
  'js/vague.js',
  'js/language.js',
  'js/example-reviews.js',
  'js/feedback.js',
  'js/themes.js',
  'js/analysis.js',
  'js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(APP_CACHE)).addAll(APP_FILES);
      await (await caches.open(LIB_CACHE)).add(new Request(LIB_URL, { mode: 'cors' }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [APP_CACHE, LIB_CACHE];
      for (const name of await caches.keys()) {
        if (name.startsWith('farmvisits-') && !keep.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.url === LIB_URL) {
    event.respondWith(cacheFirst(req, LIB_CACHE));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, APP_CACHE));
  }
  // Everything else (model files) goes straight to Transformers.js's own cache.
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error('Offline and not cached');
  }
}
