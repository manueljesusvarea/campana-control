// Service worker de CAMPAÑA CONTROL: guarda la app para usarla sin conexión.
// VERSION la escribe construir_www.py con una huella del contenido de APP: si cambia cualquier archivo
// publicado, cambia este archivo y los dispositivos descargan la versión nueva. No la edites a mano.
// Si un archivo de APP no existe, el service worker no se instala: construir_www.py lo comprueba.
const PREFIJO = "campana-control:" + self.registration.scope + ":";
const VERSION = PREFIJO + "2.3.0-f2bcc8fabf";
const APP = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png",
  // Librerías de PDF y Excel (antes desde cdnjs)
  "./vendor/jspdf/2.5.1/jspdf.umd.min.js", "./vendor/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js", "./vendor/xlsx/0.18.5/xlsx.full.min.js",
  // Fuentes (antes desde Google Fonts)
  "./fonts/fonts.css",
  "./fonts/barlow-condensed-latin-600-normal.woff2", "./fonts/barlow-condensed-latin-700-normal.woff2",
  "./fonts/barlow-condensed-latin-ext-600-normal.woff2", "./fonts/barlow-condensed-latin-ext-700-normal.woff2",
  "./fonts/source-sans-3-latin-400-normal.woff2", "./fonts/source-sans-3-latin-600-normal.woff2", "./fonts/source-sans-3-latin-700-normal.woff2",
  "./fonts/source-sans-3-latin-ext-400-normal.woff2", "./fonts/source-sans-3-latin-ext-600-normal.woff2", "./fonts/source-sans-3-latin-ext-700-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    // Versiones anteriores de esta app: las de este alcance y las de antes de la 2.2.0, que se llamaban «cc-2.0.1»…
    // (solo ese formato exacto, para no tocar cachés de otras apps del mismo dominio, como en GitHub Pages)
    await Promise.all(nombres.filter(n => (n.startsWith(PREFIJO) && n !== VERSION) || /^cc-\d+\.\d+\.\d+$/.test(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Solo atendemos recursos incluidos al instalar esta versión. Cada instalación
// lee su propia caché, incluso si hay otras aplicaciones en el mismo dominio.
const recursos = new Set(APP.map(r => new URL(r, self.registration.scope).href));
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  const ruta = url.origin + url.pathname;
  const esInicio = req.mode === "navigate" && (ruta === self.registration.scope ||
    ruta === new URL("index.html", self.registration.scope).href);
  const clave = esInicio ? new URL("index.html", self.registration.scope).href : url.href;
  if (!recursos.has(clave)) return;
  e.respondWith(caches.open(VERSION).then(async cache => (await cache.match(clave)) || fetch(req)));
});
