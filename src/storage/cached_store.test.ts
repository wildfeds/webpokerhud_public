import { describe, it, expect } from 'vitest';
import { Hand } from '../model';
import { makeHand } from '../testing/fixtures';
import { HandStore, QueryFilters } from './hand_store';
import { CachedHandStore } from './cached_store';

// Minimal inner store that counts how often it is actually read.
class CountingStore implements HandStore {
  reads = 0;
  constructor(private hands: Hand[]) {}
  async save(hand: Hand): Promise<void> { this.hands = [...this.hands, hand]; }
  async query(_filters?: QueryFilters): Promise<Hand[]> { this.reads++; return [...this.hands]; }
  async count(): Promise<number> { return this.hands.length; }
}

function hero(seat = 1) {
  return { seat, playerId: 'hero', startStack: 1000, cards: null, isHero: true };
}

const h1 = makeHand({ handId: 'a', tableId: 't1', timestamp: 100, players: [hero()] });
const h2 = makeHand({ handId: 'b', tableId: 't2', timestamp: 200, players: [] });
const h3 = makeHand({ handId: 'c', tableId: 't1', timestamp: 300, players: [hero()] });

describe('CachedHandStore', () => {
  it('reads the backing store once across many queries', async () => {
    const inner = new CountingStore([h1, h2, h3]);
    const store = new CachedHandStore(inner);
    await store.query({});
    await store.query({ tableId: 't1' });
    await store.query({ fromTime: 150 });
    await store.count({});
    expect(inner.reads).toBe(1);
  });

  it('applies every QueryFilters field in memory', async () => {
    const store = new CachedHandStore(new CountingStore([h1, h2, h3]));
    expect((await store.query({ tableId: 't1' })).map(h => h.handId)).toEqual(['a', 'c']);
    expect((await store.query({ playerId: 'hero' })).map(h => h.handId)).toEqual(['a', 'c']);
    expect((await store.query({ fromTime: 150, toTime: 250 })).map(h => h.handId)).toEqual(['b']);
    expect((await store.query({ limit: 2 })).map(h => h.handId)).toEqual(['a', 'b']);
    expect(await store.count({ tableId: 't2' })).toBe(1);
  });

  it('invalidates on save and serves the fresh list', async () => {
    const inner = new CountingStore([h1]);
    const store = new CachedHandStore(inner);
    expect((await store.query({})).length).toBe(1);
    await store.save(h2);
    expect((await store.query({})).length).toBe(2);
    expect(inner.reads).toBe(2);   // one before, one after the invalidation
  });

  it('hands out copies, not the cache array itself', async () => {
    const store = new CachedHandStore(new CountingStore([h1, h2]));
    const a = await store.query({});
    a.pop();
    expect((await store.query({})).length).toBe(2);
  });
});
