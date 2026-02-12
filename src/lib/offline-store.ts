/**
 * Offline Store - Unified data access layer for DooSplit
 *
 * Provides a single interface for components to access data,
 * automatically handling online/offline states and caching.
 */

import getIndexedDB, {
  ExpenseRecord,
  SettlementRecord,
  FriendRecord,
  GroupRecord,
  SyncQueueItem
} from './indexeddb';
import { authFetch } from "@/lib/auth/client-session";

// Types for API responses
export interface ExpenseApiResponse {
  expenses: ExpenseRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SettlementApiResponse {
  settlements: SettlementRecord[];
  total: number;
}

export interface FriendApiResponse {
  friends: FriendRecord[];
}

export interface GroupApiResponse {
  groups: GroupRecord[];
}

export interface DashboardData {
  expenses: ExpenseRecord[];
  settlements: SettlementRecord[];
  friends: FriendRecord[];
  groups: GroupRecord[];
  balances: {
    total: number;
    youOwe: number;
    youAreOwed: number;
  };
}

class OfflineStore {
  private indexedDB = getIndexedDB();
  private onlineStatus: boolean = typeof window !== 'undefined' ? navigator.onLine : true;
  private syncInProgress: boolean = false;
  private inFlightRequests = new Map<string, Promise<any>>();
  private revalidateInFlight = new Set<string>();

  constructor() {
    // Only add listeners on client side
    if (typeof window !== 'undefined') {
      // Listen for online/offline events
      window.addEventListener('online', () => {
        this.onlineStatus = true;
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        this.onlineStatus = false;
      });

      // Check initial online status
      this.onlineStatus = navigator.onLine;
    } else {
      // Server side - assume online
      this.onlineStatus = true;
    }
  }

  // Network detection
  isOnline(): boolean {
    return this.onlineStatus;
  }

  // Sync status
  isSyncing(): boolean {
    return this.syncInProgress;
  }

  private buildRequestKey(
    url: string,
    options: RequestInit = {},
    cacheKey?: string
  ): string {
    const method = (options.method || "GET").toUpperCase();
    const body = typeof options.body === "string" ? options.body : "";
    return `${method}:${url}:${cacheKey || ""}:${body}`;
  }

  private async fetchFromNetwork<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await authFetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async revalidateInBackground<T>(
    url: string,
    options: RequestInit,
    cacheKey: string | undefined,
    requestKey: string
  ): Promise<void> {
    if (!cacheKey) {
      return;
    }

    const revalidateKey = `revalidate:${requestKey}`;
    if (this.revalidateInFlight.has(revalidateKey)) {
      return;
    }

    this.revalidateInFlight.add(revalidateKey);
    try {
      const data = await this.fetchFromNetwork<T>(url, options);
      await this.indexedDB.putMetadata(`cache_${cacheKey}`, {
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn(`Background revalidation failed for ${url}:`, error);
    } finally {
      this.revalidateInFlight.delete(revalidateKey);
    }
  }

  // Generic API fetch with caching
  private async fetchWithCache<T>(
    url: string,
    options: RequestInit = {},
    cacheKey?: string
  ): Promise<T> {
    const cacheTime = 5 * 60 * 1000; // 5 minutes cache
    const requestKey = this.buildRequestKey(url, options, cacheKey);
    const existing = this.inFlightRequests.get(requestKey);
    if (existing) {
      return existing as Promise<T>;
    }

    const requestPromise = (async () => {
      let cached: { data: T; timestamp: number } | null = null;

      if (cacheKey) {
        try {
          cached = await this.indexedDB.getMetadata(`cache_${cacheKey}`);
        } catch {
          cached = null;
        }
      }

      const hasFreshCache =
        !!cached && Date.now() - cached.timestamp < cacheTime;

      if (this.isOnline()) {
        if (hasFreshCache && cached) {
          void this.revalidateInBackground<T>(url, options, cacheKey, requestKey);
          return cached.data;
        }

        try {
          const data = await this.fetchFromNetwork<T>(url, options);

          if (cacheKey) {
            await this.indexedDB.putMetadata(`cache_${cacheKey}`, {
              data,
              timestamp: Date.now(),
            });
          }

          return data;
        } catch (error) {
          console.error(`API call failed for ${url}:`, error);
          if (cached) {
            console.log("Using cached data for", url);
            return cached.data;
          }
          throw error;
        }
      }

      if (cached) {
        return cached.data;
      }

      throw new Error("Offline - no cached data available");
    })().finally(() => {
      this.inFlightRequests.delete(requestKey);
    });

    this.inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  }

  // Expenses operations
  async getExpenses(query: {
    page?: number;
    limit?: number;
    category?: string;
    groupId?: string;
    createdBy?: string;
  } = {}): Promise<ExpenseRecord[]> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.category) params.append('category', query.category);
    if (query.groupId) params.append('groupId', query.groupId);

    const url = `/api/expenses?${params.toString()}`;
    const cacheKey = `expenses_${JSON.stringify(query)}`;

    try {
      const response: ExpenseApiResponse = await this.fetchWithCache(url, {}, cacheKey);

      // Cache in IndexedDB (only if available)
      if (response.expenses.length > 0) {
        try {
          await this.indexedDB.putMany('expenses', response.expenses);
        } catch (dbError) {
          console.log('IndexedDB not available, skipping cache');
        }
      }

      return response.expenses;
    } catch (error) {
      console.log('API call failed, trying IndexedDB fallback');
      try {
        return this.indexedDB.getExpenses(query);
      } catch (dbError) {
        console.log('IndexedDB not available, returning empty array');
        return [];
      }
    }
  }

