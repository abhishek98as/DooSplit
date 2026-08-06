"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import getOfflineStore from '@/lib/offline-store';
import getSyncService, { SyncResult } from '@/lib/sync-service';
import { useSession } from "@/lib/auth/react-session";
import {
  bindForegroundMessagingListener,
  requestPushPermissionAndSync,
  syncFcmTokenWithServer,
} from "@/lib/firebase-messaging";

type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PWAContextType {
  // Network status
  isOnline: boolean;
  isOffline: boolean;

  // Sync status
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingSyncItems: number;

  // Sync actions
  syncNow: () => Promise<SyncResult>;
  clearCache: () => Promise<void>;

  // Install prompt
  canInstall: boolean;
  installPrompt: () => Promise<void>;
  isStandalone: boolean;
  installPlatform: InstallPlatform;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  canManualInstall: boolean;

  // Service worker
  serviceWorkerRegistered: boolean;
  serviceWorkerUpdated: boolean;
  updateServiceWorker: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

interface PWAProviderProps {
  children: ReactNode;
}

function detectInstallPlatform(userAgent: string): InstallPlatform {
  const normalized = userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(normalized)) {
    return "ios";
  }

  if (/android/.test(normalized)) {
    return "android";
  }

  if (/macintosh|mac os x|windows|linux/.test(normalized)) {
    return "desktop";
  }

  return "unknown";
}

function detectSafariBrowser(userAgent: string): boolean {
  const normalized = userAgent.toLowerCase();
  const isSafariEngine = normalized.includes("safari");
  const isExcludedBrowser =
    normalized.includes("chrome") ||
    normalized.includes("crios") ||
    normalized.includes("fxios") ||
    normalized.includes("edg") ||
    normalized.includes("opr") ||
    normalized.includes("android");

  return isSafariEngine && !isExcludedBrowser;
}

function detectStandaloneMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const isDisplayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const isIosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return Boolean(isDisplayModeStandalone || isIosStandalone);
}

