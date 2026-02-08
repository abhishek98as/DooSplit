/**
 * Sync Service - Handles background synchronization and conflict resolution
 */

import getOfflineStore from './offline-store';
import getIndexedDB, { SyncQueueItem } from './indexeddb';
import { resolveConflicts } from './conflict-resolver';
import { recalculateBalances } from './balance-recalculator';

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  failedItems: number;
  conflicts: number;
  errors: string[];
}

export interface VersionVector {
  entityId: string;
  version: number;
  lastModified: string;
  modifiedBy: string;
}

class SyncService {
  private offlineStore = getOfflineStore();
  private indexedDB = getIndexedDB();
  private isSyncing = false;

  constructor() {
    // Listen for service worker sync events
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_COMPLETED') {
          this.handleSyncCompleted();
        } else if (event.data.type === 'SYNC_FAILED') {
          this.handleSyncFailed(event.data.error);
        }
      });
    }
  }

  /**
   * Start background synchronization
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing || !this.offlineStore.isOnline()) {
      return {
        success: false,
        syncedItems: 0,
        failedItems: 0,
        conflicts: 0,
        errors: ['Sync already in progress or offline'],
      };
    }

    this.isSyncing = true;

    const result: SyncResult = {
      success: true,
      syncedItems: 0,
      failedItems: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      console.log('🔄 Starting background sync...');

      // Process sync queue
      const queueItems = await this.offlineStore.getPendingSyncItems();

      for (const item of queueItems) {
        try {
          await this.processQueueItem(item);
          await this.indexedDB.updateSyncItemStatus(item.id, 'completed');
          result.syncedItems++;
        } catch (error: any) {
          console.error(`Failed to sync item ${item.id}:`, error);

          item.retryCount++;
          if (item.retryCount >= item.maxRetries) {
            await this.indexedDB.updateSyncItemStatus(item.id, 'failed', error.message);
            result.failedItems++;
            result.errors.push(`${item.entityType} ${item.entityId}: ${error.message}`);
          } else {
            await this.indexedDB.putSyncItem(item);
          }
        }
      }

      // Fetch latest data from server
      await this.syncFromServer();

      // Recalculate balances
      await recalculateBalances();

      console.log('✅ Sync completed successfully');

    } catch (error: any) {
      console.error('❌ Sync failed:', error);
      result.success = false;
      result.errors.push(error.message);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Process a single sync queue item
   */
  private async processQueueItem(item: SyncQueueItem): Promise<void> {
    const { type, entityType, entityId, data } = item;

    switch (entityType) {
      case 'expense':
        await this.syncExpense(type, entityId, data);
        break;

      case 'settlement':
        await this.syncSettlement(type, entityId, data);
        break;

      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Sync expense operations
   */
  private async syncExpense(type: string, expenseId: string, data: any): Promise<void> {
    switch (type) {
      case 'create':
        const createResponse = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create expense: ${createResponse.statusText}`);
        }

        const createData = await createResponse.json();

        // Replace temp ID with real ID
        await this.indexedDB.delete('expenses', expenseId);
        await this.indexedDB.putExpense(createData.expense);
        break;

      case 'update':
        const updateResponse = await fetch(`/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!updateResponse.ok) {
          // Check if it's a conflict (version mismatch)
          if (updateResponse.status === 409) {
            await this.handleConflict('expense', expenseId, data);
            return;
          }
          throw new Error(`Failed to update expense: ${updateResponse.statusText}`);
        }

        const updateData = await updateResponse.json();
        await this.indexedDB.putExpense(updateData.expense);
        break;

      case 'delete':
        const deleteResponse = await fetch(`/api/expenses/${expenseId}`, {
          method: 'DELETE',
        });

        if (!deleteResponse.ok) {
          throw new Error(`Failed to delete expense: ${deleteResponse.statusText}`);
        }

        await this.indexedDB.delete('expenses', expenseId);
        break;
    }
  }

  /**
   * Sync settlement operations
   */
  private async syncSettlement(type: string, settlementId: string, data: any): Promise<void> {
    if (type === 'create') {
      const response = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Failed to create settlement: ${response.statusText}`);
      }

      const result = await response.json();

      // Replace temp ID with real ID
      await this.indexedDB.delete('settlements', settlementId);
      await this.indexedDB.putSettlement(result.settlement);
    }
  }

  /**
   * Sync latest data from server
   */
  private async syncFromServer(): Promise<void> {
    console.log('📥 Syncing latest data from server...');

    try {
      // Sync expenses
      const expensesResponse = await fetch('/api/expenses?limit=100');
      if (expensesResponse.ok) {
        const expensesData = await expensesResponse.json();
        if (expensesData.expenses?.length > 0) {
          await this.indexedDB.putMany('expenses', expensesData.expenses);
        }
      }

      // Sync settlements
      const settlementsResponse = await fetch('/api/settlements');
      if (settlementsResponse.ok) {
        const settlementsData = await settlementsResponse.json();
        if (settlementsData.settlements?.length > 0) {
          await this.indexedDB.putMany('settlements', settlementsData.settlements);
        }
      }

      // Sync friends
      const friendsResponse = await fetch('/api/friends');
      if (friendsResponse.ok) {
        const friendsData = await friendsResponse.json();
        if (friendsData.friends?.length > 0) {
          await this.indexedDB.putMany('friends', friendsData.friends);
        }
      }

      // Sync groups
      const groupsResponse = await fetch('/api/groups');
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        if (groupsData.groups?.length > 0) {
          await this.indexedDB.putMany('groups', groupsData.groups);
        }
      }

      // Update last sync timestamp
      await this.indexedDB.putMetadata('lastSync', new Date().toISOString());

    } catch (error) {
      console.error('Failed to sync from server:', error);
      // Don't throw - partial sync is better than no sync
    }
  }

  /**
   * Handle version conflicts
   */
  private async handleConflict(entityType: string, entityId: string, localData: any): Promise<void> {
    console.log(`⚠️ Conflict detected for ${entityType} ${entityId}`);

    try {
      // Get server version
      const serverResponse = await fetch(`/api/${entityType}s/${entityId}`);
      if (!serverResponse.ok) {
        throw new Error('Could not fetch server version');
      }

      const serverData = await serverResponse.json();

      // Resolve conflict
      const resolution = await resolveConflicts(entityType, entityId, localData, serverData);

      if (resolution.strategy === 'server-wins') {
        // Update local data with server version
        if (entityType === 'expense') {
          await this.indexedDB.putExpense(serverData.expense);
        }
      } else if (resolution.strategy === 'client-wins') {
        // Retry the update with conflict resolution
        await this.syncExpense('update', entityId, localData);
      } else if (resolution.strategy === 'merge') {
        // Apply merged data
        await this.syncExpense('update', entityId, resolution.mergedData);
      }

    } catch (error) {
      console.error('Conflict resolution failed:', error);
      // Keep local version for now - user can resolve manually later
    }
  }

  /**
   * Handle successful sync completion
   */
  private async handleSyncCompleted(): Promise<void> {
    console.log('🎉 Sync completed from service worker');

    // Trigger balance recalculation
    await recalculateBalances();

    // Notify UI
    this.notifyUI('sync-completed', { timestamp: Date.now() });
  }

  /**
   * Handle sync failure
   */
  private async handleSyncFailed(error: string): Promise<void> {
    console.error('❌ Sync failed from service worker:', error);

    // Notify UI
    this.notifyUI('sync-failed', { error, timestamp: Date.now() });
  }

  /**
   * Notify UI components about sync status
   */
  private notifyUI(event: string, data: any): void {
    // Dispatch custom event for UI components
    window.dispatchEvent(new CustomEvent('sync-event', {
      detail: { event, data }
    }));
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    isOnline: boolean;
    isSyncing: boolean;
    lastSync: string | null;
    pendingItems: number;
  }> {
    const lastSync = await this.indexedDB.getMetadata('lastSync');
    const pendingItems = await this.offlineStore.getPendingSyncItems();

    return {
      isOnline: this.offlineStore.isOnline(),
      isSyncing: this.isSyncing,
      lastSync,
      pendingItems: pendingItems.length,
    };
  }

  /**
   * Manual sync trigger
   */
  async manualSync(): Promise<SyncResult> {
    return this.sync();
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

export default getSyncService;