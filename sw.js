// ============================================================
// StreamDesk SW — Cache Inteligente v2.0
// ============================================================

const CACHE_VERSION = 'v2';
const CACHE_STATIC  = `sd-static-${CACHE_VERSION}`;
const CACHE_PAGES   = `sd-pages-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `sd-dynamic-${CACHE_VERSION}`;

// Assets estáticos — nunca mudam sem mudar o nome
const STATIC_ASSETS = [
  '/theme.css',
  '/servidores.css',
  '/favicon.png',
  '/logo.png',
  '/icon192.png',
  '/icon512.png',
  '/manifest.json'
];

// Páginas principais do app
const PAGE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/clientes.html',
  '/config.html',
  '/avisos.html',
  '/financas.html',
  '/servidor.html'
];

// JS do app — atualiza em background
const JS_ASSETS = [
  '/sd-core.js',
  '/firebase-service.js'
];

// ============================================================
// INSTALL — pré-cacheia tudo de forma segura
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(CACHE_PAGES).then(cache => cache.addAll(PAGE_ASSETS)),
      caches.open(CACHE_DYNAMIC).then(cache => cache.addAll(JS_ASSETS))
    ])
    .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — limpa caches de versões antigas
// ============================================================
self.addEventListener('activate', event => {
  const validCaches = [CACHE_STATIC, CACHE_PAGES, CACHE_DYNAMIC];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !validCaches.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — estratégias por tipo de recurso
// ============================================================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora Firebase, APIs externas e extensões do Chrome
  if (url.hostname !== location.hostname) return;
  if (url.protocol === 'chrome-extension:') return;

  const path = url.pathname;

  // 1️⃣ CACHE FIRST → assets estáticos (CSS, imagens)
  if (isStaticAsset(path)) {
    event.respondWith(cacheFirst(event.request, CACHE_STATIC));
    return;
  }

  // 2️⃣ STALE WHILE REVALIDATE → arquivos JS
  if (path.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_DYNAMIC));
    return;
  }

  // 3️⃣ NETWORK FIRST → páginas HTML (com fallback offline)
  if (isPage(path)) {
    event.respondWith(networkFirst(event.request, CACHE_PAGES));
    return;
  }
});

// ============================================================
// ESTRATÉGIAS
// ============================================================

// Cache First: retorna do cache; se não tiver, busca na rede e armazena
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// Network First: tenta rede; se falhar, retorna cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineFallback();
  }
}

// Stale While Revalidate: retorna cache imediatamente, atualiza em background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Fallback offline genérico
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>StreamDesk — Offline</title>
    <style>
      body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0;text-align:center;gap:16px}
      h1{font-size:1.5rem;margin:0}p{color:#94a3b8;margin:0}
      button{margin-top:8px;padding:10px 24px;background:#6366f1;color:#fff;border:none;
      border-radius:8px;cursor:pointer;font-size:1rem}
    </style></head>
    <body>
      <h1>📡 Sem conexão</h1>
      <p>Verifique sua internet e tente novamente.</p>
      <button onclick="location.reload()">Tentar novamente</button>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ============================================================
// NOTIFICAÇÕES PUSH
// ============================================================

// Recebe mensagem push do servidor
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'StreamDesk', body: event.data.text() }; }

  const title   = data.title || 'StreamDesk';
  const options = {
    body:    data.body  || 'Você tem uma nova notificação.',
    icon:    '/icon192.png',
    badge:   '/favicon.png',
    tag:     data.tag   || 'sd-notif',
    data:    { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Usuário toca na notificação → abre a URL correta
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ============================================================
// HELPERS
// ============================================================
function isStaticAsset(path) {
  return path.endsWith('.css') ||
         path.endsWith('.png') ||
         path.endsWith('.jpg') ||
         path.endsWith('.svg') ||
         path.endsWith('.ico') ||
         path.endsWith('.webp') ||
         path === '/manifest.json';
}

function isPage(path) {
  return path === '/' ||
         path.endsWith('.html');
}
