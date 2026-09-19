import { describe, it, expect } from 'vitest';
import { ActionType, Street } from '../model';
import { makeHand } from '../testing/fixtures';
import { computeSeatSessionStats, SESSION_GAP_MS } from './seat_stats';

const TABLE = 'table-1';

function player(seat: number, startStack = 1000) {
  return { seat, playerId: `bovada:${TABLE}:${seat}`, startStack, cards: null, isHero: false };
}

function act(seat: number, type: ActionType, amount: number, street = Street.PREFLOP) {
  return { seat, playerId: `bovada:${TABLE}:${seat}`, type, amount,
    totalStreetBet: amount, street, stackAfter: 0 };
}

// Seat 2 raises, seat 3 calls, each hand; net results omitted (both "lose" what
// they put in, keeping expected stacks predictable via netWonInHand).
function hand(timestamp: number, stacks: Record<number, number> = {}) {
  return makeHand({
    timestamp, tableId: TABLE,
    players: [player(2, stacks[2] ?? 1000), player(3, stacks[3] ?? 1000)],
    actions: [act(2, ActionType.RAISE, 30), act(3, ActionType.CALL, 30)],
    results: [],
  });
}

describe('computeSeatSessionStats', () => {
  it('computes per-seat vpip/pfr/af over the current session', () => {
    // Both hands: seat 2 raised (vpip+pfr), seat 3 called (vpip only).
    const rows = computeSeatSessionStats(
      [hand(0, {}), hand(60_000, { 2: 970, 3: 970 })], TABLE);
    expect(rows.map(r => r.seat)).toEqual([2, 3]);
    expect(rows[0]).toMatchObject({ hands: 2, vpip: 100, pfr: 100 });
    expect(rows[1]).toMatchObject({ hands: 2, vpip: 100, pfr: 0 });
    expect(rows[1]!.af).toBe(0);   // only calls
  });

  it('only counts the trailing session', () => {
    const old = hand(0);
    const recent = hand(SESSION_GAP_MS + 60_000);   // idle gap before this one
    const rows = computeSeatSessionStats([old, recent], TABLE);
    expect(rows[0]!.hands).toBe(1);
  });

  it('resets a seat when its stack does not follow from the previous hand', () => {
    // Seat 2 lost 30 in hand 1 (expected 970) but shows up with 2000 → new occupant.
    const rows = computeSeatSessionStats(
      [hand(0), hand(60_000, { 2: 2000, 3: 970 })], TABLE);
    expect(rows.find(r => r.seat === 2)!.hands).toBe(1);   // window reset
    expect(rows.find(r => r.seat === 3)!.hands).toBe(2);   // continuous
  });

  it('ignores hands from other tables', () => {
    const other = makeHand({ tableId: 'elsewhere', players: [player(2)], actions: [] });
    expect(computeSeatSessionStats([other], TABLE)).toEqual([]);
  });
});
