/**
 * ─────────────────────────────────────────────────────────────
 * ZenGastos Pro — Service Worker
 * Versión de caché: zengastos-v2
 * 
 * Funcionalidades:
 * - Pre-cacheo de archivos del shell (index.html, manifest.json, icon.png).
 * - Activación inmediata con skipWaiting() y clients.claim().
 * - Limpieza automática de versiones anteriores de caché.
 * - Estrategia Cache-First para recursos del mismo origen.
 * - Estrategia Stale-While-Revalidate para CDNs y recursos externos.
 * - Manejo resiliente de fallos de red con recuperación desde caché.
 * ─────────────────────────────────────────────────────────────
 */

const CACHE_NAME = 'zengastos-v2';

// Archivos esenciales del App Shell a pre-cachear durante la instalación
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// ── 1. Evento Install: Pre-cachear el App Shell y activar de inmediato ──
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker versión:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-cacheando archivos del shell...');
        return cache.addAll(SHELL_FILES);
      })
      .then(() => {
        console.log('[SW] Shell cacheado con éxito. Activando inmediatamente (skipWaiting)...');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Error durante el pre-cacheo en install:', error);
      })
  );
});

// ── 2. Evento Activate: Eliminar cachés antiguas y tomar control ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando nueva versión del Service Worker:', CACHE_NAME);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Eliminando caché obsoleta:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Reclamando clientes (clients.claim)...');
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[SW] Error durante la activación:', error);
      })
  );
});

// ── 3. Evento Fetch: Enrutamiento según origen y estrategias de caché ──
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorar peticiones que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignorar protocolos no soportados (ej. extensiones de navegador, blob, data)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Comprobar si la petición pertenece al mismo origen
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Origen local: Estrategia Cache-First (optimizado para modo offline)
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Recursos externos / CDNs: Estrategia Stale-While-Revalidate
    event.respondWith(staleWhileRevalidateStrategy(request));
  }
});

// ── 4. Estrategias de Almacenamiento en Caché ──

/**
 * Estrategia Cache-First:
 * Busca primero en caché. Si el recurso no existe, lo solicita a la red,
 * lo guarda en la caché para usos posteriores y devuelve la respuesta.
 * Si la red falla, intenta recuperar un fallback en caché o una respuesta de contingencia.
 */
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Si no está en caché, intentar obtener de la red
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] Error en Cache-First al consultar la red para:', request.url, error);

    // Fallback: Si la red falla, verificar nuevamente si existe en caché
    const fallbackResponse = await caches.match(request);
    if (fallbackResponse) {
      return fallbackResponse;
    }

    // Para peticiones de navegación HTML, servir index.html del shell si está disponible
    if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
      const htmlFallback = await caches.match('./index.html') || await caches.match('index.html');
      if (htmlFallback) {
        return htmlFallback;
      }
    }

    // Respuesta de contingencia amigable sin conexión
    return new Response(
      `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZenGastos Pro — Sin Conexión</title>
  <style>
    body {
      background: #09090d;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: rgba(22, 22, 29, 0.8);
      border: 1px solid #26262f;
      border-radius: 16px;
      padding: 32px 24px;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    h1 {
      font-size: 1.5rem;
      margin: 0 0 12px;
      font-weight: 600;
    }
    p {
      color: #73738c;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 20px;
    }
    button {
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-weight: 500;
      cursor: pointer;
      font-size: 0.9rem;
    }
    button:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>ZenGastos Pro</h1>
    <p>No se pudo conectar con el servidor. Tus datos locales siguen a salvo en este dispositivo.</p>
    <button onclick="window.location.reload()">Reintentar</button>
  </div>
</body>
</html>`,
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

/**
 * Estrategia Stale-While-Revalidate:
 * Sirve inmediatamente la versión guardada en caché si existe, mientras solicita en
 * segundo plano una copia actualizada a la red para refrescar la caché.
 * Si no está en caché, espera la respuesta de la red.
 * Si la red falla, se recupera elegantemente usando la caché existente.
 */
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      // Admitir respuestas exitosas estándar (200 OK) y opacas (de CDNs sin CORS)
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(async (error) => {
      console.warn('[SW] Error al actualizar recurso externo en red:', request.url, error);
      // Si la red falla, intentar retornar la versión en caché
      const fallback = await cache.match(request);
      if (fallback) {
        return fallback;
      }
      return null;
    });

  // Si tenemos versión en caché, responder de inmediato con ella; si no, esperar la red
  const finalResponse = cachedResponse || (await fetchPromise);

  if (finalResponse) {
    return finalResponse;
  }

  // Fallback si no hay copia en caché ni respuesta de red
  return new Response('Recurso no disponible sin conexión', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// ── 5. Escucha de Mensajes para forzar actualización ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Recibida orden SKIP_WAITING. Forzando activación...');
    self.skipWaiting();
  }
});
