import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBStore } from '../storage';
import { makeHand } from '../testing/fixtures';
import { getHeroStats, listTables, listStakeLevels, stakeKey } from './stats_service';

let dbCounter = 0;
let store: IndexedDBStore;

beforeEach(() => {
  store = new IndexedDBStore(`stats_service_db_${dbCounter++}`);
});

const hero = (seat = 1) =>
  ({ seat, playerId: 'hero-id', startStack: 1000, cards: null, isHero: true });
const villain = (seat = 2) =>
  ({ seat, playerId: `v${seat}`, startStack: 1000, cards: null, isHero: false });

describe('stakeKey', () => {
  it('builds a canonical sb/bb key', () => {
    expect(stakeKey({ sb: 5, bb: 10 })).toBe('5/10');
    expect(stakeKey({ sb: 25, bb: 50 })).toBe('25/50');
  });
});

describe('getHeroStats', () => {
  it('derives the hero id from stored hands and computes stats', async () => {
    await store.save(makeHand({ players: [hero(), villain()] }));
    await store.save(makeHand({ players: [hero(), villain()] }));
    const stats = await getHeroStats(store);
    expect(stats?.playerId).toBe('hero-id');
    expect(stats?.handsPlayed).toBe(2);
  });

  it('filters by table', async () => {
    await store.save(makeHand({ tableId: 't1', timestamp: 1, players: [hero(), villain()] }));
    await store.save(makeHand({ tableId: 't2', timestamp: 2, players: [hero(), villain()] }));
    expect((await getHeroStats(store, { tableId: 't1' }))?.handsPlayed).toBe(1);
    expect((await getHeroStats(store))?.handsPlayed).toBe(2);
  });

  it('filters by stake level', async () => {
    await store.save(makeHand({ timestamp: 1, stakes: { sb: 5, bb: 10 }, players: [hero(), villain()] }));
    await store.save(makeHand({ timestamp: 2, stakes: { sb: 25, bb: 50 }, players: [hero(), villain()] }));
    expect((await getHeroStats(store, { stakeLevel: '5/10' }))?.handsPlayed).toBe(1);
    expect((await getHeroStats(store, { stakeLevel: '25/50' }))?.handsPlayed).toBe(1);
  });

  it('filters by time window', async () => {
    await store.save(makeHand({ handId: 'old', timestamp: 1000, players: [hero(), villain()] }));
    await store.save(makeHand({ handId: 'new', timestamp: 5000, players: [hero(), villain()] }));
    expect((await getHeroStats(store, { fromTime: 3000 }))?.handsPlayed).toBe(1);
    expect((await getHeroStats(store, { toTime: 3000 }))?.handsPlayed).toBe(1);
  });

  it('combines stake level and time window', async () => {
    await store.save(makeHand({ handId: 'a', timestamp: 1000, stakes: { sb: 5, bb: 10 }, players: [hero(), villain()] }));
    await store.save(makeHand({ handId: 'b', timestamp: 5000, stakes: { sb: 5, bb: 10 }, players: [hero(), villain()] }));
    await store.save(makeHand({ handId: 'c', timestamp: 5000, stakes: { sb: 25, bb: 50 }, players: [hero(), villain()] }));
    const stats = await getHeroStats(store, { stakeLevel: '5/10', fromTime: 3000 });
    expect(stats?.handsPlayed).toBe(1); // only 'b'
  });

  it('returns null for an empty store or when no hero was dealt in', async () => {
    expect(await getHeroStats(store)).toBeNull();
    await store.save(makeHand({ players: [villain(2), villain(3)] }));
    expect(await getHeroStats(store)).toBeNull();
  });
});

describe('listTables', () => {
  it('groups hand counts per table with the latest stakes and level', async () => {
    await store.save(makeHand({ tableId: 't1', timestamp: 1, stakes: { sb: 5, bb: 10 } }));
    await store.save(makeHand({ tableId: 't1', timestamp: 3, stakes: { sb: 10, bb: 25 } }));
    await store.save(makeHand({ tableId: 't2', timestamp: 2, stakes: { sb: 5, bb: 10 } }));
    const tables = await listTables(store);
    expect(tables).toEqual([
      { tableId: 't1', hands: 2, level: '10/25', stakes: { sb: 10, bb: 25 } },
      { tableId: 't2', hands: 1, level: '5/10', stakes: { sb: 5, bb: 10 } },
    ]);
  });

  it('honors a time filter', async () => {
    await store.save(makeHand({ tableId: 't1', timestamp: 1000 }));
    await store.save(makeHand({ tableId: 't2', timestamp: 5000 }));
    const tables = await listTables(store, { fromTime: 3000 });
    expect(tables.map(t => t.tableId)).toEqual(['t2']);
  });

  it('returns an empty list for an empty store', async () => {
    expect(await listTables(store)).toEqual([]);
  });
});

describe('listStakeLevels', () => {
  it('groups hand counts per blind level', async () => {
    await store.save(makeHand({ handId: 'a', timestamp: 1, tableId: 't1', stakes: { sb: 5, bb: 10 } }));
    await store.save(makeHand({ handId: 'b', timestamp: 2, tableId: 't2', stakes: { sb: 5, bb: 10 } }));
    await store.save(makeHand({ handId: 'c', timestamp: 3, tableId: 't3', stakes: { sb: 25, bb: 50 } }));
    const levels = await listStakeLevels(store);
    expect(levels).toEqual([
      { level: '5/10', sb: 5, bb: 10, hands: 2 },
      { level: '25/50', sb: 25, bb: 50, hands: 1 },
    ]);
  });

  it('honors a table filter (levels seen at that table)', async () => {
    await store.save(makeHand({ handId: 'a', tableId: 't1', stakes: { sb: 5, bb: 10 } }));
    await store.save(makeHand({ handId: 'b', tableId: 't2', stakes: { sb: 25, bb: 50 } }));
    const levels = await listStakeLevels(store, { tableId: 't1' });
    expect(levels.map(l => l.level)).toEqual(['5/10']);
  });

  it('returns an empty list for an empty store', async () => {
    expect(await listStakeLevels(store)).toEqual([]);
  });
});

