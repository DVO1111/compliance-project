const DB_NAME = "compliance_cache";
const DB_VERSION = 1;
const STORE = "responses";

import { encryptData, decryptData } from './crypto';

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number; // ms
}

class ComplianceCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async set<T>(key: string, data: T, ttl = 300_000): Promise<void> {
    if (!this.db) await this.init();
    const entry: CacheEntry<T> = { key, data, timestamp: Date.now(), ttl };
    const encrypted = await encryptData(entry);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put({ key, encrypted });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = async () => {
        const row = req.result as { key: string; encrypted: string } | undefined;
        if (!row) return resolve(null);
        
        const entry = await decryptData<CacheEntry<T>>(row.encrypted);
        if (!entry) return resolve(null);
        
        const expired = Date.now() - entry.timestamp > entry.ttl;
        resolve(expired ? null : entry.data);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getStale<T>(key: string): Promise<T | null> {
    // Returns data even if expired — used for offline fallback
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = async () => {
        const row = req.result as { key: string; encrypted: string } | undefined;
        if (!row) return resolve(null);
        const entry = await decryptData<CacheEntry<T>>(row.encrypted);
        resolve(entry?.data ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const complianceCache = new ComplianceCache();
