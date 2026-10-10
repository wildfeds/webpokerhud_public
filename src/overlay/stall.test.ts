import { describe, it, expect } from 'vitest';
import { stallState, stallMessage, agoLabel, STALL_MID_HAND_MS, STALL_IDLE_MS } from './stall';

describe('stallState', () => {
  it('is quiet until events were ever seen', () => {
    expect(stallState(10 * 60_000, true, false)).toBeNull();
  });

  it('flags a live hand after one quiet minute', () => {
    expect(stallState(STALL_MID_HAND_MS - 1, true, true)).toBeNull();
    expect(stallState(STALL_MID_HAND_MS, true, true)).toEqual({ kind: 'mid_hand', quietMs: STALL_MID_HAND_MS });
  });

  it('flags an idle table only after three quiet minutes', () => {
    expect(stallState(STALL_MID_HAND_MS, false, true)).toBeNull();
    expect(stallState(STALL_IDLE_MS, false, true)).toEqual({ kind: 'idle', quietMs: STALL_IDLE_MS });
  });
});

describe('stallMessage', () => {
  it('tells the player what to do', () => {
    expect(stallMessage({ kind: 'mid_hand', quietMs: 70_000 }))
      .toBe('Capture stalled mid-hand (1 min without events). Reload this table tab to resume.');
    expect(stallMessage({ kind: 'idle', quietMs: 200_000 }))
      .toBe('No table events for 3 min. If the table is still playing, reload this tab to resume capture.');
  });
});

describe('agoLabel', () => {
  const now = 1_800_000_000_000;
  it('rounds to a readable unit', () => {
    expect(agoLabel(now - 10_000, now)).toBe('just now');
    expect(agoLabel(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(agoLabel(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(agoLabel(now - 26 * 3_600_000, now)).toBe('yesterday');
    expect(agoLabel(now - 72 * 3_600_000, now)).toBe('3 days ago');
  });
});
