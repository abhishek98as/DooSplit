"use client";

import { useState, useEffect } from 'react';
import { WifiOff, AlertTriangle, X } from 'lucide-react';
import { usePWA } from './PWAProvider';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom'; // Position of the indicator
  autoHide?: boolean; // Auto-hide after some time when coming online
  showControls?: boolean; // Show sync controls
}

export default function OfflineIndicator({
  position = 'top',
  autoHide = true,
  showControls = false
}: OfflineIndicatorProps) {
  const { isOffline, isOnline, pendingSyncItems, syncNow, isSyncing } = usePWA();
  const [isVisible, setIsVisible] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Handle visibility based on online/offline state
  useEffect(() => {
    if (isOffline) {
      setIsVisible(true);
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      // Just came back online
      setIsVisible(true);

      // Auto-hide after 5 seconds if autoHide is enabled
      if (autoHide) {
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, 5000);

        return () => clearTimeout(timer);
      }
    }
  }, [isOffline, isOnline, wasOffline, autoHide]);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleSync = async () => {
    try {
      await syncNow();
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  };

  // Don't render if not visible or if online and no pending items
  if (!isVisible || (!isOffline && !wasOffline)) {
    return null;
  }

  const positionClasses = position === 'top'
    ? 'top-0 left-0 right-0'
    : 'bottom-0 left-0 right-0';

  const bgColor = isOffline
    ? 'bg-error/10 border-error/20'
    : 'bg-success/10 border-success/20';

  const textColor = isOffline
    ? 'text-error'
    : 'text-success';

  const icon = isOffline ? (
    <WifiOff className="h-5 w-5" />
  ) : (
    <AlertTriangle className="h-5 w-5" />
  );

  return (
    <div className={`fixed ${positionClasses} z-50 border-b ${bgColor} backdrop-blur-sm`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`${textColor} flex items-center gap-2`}>
              {icon}
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="font-medium">
                  {isOffline ? 'You are offline' : 'Back online'}
                </span>
                {isOffline && (
                  <span className="text-sm opacity-80">
                    Changes will sync when reconnected
                  </span>
                )}
                {!isOffline && pendingSyncItems > 0 && (
                  <span className="text-sm opacity-80">
                    {pendingSyncItems} item{pendingSyncItems !== 1 ? 's' : ''} syncing...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showControls && !isOffline && pendingSyncItems > 0 && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  isSyncing
                    ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/80'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}

            <button
              onClick={handleDismiss}
              className={`${textColor} hover:bg-black/5 rounded-full p-1 transition-colors`}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Toast-style indicator (alternative smaller version)
export function OfflineToast() {
  const { isOffline, isOnline } = usePWA();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setShow(true);
    } else if (isOnline) {
      setShow(true);
      // Hide after 3 seconds when coming back online
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, isOnline]);

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-2">
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
        isOffline
          ? 'bg-error/10 border border-error/20 text-error'
          : 'bg-success/10 border border-success/20 text-success'
      }`}>
        {isOffline ? (
          <WifiOff className="h-4 w-4" />
        ) : (
          <div className="h-4 w-4 rounded-full bg-current animate-pulse" />
        )}
        <span className="text-sm font-medium">
          {isOffline ? 'Offline' : 'Back online'}
        </span>
      </div>
    </div>
  );
}

// Mini indicator for status bars
export function MiniOfflineIndicator() {
  const { isOffline } = usePWA();

  if (!isOffline) return null;

  return (
    <div className="flex items-center gap-1 text-error text-xs">
      <WifiOff className="h-3 w-3" />
      <span>Offline</span>
    </div>
  );
}