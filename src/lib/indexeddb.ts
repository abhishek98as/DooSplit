/**
 * IndexedDB wrapper for DooSplit offline functionality
 */

export interface ExpenseRecord {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  createdBy: string;
  groupId?: string;
  images: string[];
  notes?: string;
  participants: Array<{
    userId: string;
    paidAmount: number;
    owedAmount: number;
  }>;
  splitMethod: string;
  version: number;
  lastModified: string;
  modifiedBy: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementRecord {
  _id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: string;
  method: string;
  notes?: string;
  version: number;
  lastModified: string;
  modifiedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FriendRecord {
  id: string;
  userId: string;
  friendId: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
  status: string;
  friendshipDate: string;
  lastSynced: string;
}

export interface GroupRecord {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  members: Array<{
    userId: string;
    role: string;
    joinedAt: string;
  }>;
  createdBy: string;
  balance: number;
  memberCount: number;
  lastSynced: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'expense' | 'settlement' | 'friend' | 'group';
  entityId: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  timestamp: string;
  error?: string;
}

export interface MetadataRecord {
  key: string;
  value: any;
  lastUpdated: string;
}

// Database configuration
const DB_NAME = 'doosplit-db';
const DB_VERSION = 1;

const STORES = {
  expenses: 'expenses',
  settlements: 'settlements',
  friends: 'friends',
  groups: 'groups',
  syncQueue: 'syncQueue',
  metadata: 'metadata',
} as const;

const INDEXES = {
  expenses: [
    { name: 'date', keyPath: 'date' },
    { name: 'createdBy', keyPath: 'createdBy' },
    { name: 'groupId', keyPath: 'groupId' },
    { name: 'version', keyPath: 'version' },
  ],
  settlements: [
    { name: 'fromUserId', keyPath: 'fromUserId' },
    { name: 'toUserId', keyPath: 'toUserId' },
    { name: 'date', keyPath: 'date' },
    { name: 'version', keyPath: 'version' },
  ],
  friends: [
    { name: 'userId', keyPath: 'userId' },
    { name: 'name', keyPath: 'name' },
    { name: 'status', keyPath: 'status' },
  ],
  groups: [
    { name: 'name', keyPath: 'name' },
    { name: 'createdBy', keyPath: 'createdBy' },
  ],
  syncQueue: [
    { name: 'type', keyPath: 'type' },
    { name: 'entityType', keyPath: 'entityType' },
    { name: 'status', keyPath: 'status' },
    { name: 'timestamp', keyPath: 'timestamp' },
  ],
  metadata: [],
} as const;

class IndexedDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB: Failed to open database');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB: Database opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        Object.entries(STORES).forEach(([key, storeName]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: key === 'metadata' ? 'key' : '_id'
            });

            // Create indexes
            const storeIndexes = INDEXES[key as keyof typeof INDEXES];
            storeIndexes.forEach(index => {
              store.createIndex(index.name, index.keyPath);
            });

            console.log(`IndexedDB: Created store '${storeName}'`);
          }
        });
      };
    });

    return this.dbPromise;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initDB();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  // Generic CRUD operations
  async get<T>(storeName: string, key: string | IDBKeyRange): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string, query?: IDBKeyRange, count?: number): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll(query, count);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string | IDBKeyRange): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Query with index
  async getByIndex<T>(
    storeName: string,
    indexName: string,
    key: string | IDBKeyRange
  ): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(key);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Batch operations
  async putMany<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let completed = 0;
      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      const checkComplete = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };

      items.forEach(item => {
        const request = store.put(item);
        request.onsuccess = checkComplete;
        request.onerror = () => reject(request.error);
      });
    });
  }

  // Expenses operations
  async getExpenses(query?: {
    createdBy?: string;
    groupId?: string;
    dateRange?: { start: string; end: string };
    limit?: number;
  }): Promise<ExpenseRecord[]> {
    let expenses = await this.getAll<ExpenseRecord>(STORES.expenses);

    if (query) {
      if (query.createdBy) {
        expenses = expenses.filter(e => e.createdBy === query.createdBy);
      }
      if (query.groupId) {
        expenses = expenses.filter(e => e.groupId === query.groupId);
      }
      if (query.dateRange) {
        expenses = expenses.filter(e =>
          e.date >= query.dateRange!.start && e.date <= query.dateRange!.end
        );
      }
      if (query.limit) {
        expenses = expenses.slice(0, query.limit);
      }
    }

    return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async putExpense(expense: ExpenseRecord): Promise<void> {
    return this.put(STORES.expenses, expense);
  }

  // Settlements operations
  async getSettlements(userId?: string): Promise<SettlementRecord[]> {
    let settlements = await this.getAll<SettlementRecord>(STORES.settlements);

    if (userId) {
      settlements = settlements.filter(s =>
        s.fromUserId === userId || s.toUserId === userId
      );
    }

    return settlements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async putSettlement(settlement: SettlementRecord): Promise<void> {
    return this.put(STORES.settlements, settlement);
  }

  // Friends operations
  async getFriends(userId?: string): Promise<FriendRecord[]> {
    let friends = await this.getAll<FriendRecord>(STORES.friends);

    if (userId) {
      friends = friends.filter(f => f.userId === userId);
    }

    return friends;
  }

  async putFriend(friend: FriendRecord): Promise<void> {
    return this.put(STORES.friends, friend);
  }

  // Groups operations
  async getGroups(userId?: string): Promise<GroupRecord[]> {
    let groups = await this.getAll<GroupRecord>(STORES.groups);

    if (userId) {
      groups = groups.filter(g =>
        g.members.some(m => m.userId === userId)
      );
    }

    return groups;
  }

  async putGroup(group: GroupRecord): Promise<void> {
    return this.put(STORES.groups, group);
  }

  // Sync queue operations
  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.getByIndex<SyncQueueItem>(STORES.syncQueue, 'status', 'pending');
  }

  async putSyncItem(item: SyncQueueItem): Promise<void> {
    return this.put(STORES.syncQueue, item);
  }

  async updateSyncItemStatus(id: string, status: SyncQueueItem['status'], error?: string): Promise<void> {
    const item = await this.get<SyncQueueItem>(STORES.syncQueue, id);
    if (item) {
      item.status = status;
      if (error) item.error = error;
      await this.put(STORES.syncQueue, item);
    }
  }

  // Metadata operations
  async getMetadata(key: string): Promise<any> {
    const record = await this.get<MetadataRecord>(STORES.metadata, key);
    return record?.value;
  }

  async putMetadata(key: string, value: any): Promise<void> {
    const record: MetadataRecord = {
      key,
      value,
      lastUpdated: new Date().toISOString(),
    };
    return this.put(STORES.metadata, record);
  }

  // Utility methods
  async getStorageStats(): Promise<{
    expenses: number;
    settlements: number;
    friends: number;
    groups: number;
    syncQueue: number;
  }> {
    const [expenses, settlements, friends, groups, syncQueue] = await Promise.all([
      this.getAll(STORES.expenses),
      this.getAll(STORES.settlements),
      this.getAll(STORES.friends),
      this.getAll(STORES.groups),
      this.getAll(STORES.syncQueue),
    ]);

    return {
      expenses: expenses.length,
      settlements: settlements.length,
      friends: friends.length,
      groups: groups.length,
      syncQueue: syncQueue.length,
    };
  }

  async clearAllData(): Promise<void> {
    await Promise.all([
      this.clear(STORES.expenses),
      this.clear(STORES.settlements),
      this.clear(STORES.friends),
      this.clear(STORES.groups),
      this.clear(STORES.syncQueue),
      // Keep metadata for version vectors
    ]);
  }

  // Close database connection
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let indexedDBInstance: IndexedDB | null = null;

export function getIndexedDB(): IndexedDB {
  if (!indexedDBInstance) {
    indexedDBInstance = new IndexedDB();
  }
  return indexedDBInstance;
}

export default getIndexedDB;