const CACHE_NAME = 'rec-lab-v1';
const ASSETS = [
  './index.html',
  './extensionpcb.js',
  './iamanos.js',
  './senialestransito.js',
  './vozatexto.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});