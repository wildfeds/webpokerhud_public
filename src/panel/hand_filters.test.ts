import { describe, it, expect } from 'vitest';
import { HandSummary } from '../analysis';
import {
  applyHandFilters, defaultHandFilters, presetFilters, activePreset,
  BIG_POT_BB, PRESET_LABELS, HandPreset,
} from './hand_filters';

let nextId = 0;
function summary(overrides: Partial<HandSummary> = {}): HandSummary {
  return {
    handId: String(++nextId), tableId: 't1', timestamp: nextId * 1000,
    level: '5/10', sb: 5, bb: 10, position: 'BTN', heroCards: [], board: [],
    net: 0, won: false, streetReached: 'flop', wasPfa: false,
    threeBetPot: false, sawShowdown: false, potBb: 5, holeKey: null,
    ...overrides,
  };
}

describe('applyHandFilters — sorting (50)', () => {
  const hands = [
    summary({ handId: 'a', potBb: 12, net: -300 }),
    summary({ handId: 'b', potBb: 80, net: 4000 }),
    summary({ handId: 'c', potBb: 45, net: -2500 }),
  ];

  it('keeps incoming (newest-first) order by default and never mutates input', () => {
    const out = applyHandFilters(hands, defaultHandFilters(), null);
    expect(out.map(h => h.handId)).toEqual(['a', 'b', 'c']);
    expect(out).not.toBe(hands);
    out.reverse();
    expect(hands[0]!.handId).toBe('a');
  });

  it('sorts by pot, win, and loss', () => {
    const by = (sort: 'pot' | 'win' | 'loss') =>
      applyHandFilters(hands, { ...defaultHandFilters(), sort }, null).map(h => h.handId);
    expect(by('pot')).toEqual(['b', 'c', 'a']);    // pot desc
    expect(by('win')).toEqual(['b', 'a', 'c']);    // net desc
    expect(by('loss')).toEqual(['c', 'a', 'b']);   // net asc
  });
});

describe('applyHandFilters — big-pot threshold', () => {
  it(`the 'big' bucket starts at ${BIG_POT_BB}bb`, () => {
    const hands = [
      summary({ handId: 'small', potBb: 9 }),
      summary({ handId: 'mid', potBb: BIG_POT_BB - 1 }),
      summary({ handId: 'edge', potBb: BIG_POT_BB }),
      summary({ handId: 'huge', potBb: 120 }),
    ];
    const big = applyHandFilters(hands, { ...defaultHandFilters(), pot: 'big' }, null);
    expect(big.map(h => h.handId)).toEqual(['edge', 'huge']);
    const mid = applyHandFilters(hands, { ...defaultHandFilters(), pot: 'mid' }, null);
    expect(mid.map(h => h.handId)).toEqual(['mid']);
  });
});

describe('presets', () => {
  const hands = [
    summary({ handId: 'smallWin', potBb: 8, net: 50 }),
    summary({ handId: 'bigLoss', potBb: 90, net: -5000 }),
    summary({ handId: 'bigWin', potBb: 70, net: 6000 }),
    summary({ handId: 'breakEven', potBb: 40, net: 0 }),
  ];

  it('bigPots: 30bb+ sorted by pot desc', () => {
    const out = applyHandFilters(hands, presetFilters('bigPots'), null);
    expect(out.map(h => h.handId)).toEqual(['bigLoss', 'bigWin', 'breakEven']);
  });

  it('bigWins: winners only, biggest first', () => {
    const out = applyHandFilters(hands, presetFilters('bigWins'), null);
    expect(out.map(h => h.handId)).toEqual(['bigWin', 'smallWin']);
  });

  it('bigLosses: losers only, biggest loss first', () => {
    const out = applyHandFilters(hands, presetFilters('bigLosses'), null);
    expect(out.map(h => h.handId)).toEqual(['bigLoss']);
  });

  it('activePreset recognises exact preset states and nothing else', () => {
    for (const p of Object.keys(PRESET_LABELS) as HandPreset[]) {
      expect(activePreset(presetFilters(p))).toBe(p);
    }
    expect(activePreset(defaultHandFilters())).toBeNull();
    expect(activePreset({ ...presetFilters('bigPots'), position: 'BTN' })).toBeNull();
  });
});

describe('applyHandFilters — existing line filters still compose', () => {
  it('combines a filter with a sort', () => {
    const hands = [
      summary({ handId: 'x', position: 'BTN', potBb: 50 }),
      summary({ handId: 'y', position: 'BB', potBb: 90 }),
      summary({ handId: 'z', position: 'BTN', potBb: 80 }),
    ];
    const out = applyHandFilters(
      hands, { ...defaultHandFilters(), position: 'BTN', sort: 'pot' }, null);
    expect(out.map(h => h.handId)).toEqual(['z', 'x']);
  });
});
