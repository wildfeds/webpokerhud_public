import { Hand } from '../model';
import { HandStore, QueryFilters } from './hand_store';

const DB_VERSION  = 1;
const STORE_NAME  = 'hands';

// IndexedDB-backed HandStore for the Chrome extension.
// Hands are stored as-is with keyPath [platform, handId]; the timestamp index
// drives all queries so results come back in chronological order.
export class IndexedDBStore implements HandStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // The database name predates the rebrand; renaming it would orphan every
  // user's stored hands, so it stays.
  constructor(private readonly dbName = 'bovada_hud') {}

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, DB_VERSION);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE_NAME, {
            keyPath: ['platform', 'handId'],
          });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('tableId', 'tableId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async save(hand: Hand): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(hand);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async query(filters: QueryFilters = {}): Promise<Hand[]> {
    const { limit } = filters;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const results: Hand[] = [];
      const index = db.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .index('timestamp');
      const req = index.openCursor(timeRange(filters));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || (limit !== undefined && results.length >= limit)) {
          resolve(results);
          return;
        }
        const hand = cursor.value as Hand;
        if (matches(hand, filters)) results.push(hand);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async count(filters: QueryFilters = {}): Promise<number> {
    const hands = await this.query({ ...filters, limit: undefined });
    return hands.length;
  }
}

function timeRange({ fromTime, toTime }: QueryFilters): IDBKeyRange | null {
  if (fromTime !== undefined && toTime !== undefined) return IDBKeyRange.bound(fromTime, toTime);
  if (fromTime !== undefined) return IDBKeyRange.lowerBound(fromTime);
  if (toTime   !== undefined) return IDBKeyRange.upperBound(toTime);
  return null;
}

// Filters not covered by the timestamp range are applied in memory — fine at
// Phase 1 volumes (< 5 KB per hand); revisit with dedicated indexes if needed.
function matches(hand: Hand, f: QueryFilters): boolean {
  if (f.platform !== undefined && hand.platform !== f.platform) return false;
  if (f.tableId  !== undefined && hand.tableId  !== f.tableId)  return false;
  if (f.playerId !== undefined && !hand.players.some(p => p.playerId === f.playerId)) return false;
  return true;
}
