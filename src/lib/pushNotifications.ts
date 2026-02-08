// Push Notification Utilities

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: any;
}

// Check if push notifications are supported
export const isPushNotificationSupported = (): boolean => {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications');
  }

  const permission = await Notification.requestPermission();
  return permission;
};

// Register service worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  } else {
    throw new Error('Service Worker not supported');
  }
};

// Subscribe to push notifications
export const subscribeToPushNotifications = async (
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscriptionData> => {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as ArrayBuffer
    });

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
      }
    };

    return subscriptionData;
  } catch (error) {
    console.error('Push subscription failed:', error);
    throw error;
  }
};

// Unsubscribe from push notifications
export const unsubscribeFromPushNotifications = async (
  registration: ServiceWorkerRegistration
): Promise<void> => {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('Successfully unsubscribed from push notifications');
    }
  } catch (error) {
    console.error('Unsubscribe failed:', error);
    throw error;
  }
};

// Get current push subscription
export const getCurrentPushSubscription = async (
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> => {
  try {
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Get subscription failed:', error);
    return null;
  }
};

// Send subscription to server
export const sendSubscriptionToServer = async (
  subscriptionData: PushSubscriptionData,
  userId: string
): Promise<void> => {
  try {
    const response = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscriptionData,
        userId
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send subscription to server');
    }

    console.log('Subscription sent to server successfully');
  } catch (error) {
    console.error('Send subscription to server failed:', error);
    throw error;
  }
};

// Utility function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Test notification (for development)
export const sendTestNotification = async (): Promise<void> => {
  if (Notification.permission === 'granted') {
    new Notification('DooSplit Test', {
      body: 'This is a test notification',
      icon: '/logo.webp',
      badge: '/logo.webp'
    });
  } else {
    console.warn('Notification permission not granted');
  }
};