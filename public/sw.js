const CACHE_NAME = 'spacefood-v6';
const STATIC_CACHE = 'spacefood-static-v6';

// Static assets to precache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

// ── Install: precache app shell ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v6 with precache...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.log('[SW] Precache partial failure (non-blocking):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v6.');
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== STATIC_CACHE)
          .map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch strategies ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER intercept cross-origin requests (Supabase API, CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // NEVER intercept non-GET requests
  if (event.request.method !== 'GET') return;

  // Strategy selection based on asset type
  const pathname = url.pathname;

  // 1. Static assets (JS, CSS, fonts, images) → Cache-first with network fallback
  if (isStaticAsset(pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 2. Navigation requests (HTML) → Network-first with cache fallback (offline shell)
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  // 3. Everything else → Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// ── Helper: detect static assets by extension ──
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|webmanifest)(\?.*)?$/.test(pathname)
    || pathname.startsWith('/assets/');  // Vite hashed assets
}

// ── Cache-first: serve from cache, fall back to network (then cache the response) ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Network error', { status: 503 });
  }
}

// ── Network-first for navigation: try network, fall back to cached shell ──
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    // Cache the latest HTML shell
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('/', response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match('/');
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// ── Stale-while-revalidate: serve cache immediately, update in background ──
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // If we have a cached version, return it immediately
  if (cached) {
    // Fire-and-forget the revalidation
    fetchPromise;
    return cached;
  }

  // No cache — must wait for network
  const response = await fetchPromise;
  if (response) return response;
  return new Response('Network error', { status: 503 });
}

// --- Push Notifications ---
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  let data = {
    title: 'SpaceFood',
    body: 'Voce tem uma nova notificacao!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        data: payload.data || {},
        tag: payload.tag || undefined,
      };
    } catch (e) {
      console.log('[SW] Push data parse error, using text:', e);
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    requireInteraction: false,
    silent: false,
  };

  const showNotifPromise = self.registration.showNotification(data.title, options);

  const forwardPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_RECEIVED',
        payload: {
          title: data.title,
          body: data.body,
          icon: data.icon,
          tag: data.tag,
          data: data.data,
        },
      });
    });
  });

  event.waitUntil(Promise.all([showNotifPromise, forwardPromise]));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed');
});
