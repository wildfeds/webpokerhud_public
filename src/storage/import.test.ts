import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { parseHandsJsonl, validateHand, importHandsJsonl } from './import';
import { toJsonl } from './export';
import { IndexedDBStore } from './indexeddb_store';
import { makeHand } from '../testing/fixtures';

describe('validateHand', () => {
  it('accepts a well-formed hand', () => {
    expect(validateHand(makeHand())).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validateHand(null)).toBe('not an object');
    expect(validateHand(42)).toBe('not an object');
  });

  it('names the first missing scalar field', () => {
    const { handId, ...rest } = makeHand();
    void handId;
    expect(validateHand(rest)).toBe('missing handId');
  });

  it('rejects malformed stakes', () => {
    expect(validateHand({ ...makeHand(), stakes: { sb: 5 } })).toBe('missing stakes');
  });

  it('rejects a non-array players field', () => {
    expect(validateHand({ ...makeHand(), players: 'nope' })).toBe('missing players');
  });

  it('rejects a malformed player entry', () => {
    const hand = makeHand({ players: [{ seat: 1, playerId: 'x' } as any] });
    expect(validateHand(hand)).toBe('malformed player');
  });
});

describe('parseHandsJsonl', () => {
  it('round-trips a toJsonl export', () => {
    const hands = [
      makeHand({ handId: 'a', board: ['2h', 'Ks'] }),
      makeHand({ handId: 'b' }),
    ];
    const { hands: parsed, errors } = parseHandsJsonl(toJsonl(hands));
    expect(errors).toEqual([]);
    expect(parsed).toEqual(hands);
  });

  it('tolerates blank lines and reports bad ones by line number', () => {
    const good = JSON.stringify(makeHand({ handId: 'ok' }));
    const text = `${good}\n\nnot json\n{"handId":"x"}\n`;
    const { hands, errors } = parseHandsJsonl(text);
    expect(hands.map(h => h.handId)).toEqual(['ok']);
    expect(errors).toEqual(['line 3: invalid JSON', 'line 4: missing tableId']);
  });
});

describe('importHandsJsonl', () => {
  it('saves valid hands and is idempotent on re-import', async () => {
    const store = new IndexedDBStore(`import-test-${Date.now()}`);
    const jsonl = toJsonl([makeHand({ handId: '1' }), makeHand({ handId: '2' })]);

    const first = await importHandsJsonl(store, jsonl);
    expect(first.imported).toBe(2);
    expect(first.skipped).toBe(0);
    expect(await store.count()).toBe(2);

    // Re-importing the same file upserts, not duplicates.
    await importHandsJsonl(store, jsonl);
    expect(await store.count()).toBe(2);
  });

  it('reports skipped lines without aborting the good ones', async () => {
    const store = new IndexedDBStore(`import-test-skip-${Date.now()}`);
    const text = `${JSON.stringify(makeHand({ handId: 'ok' }))}\ngarbage\n`;
    const res = await importHandsJsonl(store, text);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(await store.count()).toBe(1);
  });
});
