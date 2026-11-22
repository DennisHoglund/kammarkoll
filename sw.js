/* Service worker: appfiler och data nätet först (så telefonen inte fastnar på gammal version), cache som reserv. */
const VERSION = 'kammarkoll-v3';
const FILER = [
  './', 'index.html', 'styles.css', 'app.js', 'data.js', 'beslut.js', 'kammaren.js', 'kammarsal.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILER)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nycklar => Promise.all(nycklar.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/rapport/')) return;
  e.respondWith(
    fetch(e.request)
      .then(svar => {
        if (svar.ok) {
          const kopia = svar.clone();
          caches.open(VERSION).then(c => c.put(e.request, kopia));
        }
        return svar;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
