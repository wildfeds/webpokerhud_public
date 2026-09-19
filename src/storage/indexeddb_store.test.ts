import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBStore } from './indexeddb_store';
import { makeHand } from '../testing/fixtures';

let dbCounter = 0;
let store: IndexedDBStore;

beforeEach(() => {
  // Fresh database per test — fake-indexeddb persists per name within a run
  store = new IndexedDBStore(`test_db_${dbCounter++}`);
});

describe('IndexedDBStore.save', () => {
  it('round-trips a Hand unchanged', async () => {
    const hand = makeHand({
      players: [{ seat: 4, playerId: 'hero', startStack: 1000, cards: ['Ah', 'Kd'], isHero: true }],
      actions: [],
      board: ['2h', 'Ks', 'Tc'],
      results: [{ seat: 4, playerId: 'hero', potWon: 100, netWon: 60 }],
    });
    await store.save(hand);
    const [loaded] = await store.query();
    expect(loaded).toEqual(hand);
  });

  it('is idempotent on (platform, handId)', async () => {
    const hand = makeHand({ handId: 'dup' });
    await store.save(hand);
    await store.save({ ...hand, totalPot: 999 });
    const hands = await store.query();
    expect(hands).toHaveLength(1);
    expect(hands[0]!.totalPot).toBe(999); // upsert keeps latest version
  });

  it('keeps same handId on different platforms distinct', async () => {
    await store.save(makeHand({ handId: 'x', platform: 'bovada' }));
    await store.save(makeHand({ handId: 'x', platform: 'pokerstars' }));
    expect(await store.count()).toBe(2);
  });
});

describe('IndexedDBStore.query', () => {
  beforeEach(async () => {
    await store.save(makeHand({ handId: 'a', tableId: 't1', timestamp: 100 }));
    await store.save(makeHand({ handId: 'b', tableId: 't1', timestamp: 200,
      players: [{ seat: 1, playerId: 'p1', startStack: 500, cards: null, isHero: false }] }));
    await store.save(makeHand({ handId: 'c', tableId: 't2', timestamp: 300 }));
  });

  it('returns all hands sorted by timestamp when unfiltered', async () => {
    const hands = await store.query();
    expect(hands.map(h => h.handId)).toEqual(['a', 'b', 'c']);
  });

  it('filters by tableId', async () => {
    const hands = await store.query({ tableId: 't1' });
    expect(hands.map(h => h.handId)).toEqual(['a', 'b']);
  });

  it('filters by platform', async () => {
    expect(await store.query({ platform: 'bovada' })).toHaveLength(3);
    expect(await store.query({ platform: 'pokerstars' })).toHaveLength(0);
  });

  it('filters by inclusive time range', async () => {
    expect((await store.query({ fromTime: 200 })).map(h => h.handId)).toEqual(['b', 'c']);
    expect((await store.query({ toTime: 200 })).map(h => h.handId)).toEqual(['a', 'b']);
    expect((await store.query({ fromTime: 150, toTime: 250 })).map(h => h.handId)).toEqual(['b']);
  });

  it('filters by playerId', async () => {
    const hands = await store.query({ playerId: 'p1' });
    expect(hands.map(h => h.handId)).toEqual(['b']);
  });

  it('applies limit after all other filters', async () => {
    const hands = await store.query({ tableId: 't1', limit: 1 });
    expect(hands.map(h => h.handId)).toEqual(['a']);
  });

  it('combines filters', async () => {
    const hands = await store.query({ tableId: 't1', fromTime: 150 });
    expect(hands.map(h => h.handId)).toEqual(['b']);
  });
});

describe('IndexedDBStore.count', () => {
  it('matches query results and ignores limit', async () => {
    await store.save(makeHand({ tableId: 't1', timestamp: 1 }));
    await store.save(makeHand({ tableId: 't1', timestamp: 2 }));
    await store.save(makeHand({ tableId: 't2', timestamp: 3 }));
    expect(await store.count()).toBe(3);
    expect(await store.count({ tableId: 't1' })).toBe(2);
    expect(await store.count({ tableId: 't1', limit: 1 })).toBe(2);
  });

  it('is 0 for an empty store', async () => {
    expect(await store.count()).toBe(0);
  });
});
