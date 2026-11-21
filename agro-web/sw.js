// ══ UNANCHA Agro — service worker (app de campo sin internet) ═════════════════════
//
// Qué hace:
//  · Guarda la app (HTML, logo y librerías) para que abra sin señal.
//  · Las consultas GET /api/agro/* van primero a la red; si no hay señal, responde
//    con la última copia guardada (productores, parcelas, acopio…). La copia se
//    guarda POR ORGANIZACIÓN (cabecera X-Agro-Org) para no mezclar datos.
//  · Lo que se REGISTRA sin señal no pasa por aquí: lo encola la página
//    (localStorage) y lo envía al volver la conexión.
//  · Al cerrar sesión la página pide borrar la copia de datos ('limpiar').
//
// Subir VERSION cuando cambie la lista de archivos de la app.
const VERSION = 'agro-v3';
const CACHE_APP = `${VERSION}-app`;
const CACHE_API = 'agro-api';

const APP = [
  '/',
  '/logo.png?v=2',
  '/manifest.webmanifest?v=2',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

self.addEventListener('install', (e) => {
  // Las librerías de otros dominios llegan "opacas" (sin CORS): cache.add las
  // rechaza, así que se piden y se guardan a mano.
  e.waitUntil(caches.open(CACHE_APP).then((c) => Promise.all(APP.map(async (u) => {
    try {
      const externa = u.startsWith('http');
      const r = await fetch(u, externa ? { mode: 'no-cors', redirect: 'follow' } : { cache: 'reload' });
      if (r.ok || r.type === 'opaque') await c.put(u, r);
    } catch { /* sin señal al instalar: se guardará en la próxima visita */ }
  }))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== CACHE_APP && k !== CACHE_API).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'limpiar') e.waitUntil(caches.delete(CACHE_API));
});

// Clave de la copia: la URL + la organización activa (no la cabecera Authorization).
const claveApi = (req) => `${req.url}#org=${req.headers.get('X-Agro-Org') || ''}`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // los registros los maneja la página
  const url = new URL(req.url);

  // Datos de la cooperativa: red primero, copia si no hay señal.
  if (url.origin === location.origin && url.pathname.startsWith('/api/agro/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_API);
      try {
        const r = await fetch(req);
        if (r.ok) cache.put(claveApi(req), r.clone());
        return r;
      } catch {
        const copia = await cache.match(claveApi(req));
        if (copia) {
          const h = new Headers(copia.headers);
          h.set('X-Agro-Sin-Conexion', '1');
          return new Response(await copia.blob(), { status: 200, headers: h });
        }
        return new Response(JSON.stringify({ error: 'Sin conexión y sin una copia guardada de esta pantalla. Ábrela una vez con señal.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }
  // El resto de la API (sesión, pasaportes públicos…) no se guarda.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Páginas de la app: red primero, la app guardada si no hay señal.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok && url.pathname === '/') caches.open(CACHE_APP).then((c) => c.put('/', r.clone()));
      return r;
    }).catch(() => caches.match('/')));
    return;
  }

  // Archivos (logo, librerías): la copia al instante y se actualiza por detrás.
  e.respondWith(caches.open(CACHE_APP).then(async (c) => {
    const copia = await c.match(req);
    const red = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => copia);
    return copia || red;
  }));
});
