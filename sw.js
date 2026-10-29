// Offline support. Every app file is downloaded once when this version installs, and then
// served only from that version's cache, so old and new files can never mix.
// Bump VERSION on every deploy (python tools/bump_version.py), or phones keep the old app.

const VERSION = 'v20261029-1523';
const CACHE = `bowling-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'fonts/inter-latin.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/changelog.js',
  'js/charts.js',
  'js/device.js',
  'js/lane.js',
  'js/lanemap.js',
  'js/normalize.js',
  'js/pins.js',
  'js/scoreboard.js',
  'js/scoring.js',
  'js/stats.js',
  'js/storage.js',
  'js/terms.js',
  'js/ui.js',
  'js/util.js',
  'js/version.js',
  'js/views/changelog.js',
  'js/views/game.js',
  'js/views/help.js',
  'js/views/home.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/summary.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bowling-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(req, { ignoreSearch: true }))
      .then((hit) => hit || fetch(req)),
  );
});
