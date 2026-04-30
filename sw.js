const CACHE_NAME = 'streamdesk-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/clientes.html',
  '/config.html',
  '/avisos.html',
  '/financas.html',
  '/servidor.html',
  '/theme.css',
  '/favicon.png',
  '/logo.png',
  '/manifest.json'
];

// Instala e cacheia os assets principais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Remove caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first, fallback para cache
self.addEventListener('fetch', e => {
  // Ignora requisições não-GET e Firebase/APIs externas
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname !== location.hostname) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza cache com resposta fresca
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
