// Regression tests for CO_SELECT_INFO / CO_BLIND_INFO / CO_RESULT_INFO /
// CO_CHIPTABLE_INFO decoding, pinned to chip-accounting ground truths derived
// by hand from the stack deltas in raw_logs_1.txt.
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { Hand, ActionType, Street } from '../../model';
import { decodeOccupiedSeats } from './bovada_parser';
import { replayLogFile } from '../../testing/replay';

const LOG = join(__dirname, '../../../examples/hands_and_raw_log/raw_logs_1.txt');
const HERO_ID = '560201380440500';

let byId: Map<string, Hand>;

beforeAll(() => {
  const hands = replayLogFile(LOG);
  byId = new Map(hands.map(h => [h.handId, h]));
  expect(hands).toHaveLength(6);
});

function actionsOf(handId: string, seat: number, street?: Street) {
  return byId.get(handId)!.actions
    .filter(a => a.seat === seat && (street === undefined || a.street === street));
}

describe('action decoding (hand 4904181657)', () => {
  // Raw: seat 3 btn 512 bet 10 raise 45, stack 1884→1839 — raise-to 45
  it('records preflop open-raise with the full raise-to amount', () => {
    const [raise] = actionsOf('4904181657', 3, Street.PREFLOP);
    expect(raise).toMatchObject({ type: ActionType.RAISE, amount: 45, totalStreetBet: 45, stackAfter: 1839 });
  });

  // Raw: seat 3 btn 128 bet 110, stack 1839→1729 — a lead bet, not a call
  it('records btn 128 as BET', () => {
    const [bet] = actionsOf('4904181657', 3, Street.FLOP);
    expect(bet).toMatchObject({ type: ActionType.BET, amount: 110, stackAfter: 1729 });
  });

  // Raw: seat 4 (hero) btn 8 bet 10, stack 1000→990 — dead blind is 10, not sb 5
  it('records dead-blind post with the actual posted amount', () => {
    const [post] = actionsOf('4904181657', 4, Street.POSTING_BLINDS);
    expect(post.amount).toBe(10);
    expect(post.stackAfter).toBe(990);
  });

  it('tracks hero startStack across the CO_RESULT_INFO boundary', () => {
    const hero = byId.get('4904181657')!.players.find(p => p.isHero)!;
    expect(hero.playerId).toBe(HERO_ID);
    expect(hero.startStack).toBe(1000); // fresh 1000 buy-in
    // next hand: hero lost the 10 dead blind
    expect(byId.get('4904181855')!.players.find(p => p.isHero)!.startStack).toBe(990);
  });

  // Winner raised 45 + bet 110 (uncalled, returned): potWon is the pot award
  // only; netWon is the true stack delta 1884→1949
  it('computes netWon as stack delta, not potWon - invested', () => {
    expect(byId.get('4904181657')!.results).toEqual([
      { seat: 3, playerId: 'bovada:37407996:3', potWon: 110, netWon: 65 },
    ]);
  });
});

describe('action decoding (hand 4904181855)', () => {
  // Raw: seat 1 btn 256 bet 5, stack 970→965 — SB completing the limp
  it('records SB-complete as CALL 5 (bet field is chips added)', () => {
    const [complete] = actionsOf('4904181855', 1, Street.PREFLOP);
    expect(complete).toMatchObject({ type: ActionType.CALL, amount: 5, totalStreetBet: 10 });
  });

  // Raw: seat 1 check-raises turn to 252 (936→684), seat 3 calls 168 (1826→1658)
  it('records turn check-raise and call amounts from stack deltas', () => {
    const turn = byId.get('4904181855')!.actions.filter(a => a.street === Street.TURN);
    expect(turn.map(a => [a.seat, a.type, a.amount])).toEqual([
      [1, ActionType.CHECK, 0],
      [3, ActionType.BET, 84],
      [1, ActionType.RAISE, 252],
      [3, ActionType.CALL, 168],
    ]);
  });

  // Winner invested 291 (5+5+29+252), won 563 from a 592 pot (rake 29):
  // net = 1247 − 975 = 272
  it('closes the chip accounting on a showdown hand', () => {
    const hand = byId.get('4904181855')!;
    expect(hand.totalPot).toBe(592);
    expect(hand.rake).toBe(29);
    expect(hand.results).toEqual([
      { seat: 1, playerId: 'bovada:37407996:1', potWon: 563, netWon: 272 },
    ]);
  });
});

describe('decodeOccupiedSeats', () => {
  it('treats 16/80 as occupied and 0/32 as empty (join-capture ground truth)', () => {
    // The seatState array from raw_logs_1.txt's CO_TABLE_INFO.
    expect(decodeOccupiedSeats([16, 80, 80, 0, 80, 80, 0, 0, 0])).toEqual([1, 2, 3, 5, 6]);
    expect(decodeOccupiedSeats([32, 16, 32])).toEqual([2]);
    expect(decodeOccupiedSeats(undefined)).toEqual([]);
  });
});

describe('cross-hand invariants', () => {
  // CO_OPTION_INFO ("maxSeat":9) arrives once at join, so every hand carrying
  // it proves both the decode and the across-hands carry-over.
  it('records the table size from CO_OPTION_INFO on every hand', () => {
    for (const hand of byId.values()) {
      expect(hand.maxSeats, `hand ${hand.handId}`).toBe(9);
    }
  });

  it('totalPot === rake + sum(potWon) for every hand', () => {
    for (const hand of byId.values()) {
      const awarded = hand.results.reduce((sum, r) => sum + r.potWon, 0);
      expect(hand.totalPot, `hand ${hand.handId}`).toBe(hand.rake + awarded);
    }
  });

  it('decodes the BB walk (hand 4904182471): BB wins blinds, hero folded SB', () => {
    expect(byId.get('4904182471')!.results).toEqual([
      { seat: 5, playerId: 'bovada:37407996:5', potWon: 15, netWon: 5 },
    ]);
    const heroActions = actionsOf('4904182471', 4);
    expect(heroActions.map(a => a.type)).toEqual([ActionType.POST_SB, ActionType.FOLD]);
    expect(heroActions[0]!.amount).toBe(5);
  });
});
