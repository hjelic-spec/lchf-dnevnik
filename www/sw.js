// Offline cache aplikacijske ljuske. Povećaj VERSION pri svakoj objavi.
const VERSION = 'porki-v15';
const ASSETS = ['./', './index.html', './app.js', './foods.js', './vendor/zxing.min.js', './styles.css', './capacitor.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable.png', './privacy.html'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stale-while-revalidate: odmah iz cachea, u pozadini osvježi
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(res => { if (res.ok) cache.put(req.mode === 'navigate' ? './' : req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
