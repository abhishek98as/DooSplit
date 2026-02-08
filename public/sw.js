// Enhanced Service Worker for DooSplit PWA
const CACHE_NAME = 'doosplit-v2';
const STATIC_CACHE = 'doosplit-static-v2';
const API_CACHE = 'doosplit-api-v2';
const IMAGE_CACHE = 'doosplit-images-v2';

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
  '/dashboard',
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
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

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
    // Try network first
    const networkResponse = await fetch(request.clone());

    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());

      return networkResponse;
    }
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
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
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
        const cache = await caches.open(IMAGE_CACHE);
        cache.put(request, networkResponse.clone());
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
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  });

  return cachedResponse || fetchPromise;
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
  const { type, data } = event.data;

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
        event.ports[0].postMessage({
          cacheNames,
          storageEstimate: storage
        });
      });
      break;

    default:
      console.log('Service Worker: Unknown message type', type);
  }
});