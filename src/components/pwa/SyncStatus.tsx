"use client";

import { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { usePWA } from './PWAProvider';
import Button from '@/components/ui/Button';

interface SyncStatusProps {
  compact?: boolean; // Show compact version
  showControls?: boolean; // Show sync buttons
}

export default function SyncStatus({ compact = false, showControls = true }: SyncStatusProps) {
  const {
    isOnline,
    isOffline,
    isSyncing,
    lastSyncTime,
    pendingSyncItems,
    syncNow,
  } = usePWA();

  const [syncResult, setSyncResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleSync = async () => {
    try {
      const result = await syncNow();
      setSyncResult(result);

      // Show details for a few seconds if there were issues
      if (!result.success || result.failedItems > 0) {
        setShowDetails(true);
        setTimeout(() => setShowDetails(false), 5000);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusColor = () => {
    if (isOffline) return 'text-error';
    if (isSyncing) return 'text-info';
    if (pendingSyncItems > 0) return 'text-warning';
    return 'text-success';
  };

  const getStatusIcon = () => {
    if (isOffline) return <WifiOff className="h-4 w-4" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (pendingSyncItems > 0) return <Clock className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (isOffline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (pendingSyncItems > 0) return `${pendingSyncItems} pending`;
    return 'Synced';
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm ${getStatusColor()}`}>
        {getStatusIcon()}
        <span>{getStatusText()}</span>
        {showControls && pendingSyncItems > 0 && !isSyncing && (
          <button
            onClick={handleSync}
            className="ml-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Sync now"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="font-medium">{getStatusText()}</span>
          </div>

          {isOffline && (
            <div className="flex items-center gap-1 text-error text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Working offline</span>
            </div>
          )}
        </div>

        {showControls && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSync}
            disabled={isOffline || isSyncing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-neutral-600 dark:text-dark-text-secondary">
        <div>
          <span className="font-medium">Last sync:</span>
          <span className="ml-2">{formatLastSync(lastSyncTime)}</span>
        </div>

        <div>
          <span className="font-medium">Pending:</span>
          <span className="ml-2">{pendingSyncItems} items</span>
        </div>
      </div>

      {/* Sync Result Details */}
      {syncResult && showDetails && (
        <div className="mt-3 p-3 bg-neutral-50 dark:bg-dark-bg rounded border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Sync Results</span>
            <button
              onClick={() => setShowDetails(false)}
              className="text-neutral-400 hover:text-neutral-600"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-success font-medium">{syncResult.syncedItems}</div>
              <div className="text-neutral-500">Synced</div>
            </div>
            <div className="text-center">
              <div className="text-error font-medium">{syncResult.failedItems}</div>
              <div className="text-neutral-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-warning font-medium">{syncResult.conflicts}</div>
              <div className="text-neutral-500">Conflicts</div>
            </div>
          </div>

          {syncResult.errors && syncResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-error">
              {syncResult.errors.map((error: string, index: number) => (
                <div key={index}>• {error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Offline Notice */}
      {isOffline && (
        <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded text-sm">
          <div className="flex items-center gap-2 text-warning">
            <WifiOff className="h-4 w-4" />
            <span className="font-medium">You're offline</span>
          </div>
          <p className="text-neutral-600 dark:text-dark-text-secondary mt-1">
            Changes will be synced when you reconnect to the internet.
          </p>
        </div>
      )}
    </div>
  );
}