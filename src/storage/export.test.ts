import { describe, it, expect } from 'vitest';
import { groupHandsByTable, toJsonl } from './export';
import { makeHand } from '../testing/fixtures';

describe('groupHandsByTable', () => {
  it('groups by platform + tableId', () => {
    const hands = [
      makeHand({ handId: '1', tableId: 't1' }),
      makeHand({ handId: '2', tableId: 't2' }),
      makeHand({ handId: '3', tableId: 't1' }),
      makeHand({ handId: '4', tableId: 't1', platform: 'pokerstars' }),
    ];
    const groups = groupHandsByTable(hands);
    expect([...groups.keys()]).toEqual(['bovada_t1', 'bovada_t2', 'pokerstars_t1']);
    expect(groups.get('bovada_t1')!.map(h => h.handId)).toEqual(['1', '3']);
  });

  it('returns an empty map for no hands', () => {
    expect(groupHandsByTable([]).size).toBe(0);
  });
});

describe('toJsonl', () => {
  it('writes one parseable JSON hand per line with trailing newline', () => {
    const hands = [makeHand({ board: ['2h', 'Ks'] }), makeHand()];
    const jsonl = toJsonl(hands);
    expect(jsonl.endsWith('\n')).toBe(true);
    const lines = jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map(l => JSON.parse(l))).toEqual(hands);
  });
});
