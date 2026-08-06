"use client";

import { useState, useEffect } from 'react';
import { WifiOff, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { usePWA } from './PWAProvider';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom';
  autoHide?: boolean;
  showControls?: boolean;
}

export default function OfflineIndicator({
  position = 'top',
  autoHide = true,
  showControls = true
}: OfflineIndicatorProps) {
  const { isOffline, isOnline, pendingSyncItems, syncNow, isSyncing } = usePWA();
  const [isVisible, setIsVisible] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("doosplit:last-save-notice");
      if (notice) {
        setInfoMessage(notice);
        setIsVisible(true);
        sessionStorage.removeItem("doosplit:last-save-notice");
        if (autoHide) {
          const timer = setTimeout(() => {
            setIsVisible(false);
            setInfoMessage(null);
          }, 6000);
          return () => clearTimeout(timer);
        }
      }
    } catch {
      // ignore
    }
  }, [autoHide]);

  useEffect(() => {
    if (isOffline) {
      setIsVisible(true);
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      setIsVisible(true);
      if (autoHide && pendingSyncItems === 0) {
        const timer = setTimeout(() => setIsVisible(false), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [isOffline, isOnline, wasOffline, autoHide, pendingSyncItems]);

  useEffect(() => {
    if (pendingSyncItems > 0) {
      setIsVisible(true);
    }
  }, [pendingSyncItems]);

  useEffect(() => {
    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setConflictMessage(
        String(detail.message || "Sync issue — some changes need attention")
      );
      setInfoMessage(null);
      setIsVisible(true);
    };
    window.addEventListener("doosplit:sync-conflict", onConflict as EventListener);
    return () => {
      window.removeEventListener("doosplit:sync-conflict", onConflict as EventListener);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setConflictMessage(null);
    setInfoMessage(null);
  };

  const handleSync = async () => {
    try {
      const result = await syncNow();
      if (result.conflicts > 0 || result.failedItems > 0) {
        setConflictMessage(
          result.failedItems > 0
            ? `${result.failedItems} item(s) failed to sync. Tap Sync to retry.`
            : `${result.conflicts} conflict(s) detected. Open Conflicts to review.`
        );
        setIsVisible(true);
      } else {
        setConflictMessage(null);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      setConflictMessage("Sync failed. Check your connection and try again.");
      setIsVisible(true);
    }
  };

  const showPending = pendingSyncItems > 0;
  const showBanner =
    isVisible ||
    isOffline ||
    showPending ||
    Boolean(conflictMessage) ||
    Boolean(infoMessage);

  if (!showBanner) {
    return null;
  }

  const positionClasses = position === 'top'
    ? 'top-0 left-0 right-0'
    : 'bottom-0 left-0 right-0';

  const isError = isOffline || Boolean(conflictMessage);
  const bgColor = isError
    ? 'bg-error/10 border-error/20'
    : infoMessage
      ? 'bg-primary/10 border-primary/20'
      : showPending
      ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
      : 'bg-success/10 border-success/20';

  const textColor = isError
    ? 'text-error'
    : infoMessage
      ? 'text-primary'
      : showPending
      ? 'text-amber-800 dark:text-amber-200'
      : 'text-success';

  return (
    <div className={`fixed ${positionClasses} z-50 border-b ${bgColor} backdrop-blur-sm`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${textColor} flex items-center gap-2 min-w-0`}>
              {isOffline ? (
                <WifiOff className="h-5 w-5 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0" />
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
                <span className="font-medium truncate">
                  {conflictMessage
                    ? "Sync issue"
                    : infoMessage
                      ? "Saved"
                      : isOffline
                      ? "You are offline"
                      : showPending
                        ? "Pending sync"
                        : "Back online"}
                </span>
                <span className="text-sm opacity-80 truncate">
                  {conflictMessage ||
                    infoMessage ||
                    (isOffline
                      ? "Changes will sync when reconnected"
                      : showPending
                        ? `${pendingSyncItems} item${pendingSyncItems !== 1 ? "s" : ""} waiting to sync`
                        : "All caught up")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showControls && (showPending || conflictMessage) && !isOffline && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors inline-flex items-center gap-1 ${
                  isSyncing
                    ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/80'
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? 'Syncing…' : 'Sync'}
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
