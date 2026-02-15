// Enhanced Service Worker for DooSplit PWA
const CACHE_NAME = 'doosplit-v3';
const STATIC_CACHE = 'doosplit-static-v3';
const API_CACHE = 'doosplit-api-v3';
const IMAGE_CACHE = 'doosplit-images-v3';

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only'
};

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.webp',
  '/favicon.ico'
];

// API routes that should be cached
const API_ROUTES = [
  '/api/dashboard/activity',
  '/api/friends',
  '/api/groups',
  '/api/user/profile'
];

// Routes that should not be cached
const NO_CACHE_ROUTES = [
  '/api/auth',
  '/api/notifications',
  '/api/test-services'
];

function isSupportedProtocol(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isSameOriginRequest(url) {
  return url.origin === self.location.origin;
}

function shouldCacheApiRoute(pathname) {
  return API_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function shouldHandleRequest(request) {
  try {
    const url = new URL(request.url);
    return isSupportedProtocol(url) && isSameOriginRequest(url);
  } catch {
    return false;
  }
}

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),

      // Create other caches
      caches.open(API_CACHE),
      caches.open(IMAGE_CACHE)
    ]).catch((error) => {
      console.log('Service Worker: Caching failed', error);
    })
  );

  // Force activation
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (![CACHE_NAME, STATIC_CACHE, API_CACHE, IMAGE_CACHE].includes(cacheName)) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),

      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch Interception for Caching Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip unsupported schemes and cross-origin requests
  if (!shouldHandleRequest(request)) return;

  const url = new URL(request.url);

  // Let the browser handle Next.js build assets so deploys don't serve stale chunks.
  if (url.pathname.startsWith('/_next/')) {
    return;
  }

  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
  } else if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) {
    event.respondWith(handleImageRequest(request));
  } else if (STATIC_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(handleStaticRequest(request));
  } else {
    event.respondWith(handleDefaultRequest(request));
  }
});

// Handle API requests (Network-First with cache fallback)
async function handleApiRequest(request) {
  const url = new URL(request.url);

  // Skip auth and notification routes from caching
  if (NO_CACHE_ROUTES.some(route => url.pathname.startsWith(route))) {
    return fetch(request);
  }

  try {
    // Always return the real network response so server errors are not masked
    const networkResponse = await fetch(request.clone());

    if (networkResponse.ok && shouldCacheApiRoute(url.pathname)) {
      // Cache successful responses
      try {
        const cache = await caches.open(API_CACHE);
        await cache.put(request, networkResponse.clone());
      } catch (cacheError) {
        console.warn('Service Worker: API cache write skipped', cacheError);
      }
    }

    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache');
  }

  // Fallback to cache
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // If no cache, return offline response
  return new Response(JSON.stringify({
    error: 'Offline',
    message: 'You are currently offline. This data may be outdated.'
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle static assets (Cache-First)
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, networkResponse.clone());
      } catch (cacheError) {
        console.warn('Service Worker: Static cache write skipped', cacheError);
      }
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Handle images (Cache-First with size limit)
async function handleImageRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Check image size (max 2MB for caching)
      const contentLength = networkResponse.headers.get('content-length');
      if (!contentLength || parseInt(contentLength) < 2 * 1024 * 1024) {
        try {
          const cache = await caches.open(IMAGE_CACHE);
          await cache.put(request, networkResponse.clone());
        } catch (cacheError) {
          console.warn('Service Worker: Image cache write skipped', cacheError);
        }
      }
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Handle other requests (Stale-While-Revalidate)
async function handleDefaultRequest(request) {
  const cachedResponse = await caches.match(request);
  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        try {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, networkResponse.clone());
        } catch (cacheError) {
          console.warn('Service Worker: Default cache write skipped', cacheError);
        }
      }
      return networkResponse;
    })
    .catch(() => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return new Response('Offline', { status: 503 });
    });

  if (cachedResponse) {
    // Revalidate in background while returning stale content immediately
    void fetchPromise;
    return cachedResponse;
  }

  return fetchPromise;
}

// Handle Push Notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received', event);

  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/logo.webp',
    badge: '/logo.webp',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.primaryKey || 1,
      url: data.url || '/dashboard'
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/logo.webp'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'DooSplit',
      options
    )
  );
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window/tab open with the target URL
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If no suitable window is found, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Enhanced Background Sync
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event);

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  } else if (event.tag === 'expense-sync') {
    event.waitUntil(syncExpenses());
  } else if (event.tag === 'settlement-sync') {
    event.waitUntil(syncSettlements());
  }
});

// Background sync implementation
async function doBackgroundSync() {
  console.log('Service Worker: Performing comprehensive background sync');

  try {
    // Sync all pending operations
    await Promise.all([
      syncExpenses(),
      syncSettlements(),
      syncOfflineData()
    ]);

    // Notify clients about sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETED',
        timestamp: Date.now()
      });
    });

  } catch (error) {
    console.error('Service Worker: Background sync failed', error);

    // Notify clients about sync failure
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_FAILED',
        error: error.message,
        timestamp: Date.now()
      });
    });
  }
}

async function syncExpenses() {
  console.log('Service Worker: Syncing expenses');
  // Implementation will be added when we have the sync service
}

async function syncSettlements() {
  console.log('Service Worker: Syncing settlements');
  // Implementation will be added when we have the sync service
}

async function syncOfflineData() {
  console.log('Service Worker: Syncing offline data');
  // Implementation will be added when we have the sync service
}

// Handle online/offline events
self.addEventListener('online', () => {
  console.log('Service Worker: Back online, triggering sync');

  // Trigger background sync when coming online
  self.registration.sync.register('background-sync');
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Gone offline');

  // Notify clients about offline status
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_STATUS',
        online: false,
        timestamp: Date.now()
      });
    });
  });
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const { type } = payload;
  if (typeof type !== 'string') {
    return;
  }

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_CACHE_STATUS':
      // Respond with cache information
      Promise.all([
        caches.keys(),
        navigator.storage?.estimate?.() || { quota: 0, usage: 0 }
      ]).then(([cacheNames, storage]) => {
        const port = event.ports && event.ports[0];
        if (port) {
          port.postMessage({
            cacheNames,
            storageEstimate: storage
          });
        }
      });
      break;

    default:
      // Ignore unknown message types from browser internals/extensions.
      break;
  }
});
