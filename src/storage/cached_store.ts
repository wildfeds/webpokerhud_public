// In-memory read cache over any HandStore. The stats layer issues many
// queries per view; without this each one deserialises the entire history
// from IndexedDB. The full timestamp-ascending list is loaded once and every
// query is answered by in-memory filtering; any write invalidates it.
//
// Callers must treat returned Hand objects as immutable (they are shared with
// the cache). Correctness note: the cache lives only as long as the service
// worker, so a restart simply reloads from the backing store.
import { Hand } from '../model';
import { HandStore, QueryFilters } from './hand_store';

export class CachedHandStore implements HandStore {
  private hands: Hand[] | null = null;

  constructor(private readonly inner: HandStore) {}

  async save(hand: Hand): Promise<void> {
    await this.inner.save(hand);
    this.hands = null;   // upsert may replace or reorder — reload lazily
  }

  async query(filters: QueryFilters = {}): Promise<Hand[]> {
    if (this.hands === null) this.hands = await this.inner.query({});
    let result: Hand[] = this.hands;
    const { platform, tableId, playerId, fromTime, toTime, limit } = filters;
    if (platform !== undefined) result = result.filter(h => h.platform === platform);
    if (tableId !== undefined)  result = result.filter(h => h.tableId === tableId);
    if (playerId !== undefined) result = result.filter(h => h.players.some(p => p.playerId === playerId));
    if (fromTime !== undefined) result = result.filter(h => h.timestamp >= fromTime);
    if (toTime !== undefined)   result = result.filter(h => h.timestamp <= toTime);
    if (limit !== undefined)    result = result.slice(0, limit);
    // Never hand out the cache array itself — callers may sort/splice a copy.
    return result === this.hands ? [...result] : result;
  }

  async count(filters: QueryFilters = {}): Promise<number> {
    const { limit: _ignored, ...rest } = filters;   // count ignores limit
    return (await this.query(rest)).length;
  }
}
