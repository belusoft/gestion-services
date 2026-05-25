/**
 * SERVICE WORKER - Progressive Web App
 *
 * Fonctionnalités:
 * - Caching des assets
 * - Support offline
 * - Synchronisation en arrière-plan
 * - Notifications push
 */

const CACHE_NAME = 'services-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/sw.js',
    '/manifest.json',
];

// Installation du Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interception des requêtes (Network-first pour API, Cache-first pour assets)
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requêtes non-GET
    if (request.method !== 'GET') {
        return;
    }

    // Pour les assets statiques: cache-first
    if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(
            caches.match(request)
                .then(response => response || fetch(request))
                .catch(() => new Response('Offline'))
        );
        return;
    }

    // Pour les API: network-first with fallback to cache
    if (url.hostname.includes('script.google.com') || url.hostname.includes('sheets.googleapis.com')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');

                    // Cache la réponse
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });

                    return response;
                })
                .catch(() => {
                    // En cas d'erreur, utiliser la cache
                    return caches.match(request)
                        .then(response => response || new Response(
                            JSON.stringify({ status: 'offline', message: 'Mode hors ligne' }),
                            { headers: { 'Content-Type': 'application/json' } }
                        ));
                })
        );
        return;
    }

    // Par défaut: cache-first
    event.respondWith(
        caches.match(request)
            .then(response => response || fetch(request))
            .catch(() => new Response('Offline'))
    );
});

// Synchronisation en arrière-plan
self.addEventListener('sync', event => {
    if (event.tag === 'sync-availabilities') {
        event.waitUntil(syncAvailabilities());
    }
});

async function syncAvailabilities() {
    try {
        const response = await fetch('/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
            console.log('Synchronisation réussie');
            // Notifier les clients
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SYNC_SUCCESS',
                        message: 'Vos modifications ont été synchronisées',
                    });
                });
            });
        }
    } catch (error) {
        console.error('Erreur sync:', error);
    }
}

// Notifications push
self.addEventListener('push', event => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'service-notification',
        requireInteraction: true,
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Clic sur notification
self.addEventListener('notificationclick', event => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            // Si la fenêtre existe, la focus
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Sinon, ouvrir une nouvelle fenêtre
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
