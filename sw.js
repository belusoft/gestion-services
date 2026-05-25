/**
 * SERVICE WORKER — PWA Sono & Accueil
 * Stratégie : Cache-first pour les assets, Network-first pour l'API
 */

const CACHE_VERSION = 'sono-accueil-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
];

// ── Installation ──────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache install error:', err))
  );
});

// ── Activation ────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ignorer les extensions Chrome / browser-internal
  if (!url.protocol.startsWith('http')) return;

  // API Google Apps Script → Network-first, fallback cache
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Ne mettre en cache que les réponses valides
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || new Response(
              JSON.stringify({ ok: false, error: 'Mode hors ligne — données non disponibles' }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    );
    return;
  }

  // Assets statiques → Cache-first
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // Mettre en cache si valide
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return response;
        });
      })
      .catch(() =>
        // Fallback offline : renvoyer index.html pour la navigation
        caches.match('./index.html')
      )
  );
});

// ── Push Notifications ───────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Sono & Accueil', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Sono & Accueil', {
      body:  data.body  || '',
      icon:  data.icon  || './icon-192.png',
      badge: './icon-192.png',
      tag:   'sono-notif',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
