// Service Worker pour maintenir l'enregistrement GPS en arrière-plan
const CACHE_NAME = 'suivi3d-v1';

// Installation
self.addEventListener('install', (event) => {
  console.log('Service Worker installé');
  self.skipWaiting();
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('Service Worker activé');
  event.waitUntil(clients.claim());
});

// Gestion des messages depuis l'application principale
self.addEventListener('message', (event) => {
  if (event.data.type === 'START_GPS_TRACKING') {
    console.log('Démarrage suivi GPS en arrière-plan');
    // Le suivi GPS réel est géré par l'application principale
    // Le Service Worker maintient juste la connexion active
  }
  
  if (event.data.type === 'STOP_GPS_TRACKING') {
    console.log('Arrêt suivi GPS en arrière-plan');
  }
  
  if (event.data.type === 'KEEP_ALIVE') {
    // Ping pour maintenir le Service Worker actif
    event.waitUntil(
      clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'ALIVE',
            timestamp: Date.now()
          });
        });
      })
    );
  }
});

// Intercepter les requêtes pour garder le SW actif
self.addEventListener('fetch', (event) => {
  // Ne pas intercepter, juste maintenir le SW actif
  event.respondWith(fetch(event.request));
});

// Notification périodique pour maintenir l'activité
let keepAliveInterval;

self.addEventListener('activate', (event) => {
  // Ping toutes les 20 secondes pour rester actif
  keepAliveInterval = setInterval(() => {
    clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PING',
          timestamp: Date.now()
        });
      });
    });
  }, 20000);
});
