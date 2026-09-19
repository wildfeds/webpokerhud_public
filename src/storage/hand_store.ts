import { Hand } from '../model';

export interface QueryFilters {
  platform?: string;
  tableId?:  string;
  playerId?: string;   // hands where this player was dealt in
  fromTime?: number;   // inclusive, Unix ms
  toTime?:   number;   // inclusive, Unix ms
  limit?:    number;
}

// Storage-backend interface for completed hands. Callers (background worker,
// analysis layer) depend only on this — backends (IndexedDB now, SQLite/remote
// DB later) are interchangeable.
export interface HandStore {
  // Idempotent upsert keyed by (platform, handId).
  save(hand: Hand): Promise<void>;
  // Matching hands sorted by timestamp ascending.
  query(filters?: QueryFilters): Promise<Hand[]>;
  // Number of matching hands; ignores `limit`.
  count(filters?: QueryFilters): Promise<number>;
}
