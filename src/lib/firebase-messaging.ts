"use client";

import { app } from "@/lib/firebase";

let messagingInstance: any = null;
let messagingReady = false;
let foregroundListenerBound = false;

function getVapidKey(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || "";
}

async function isMessagingAvailable(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const { isSupported } = await import("firebase/messaging");
    return await isSupported();
  } catch {
    return false;
  }
}

async function ensureMessaging() {
  if (messagingReady) {
    return messagingInstance;
  }
  messagingReady = true;

  const supported = await isMessagingAvailable();
  if (!supported) {
    return null;
  }

  try {
    const { getMessaging } = await import("firebase/messaging");
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.error("Failed to initialize Firebase Messaging:", error);
    return null;
  }
}

async function upsertFcmTokenOnServer(token: string, userId?: string): Promise<void> {
  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      fcmToken: token,
      userId: userId || null,
    }),
  });
}

export async function syncFcmTokenWithServer(userId?: string): Promise<string | null> {
  const vapidKey = getVapidKey();
  if (!vapidKey) {
    return null;
  }

  if (typeof window === "undefined" || Notification.permission !== "granted") {
    return null;
  }

  const messaging = await ensureMessaging();
  if (!messaging) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return null;
    }

    await upsertFcmTokenOnServer(token, userId);
    return token;
  } catch (error) {
    console.error("FCM token sync failed:", error);
    return null;
  }
}

export async function requestPushPermissionAndSync(
  userId?: string
): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await syncFcmTokenWithServer(userId);
  }
  return permission;
}

export async function unregisterFcmToken(): Promise<void> {
  const messaging = await ensureMessaging();
  if (!messaging) {
    return;
  }

  try {
    const { getToken, deleteToken } = await import("firebase/messaging");
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = getVapidKey();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fcmToken: token }),
      }).catch(() => undefined);
    }

    await deleteToken(messaging).catch(() => undefined);
  } catch (error) {
    console.error("Failed to unregister FCM token:", error);
  }
}

export async function bindForegroundMessagingListener(
  onPayload?: (payload: any) => void
): Promise<void> {
  if (foregroundListenerBound) {
    return;
  }
  foregroundListenerBound = true;

  const messaging = await ensureMessaging();
  if (!messaging) {
    return;
  }

  try {
    const { onMessage } = await import("firebase/messaging");
    onMessage(messaging, (payload) => {
      onPayload?.(payload);
    });
  } catch (error) {
    console.error("Failed to bind foreground FCM listener:", error);
  }
}