  async createExpense(expenseData: Partial<ExpenseRecord>): Promise<ExpenseRecord> {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const expense: ExpenseRecord = {
      _id: tempId,
      amount: expenseData.amount || 0,
      description: expenseData.description || '',
      category: expenseData.category || 'other',
      date: expenseData.date || new Date().toISOString(),
      currency: expenseData.currency || 'INR',
      createdBy: expenseData.createdBy || '',
      groupId: expenseData.groupId,
      images: expenseData.images || [],
      notes: expenseData.notes,
      participants: expenseData.participants || [],
      splitMethod: expenseData.splitMethod || 'equally',
      version: 1,
      lastModified: new Date().toISOString(),
      modifiedBy: expenseData.createdBy || '',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.isOnline()) {
      try {
        const response = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expenseData),
        });

        if (response.ok) {
          const data = await response.json();
          // Replace temp expense with real one (only if IndexedDB available)
          try {
            await this.indexedDB.delete('expenses', tempId);
            await this.indexedDB.putExpense(data.expense);
          } catch (dbError) {
            console.log('IndexedDB not available, skipping cache update');
          }
          return data.expense;
        } else {
          // Log and throw the actual server error instead of silently falling through
          const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
          console.error('Expense creation failed on server:', errorData);
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
      } catch (error) {
        // Only queue for sync on network errors, not server validation errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.log('Network error, queuing for sync');
        } else {
          throw error;
        }
      }
    }

    // Offline: store locally and queue for sync (only if IndexedDB available)
    try {
      await this.indexedDB.putExpense(expense);
      await this.queueForSync({
        type: 'create',
        entityType: 'expense',
        entityId: tempId,
        data: expenseData,
      });
    } catch (dbError) {
      console.log('IndexedDB not available, cannot store offline');
      throw new Error('Cannot create expense offline - IndexedDB not available');
    }

    return expense;
  }

  async updateExpense(expenseId: string, updates: Partial<ExpenseRecord>): Promise<ExpenseRecord> {
    let existing: ExpenseRecord | null = null;
    try {
      existing = await this.indexedDB.get<ExpenseRecord>('expenses', expenseId);
    } catch (dbError) {
      console.log('IndexedDB not available, cannot update offline');
      throw new Error('Cannot update expense - IndexedDB not available');
    }

    if (!existing) {
      throw new Error('Expense not found');
    }

    const updated: ExpenseRecord = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      lastModified: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.isOnline()) {
      try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (response.ok) {
          const data = await response.json();
          try {
            await this.indexedDB.putExpense(data.expense);
          } catch (dbError) {
            console.log('IndexedDB not available, skipping cache update');
          }
          return data.expense;
        }
      } catch (error) {
        console.log('API call failed, queuing for sync');
      }
    }

    // Offline: update locally and queue for sync
    try {
      await this.indexedDB.putExpense(updated);
      await this.queueForSync({
        type: 'update',
        entityType: 'expense',
        entityId: expenseId,
        data: updates,
      });
    } catch (dbError) {
      console.log('IndexedDB not available, cannot store offline update');
      throw new Error('Cannot update expense offline - IndexedDB not available');
    }

    return updated;
  }

  async deleteExpense(expenseId: string): Promise<void> {
    if (this.isOnline()) {
      try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          await this.indexedDB.delete('expenses', expenseId);
          return;
        }
      } catch (error) {
        console.log('API call failed, queuing for sync');
      }
    }

    // Offline: mark as deleted and queue for sync
    const existing = await this.indexedDB.get<ExpenseRecord>('expenses', expenseId);
    if (existing) {
      const updated = { ...existing, isDeleted: true };
      await this.indexedDB.putExpense(updated);
    }

    await this.queueForSync({
      type: 'delete',
      entityType: 'expense',
      entityId: expenseId,
      data: {},
    });
  }

  // Settlements operations
  async getSettlements(): Promise<SettlementRecord[]> {
    const url = '/api/settlements';
    const cacheKey = 'settlements';

    try {
      const response: SettlementApiResponse = await this.fetchWithCache(url, {}, cacheKey);

      // Cache in IndexedDB (only if available)
      if (response.settlements.length > 0) {
        try {
          await this.indexedDB.putMany('settlements', response.settlements);
        } catch (dbError) {
          console.log('IndexedDB not available, skipping cache');
        }
      }

      return response.settlements;
    } catch (error) {
      console.log('API call failed, trying IndexedDB fallback');
      try {
        return this.indexedDB.getSettlements();
      } catch (dbError) {
        console.log('IndexedDB not available, returning empty array');
        return [];
      }
    }
  }

  async createSettlement(settlementData: Partial<SettlementRecord>): Promise<SettlementRecord> {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const settlement: SettlementRecord = {
      _id: tempId,
      fromUserId: settlementData.fromUserId || '',
      toUserId: settlementData.toUserId || '',
      amount: settlementData.amount || 0,
      currency: settlementData.currency || 'INR',
      date: settlementData.date || new Date().toISOString(),
      method: settlementData.method || 'Cash',
      notes: settlementData.notes,
      version: 1,
      lastModified: new Date().toISOString(),
      modifiedBy: settlementData.fromUserId || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.isOnline()) {
      try {
        const response = await fetch('/api/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settlementData),
        });

        if (response.ok) {
          const data = await response.json();
          await this.indexedDB.delete('settlements', tempId);
          await this.indexedDB.putSettlement(data.settlement);
          return data.settlement;
        }
      } catch (error) {
        console.log('API call failed, queuing for sync');
      }
    }

    // Offline: store locally and queue for sync
    await this.indexedDB.putSettlement(settlement);
    await this.queueForSync({
      type: 'create',
      entityType: 'settlement',
      entityId: tempId,
      data: settlementData,
    });

    return settlement;
  }

  // Friends operations
  async getFriends(): Promise<FriendRecord[]> {
    const url = '/api/friends';
    const cacheKey = 'friends';

    try {
      const response: FriendApiResponse = await this.fetchWithCache(url, {}, cacheKey);

      // Cache in IndexedDB (only if available)
      if (response.friends.length > 0) {
        try {
          await this.indexedDB.putMany('friends', response.friends);
        } catch (dbError) {
          console.log('IndexedDB not available, skipping cache');
        }
      }

      return response.friends;
    } catch (error) {
      console.log('API call failed, trying IndexedDB fallback');
      try {
        return this.indexedDB.getFriends();
      } catch (dbError) {
        console.log('IndexedDB not available, returning empty array');
        return [];
      }
    }
  }

  // Groups operations
  async getGroups(): Promise<GroupRecord[]> {
    const url = '/api/groups';
    const cacheKey = 'groups';

    try {
      const response: GroupApiResponse = await this.fetchWithCache(url, {}, cacheKey);

      // Cache in IndexedDB (only if available)
      if (response.groups.length > 0) {
        try {
          await this.indexedDB.putMany('groups', response.groups);
        } catch (dbError) {
          console.log('IndexedDB not available, skipping cache');
        }
      }

      return response.groups;
    } catch (error) {
      console.log('API call failed, trying IndexedDB fallback');
      try {
        return this.indexedDB.getGroups();
      } catch (dbError) {
        console.log('IndexedDB not available, returning empty array');
        return [];
      }
    }
  }

  // Dashboard data
  async getDashboardData(): Promise<DashboardData> {
    const [expenses, settlements, friends, groups] = await Promise.all([
      this.getExpenses({ limit: 10 }),
      this.getSettlements(),
      this.getFriends(),
      this.getGroups(),
    ]);

    // Calculate balances from friends data
    const youOwe = friends
      .filter(f => f.balance < 0)
      .reduce((sum, f) => sum + Math.abs(f.balance), 0);

    const youAreOwed = friends
      .filter(f => f.balance > 0)
      .reduce((sum, f) => sum + f.balance, 0);

    return {
      expenses,
      settlements,
      friends,
      groups,
      balances: {
        total: youAreOwed - youOwe,
        youOwe,
        youAreOwed,
      },
    };
  }

  // Sync queue management
  private async queueForSync(item: Omit<SyncQueueItem, 'id' | 'status' | 'retryCount' | 'maxRetries' | 'timestamp'>): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...item,
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      timestamp: new Date().toISOString(),
    };

    await this.indexedDB.putSyncItem(syncItem);
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.indexedDB.getPendingSyncItems();
  }

  async processSyncQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline()) return;

    this.syncInProgress = true;

    try {
      const pendingItems = await this.getPendingSyncItems();

      for (const item of pendingItems) {
        try {
          await this.processSyncItem(item);
          await this.indexedDB.updateSyncItemStatus(item.id, 'completed');
        } catch (error: any) {
          item.retryCount++;
          if (item.retryCount >= item.maxRetries) {
            await this.indexedDB.updateSyncItemStatus(item.id, 'failed', error?.message || 'Unknown error');
          } else {
            await this.indexedDB.putSyncItem(item);
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async processSyncItem(item: SyncQueueItem): Promise<void> {
    const { type, entityType, entityId, data } = item;

    switch (entityType) {
      case 'expense':
        if (type === 'create') {
          await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        } else if (type === 'update') {
          await fetch(`/api/expenses/${entityId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        } else if (type === 'delete') {
          await fetch(`/api/expenses/${entityId}`, {
            method: 'DELETE',
          });
        }
        break;

      case 'settlement':
        if (type === 'create') {
          await fetch('/api/settlements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        }
        break;
    }
  }

  private async triggerSync(): Promise<void> {
    if ('serviceWorker' in navigator && 'sync' in (window as any).ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('background-sync');
    } else {
      // Fallback: process sync queue directly
      setTimeout(() => this.processSyncQueue(), 1000);
    }
  }

  // Utility methods
  async clearCache(): Promise<void> {
    await this.indexedDB.clearAllData();
  }

  async getStorageStats() {
    return this.indexedDB.getStorageStats();
  }
}

// Singleton instance
let offlineStoreInstance: OfflineStore | null = null;

export function getOfflineStore(): OfflineStore {
  if (!offlineStoreInstance) {
    offlineStoreInstance = new OfflineStore();
  }
  return offlineStoreInstance;
}

export default getOfflineStore;
