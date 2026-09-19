// L2 → L3 seam test: replay a real captured Bovada session through the
// BovadaConnector, persist every emitted Hand, and verify query results
// against the known-good hands captured in examples/.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { Hand } from '../model';
import { replayLogFile, parseConcatenatedJson } from '../testing/replay';
import { IndexedDBStore } from './indexeddb_store';

const EXAMPLES_DIR = join(__dirname, '../../examples/hands_and_raw_log');

const HERO_ID = '560201380440500';
const TABLE_ID = '37407996';

describe('replay captured session → IndexedDBStore', () => {
  const store = new IndexedDBStore('integration_test_db');
  let emitted: Hand[] = [];
  let expected: Hand[] = [];

  beforeAll(async () => {
    expected = parseConcatenatedJson<Hand>(
      readFileSync(join(EXAMPLES_DIR, 'hands_object_1.txt'), 'utf8'));
    emitted = replayLogFile(join(EXAMPLES_DIR, 'raw_logs_1.txt'));
    for (const hand of emitted) await store.save(hand);
  });

  it('stores every emitted hand', async () => {
    expect(emitted.length).toBe(expected.length);
    expect(await store.count()).toBe(expected.length);
  });

  it('stored hands match the known-good capture (modulo replay timestamp)', async () => {
    const stored = await store.query();
    for (const want of expected) {
      const got = stored.find(h => h.handId === want.handId);
      expect(got, `hand ${want.handId} missing from store`).toBeDefined();
      const { timestamp: _a, ...gotRest } = got!;
      const { timestamp: _b, ...wantRest } = want;
      expect(gotRest).toEqual(wantRest);
    }
  });

  it('round-trips stored hands identical to emitted hands', async () => {
    const stored = await store.query();
    const byId = new Map(stored.map(h => [h.handId, h]));
    for (const hand of emitted) {
      expect(byId.get(hand.handId)).toEqual(hand);
    }
  });

  it('supports the filters the analysis layer will use', async () => {
    expect(await store.query({ tableId: TABLE_ID })).toHaveLength(expected.length);
    expect(await store.query({ tableId: 'other' })).toHaveLength(0);

    const heroHands = await store.query({ playerId: HERO_ID });
    const expectedHeroHands = expected.filter(h => h.players.some(p => p.playerId === HERO_ID));
    expect(heroHands.map(h => h.handId).sort()).toEqual(
      expectedHeroHands.map(h => h.handId).sort());
  });
});