export function PWAProvider({ children }: PWAProviderProps) {
  const { data: session, status } = useSession();

  // Network status
  const [isOnline, setIsOnline] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Sync status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingSyncItems, setPendingSyncItems] = useState(0);

  // PWA install
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>("unknown");
  const [isSafari, setIsSafari] = useState(false);

  // Service worker
  const [serviceWorkerRegistered, setServiceWorkerRegistered] = useState(false);
  const [serviceWorkerUpdated, setServiceWorkerUpdated] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // Get services
  const offlineStore = getOfflineStore();
  const syncService = getSyncService();

  // Initialize PWA functionality
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    let cleanupPWA: (() => void) | undefined;

    setIsOnline(navigator.onLine);
    setIsOffline(!navigator.onLine);
    syncInstallEnvironment();
    void initializePWA().then((cleanupFn) => {
      cleanupPWA = cleanupFn;
    });
    const cleanup = initializeNetworkListeners();
    initializeSyncStatus();

    return () => {
      cleanupPWA?.();
      cleanup?.();
    };
  }, []);

  // ── Auto-sync every 5 minutes when authenticated and online ───────────────
  useEffect(() => {
    if (status !== "authenticated") return;
    const interval = setInterval(() => {
      if (navigator.onLine) {
        void syncNow();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    void bindForegroundMessagingListener((payload) => {
      const notification = payload?.notification || {};
      const title = String(notification.title || payload?.data?.title || "DooSplit");
      const body = String(notification.body || payload?.data?.body || "");
      const url = String(payload?.data?.url || "/dashboard");

      window.dispatchEvent(new Event("doosplit:notifications-refresh"));

      if (Notification.permission === "granted" && body) {
        try {
          const n = new Notification(title, {
            body,
            icon: "/api/pwa/icon?size=192",
            data: { url },
          });
          n.onclick = () => {
            window.focus();
            if (url.startsWith("/")) {
              window.location.href = url;
            }
            n.close();
          };
        } catch {
          // Ignore Notification constructor failures in unsupported contexts
        }
      }
    });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const userId = session.user.id;
    const promptKey = `doosplit_push_prompted_${userId}`;

    const ensurePush = async () => {
      // Already granted → keep token fresh
      if (Notification.permission === "granted") {
        await syncFcmTokenWithServer(userId);
        return;
      }

      // Denied → cannot force; user must re-enable in browser settings
      if (Notification.permission === "denied") {
        return;
      }

      // Default → force permission prompt once per user (browser may still block repeats)
      if (localStorage.getItem(promptKey) === "1") {
        return;
      }

      // Wait briefly so the page is interactive (better prompt acceptance)
      await new Promise((r) => setTimeout(r, 1500));
      localStorage.setItem(promptKey, "1");
      await requestPushPermissionAndSync(userId);
    };

    void ensurePush();
  }, [status, session?.user?.id]);

  const syncInstallEnvironment = () => {
    const userAgent = window.navigator.userAgent;
    setInstallPlatform(detectInstallPlatform(userAgent));
    setIsSafari(detectSafariBrowser(userAgent));
    setIsStandalone(detectStandaloneMode());
  };

  const initializePWA = async () => {
    // Register service worker
    const cleanupServiceWorker = await registerServiceWorker();

    // Listen for install prompt
    const cleanupInstallPrompt = listenForInstallPrompt();

    // Listen for sync events
    const cleanupSyncEvents = listenForSyncEvents();

    const cleanupDisplayMode = listenForDisplayModeChanges();

    return () => {
      cleanupServiceWorker?.();
      cleanupInstallPrompt?.();
      cleanupSyncEvents?.();
      cleanupDisplayMode?.();
    };
  };

  const initializeNetworkListeners = () => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsOffline(false);
      console.log('🌐 Back online - triggering sync');
      // Auto-sync when coming online
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsOffline(true);
      console.log('📶 Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Store cleanup functions
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  };

  const initializeSyncStatus = async () => {
    try {
      const status = await syncService.getSyncStatus();
      setIsSyncing(status.isSyncing);
      setLastSyncTime(status.lastSync);
      setPendingSyncItems(status.pendingItems);
    } catch (error) {
      console.error('Failed to get sync status:', error);
    }
  };

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        setServiceWorkerRegistered(true);
        syncInstallEnvironment();

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            setWaitingWorker(newWorker);

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setServiceWorkerUpdated(true);
              }
            });
          }
        });

        // Check for updates periodically
        const updateInterval = window.setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour

        console.log('✅ Service Worker registered');

        return () => {
          window.clearInterval(updateInterval);
        };

      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  };

  const listenForInstallPrompt = () => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const e = event as BeforeInstallPromptEvent;

      // Store the event for later use (custom install button).
      // Do NOT preventDefault() — let Chrome show its native mini-infobar.
      // Calling preventDefault() without later calling prompt() triggers:
      //   "Banner not shown: beforeinstallpromptevent.preventDefault() called."
      setDeferredPrompt(e);
      setCanInstall(true);
      syncInstallEnvironment();

      console.log('📱 Install prompt available');
    };

    const handleAppInstalled = () => {
      setCanInstall(false);
      setDeferredPrompt(null);
      syncInstallEnvironment();
      console.log('📱 App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  };

  const listenForDisplayModeChanges = () => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      syncInstallEnvironment();
    };

    mediaQuery.addEventListener?.('change', handleDisplayModeChange);
    window.addEventListener('focus', handleDisplayModeChange);

    return () => {
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
      window.removeEventListener('focus', handleDisplayModeChange);
    };
  };

  const listenForSyncEvents = () => {
    const handleSyncEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ event: string; data?: { error?: string } }>;
      const { event: syncEvent, data } = customEvent.detail || {};

      switch (syncEvent) {
        case 'sync-completed':
          setIsSyncing(false);
          setLastSyncTime(new Date().toISOString());
          initializeSyncStatus(); // Refresh pending items count
          break;

        case 'sync-failed':
          setIsSyncing(false);
          console.error('Sync failed:', data?.error);
          break;

        case 'sync-started':
          setIsSyncing(true);
          break;
      }
    };

    // Listen for custom sync events from service worker
    window.addEventListener('sync-event', handleSyncEvent as EventListener);

    return () => {
      window.removeEventListener('sync-event', handleSyncEvent as EventListener);
    };
  };

  // Sync actions
  const syncNow = async (): Promise<SyncResult> => {
    if (!isOnline) {
      return {
        success: false,
        syncedItems: 0,
        failedItems: 0,
        conflicts: 0,
        errors: ['Cannot sync while offline'],
      };
    }

    setIsSyncing(true);

    try {
      const result = await syncService.manualSync();

      // Update status
      setIsSyncing(false);
      if (result.success) {
        setLastSyncTime(new Date().toISOString());
        await initializeSyncStatus();
        // ✅ Notify all listening pages to re-fetch fresh data from the server.
        // Without this, the sync button updates IndexedDB but the React UI
        // stays stale until a manual page refresh.
        // NOTE: all pages listen for "doosplit:data-updated" (not "data-refresh")
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('doosplit:data-updated', {
              detail: {
                domains: ['expenses', 'groups', 'friends', 'activity', 'notes', 'settlements'],
              },
            })
          );
        }
      }

      return result;

    } catch (error: any) {
      setIsSyncing(false);
      return {
        success: false,
        syncedItems: 0,
        failedItems: 0,
        conflicts: 0,
        errors: [error.message],
      };
    }
  };

  const clearCache = async (): Promise<void> => {
    try {
      await offlineStore.clearCache();
      await initializeSyncStatus();
      console.log('🗑️ Cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  };

  // Install actions
  const installPrompt = async (): Promise<void> => {
    if (!deferredPrompt) {
      throw new Error('Install prompt not available');
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;

    // Reset the deferred prompt
    setDeferredPrompt(null);
    setCanInstall(false);
    syncInstallEnvironment();

    if (outcome === 'accepted') {
      console.log('✅ User accepted the install prompt');
    } else {
      console.log('❌ User dismissed the install prompt');
    }
  };

  // Service worker actions
  const updateServiceWorker = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setServiceWorkerUpdated(false);
      setWaitingWorker(null);

      // Reload the page to activate the new service worker
      window.location.reload();
    }
  };

  const contextValue: PWAContextType = {
    // Network status
    isOnline,
    isOffline,

    // Sync status
    isSyncing,
    lastSyncTime,
    pendingSyncItems,

    // Sync actions
    syncNow,
    clearCache,

    // Install prompt
    canInstall,
    installPrompt,
    isStandalone,
    installPlatform,
    isIOS: installPlatform === "ios",
    isAndroid: installPlatform === "android",
    isSafari,
    canManualInstall: installPlatform === "ios" && !isStandalone,

    // Service worker
    serviceWorkerRegistered,
    serviceWorkerUpdated,
    updateServiceWorker,
  };

  return (
    <PWAContext.Provider value={contextValue}>
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA(): PWAContextType {
  const context = useContext(PWAContext);
  if (context === undefined) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
}

export default PWAProvider;
