"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import getOfflineStore from '@/lib/offline-store';
import getSyncService, { SyncResult } from '@/lib/sync-service';

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

  // Service worker
  serviceWorkerRegistered: boolean;
  serviceWorkerUpdated: boolean;
  updateServiceWorker: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

interface PWAProviderProps {
  children: ReactNode;
}

export function PWAProvider({ children }: PWAProviderProps) {
  // Network status
  const [isOnline, setIsOnline] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Sync status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingSyncItems, setPendingSyncItems] = useState(0);

  // PWA install
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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

    setIsOnline(navigator.onLine);
    setIsOffline(!navigator.onLine);
    initializePWA();
    const cleanup = initializeNetworkListeners();
    initializeSyncStatus();

    return () => {
      cleanup?.();
    };
  }, []);

  const initializePWA = async () => {
    // Register service worker
    await registerServiceWorker();

    // Listen for install prompt
    listenForInstallPrompt();

    // Listen for sync events
    listenForSyncEvents();
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
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour

        console.log('✅ Service Worker registered');

      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  };

  const listenForInstallPrompt = () => {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the default prompt
      e.preventDefault();

      // Store the event for later use
      setDeferredPrompt(e);
      setCanInstall(true);

      console.log('📱 Install prompt available');
    });

    window.addEventListener('appinstalled', () => {
      setCanInstall(false);
      setDeferredPrompt(null);
      console.log('📱 App installed successfully');
    });
  };

  const listenForSyncEvents = () => {
    // Listen for custom sync events from service worker
    window.addEventListener('sync-event', (event: any) => {
      const { event: syncEvent, data } = event.detail;

      switch (syncEvent) {
        case 'sync-completed':
          setIsSyncing(false);
          setLastSyncTime(new Date().toISOString());
          initializeSyncStatus(); // Refresh pending items count
          break;

        case 'sync-failed':
          setIsSyncing(false);
          console.error('Sync failed:', data.error);
          break;

        case 'sync-started':
          setIsSyncing(true);
          break;
      }
    });
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
