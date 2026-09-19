import { describe, it, expect } from 'vitest';
import { ActionType, Street } from '../model';
import { makeHand } from '../testing/fixtures';
import { computeNetSeries, netWonInHand, uncalledRefund } from './hero_stats';

const HERO = 'hero';
const V1 = 'villain';

function act(playerId: string, type: ActionType, amount: number, street: Street) {
  const seat = playerId === HERO ? 1 : 2;
  return { seat, playerId, type, amount, street, totalStreetBet: amount, stackAfter: 1000 };
}

function player(playerId: string) {
  const seat = playerId === HERO ? 1 : 2;
  return { seat, playerId, startStack: 1000, cards: null, isHero: playerId === HERO };
}

describe('computeNetSeries', () => {
  it('accumulates per-hand net in play order', () => {
    const hands = [
      // win +15 (netWon authoritative)
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.RAISE, 30, Street.PREFLOP),
      ], results: [{ seat: 1, playerId: HERO, potWon: 45, netWon: 15 }] }),
      // lose the 10 blind
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.POST_BB, 10, Street.POSTING_BLINDS),
        act(HERO, ActionType.FOLD, 0, Street.PREFLOP),
      ], results: [{ seat: 2, playerId: V1, potWon: 20, netWon: 10 }] }),
      // win +40
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.CALL, 10, Street.PREFLOP),
      ], results: [{ seat: 1, playerId: HERO, potWon: 80, netWon: 40 }] }),
    ];
    expect(computeNetSeries(hands, HERO)).toEqual([15, 5, 45]);
  });

  it('skips hands where the player was not dealt in', () => {
    const hands = [
      makeHand({ players: [player(V1)], actions: [], results: [] }),
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.CALL, 10, Street.PREFLOP),
      ], results: [{ seat: 1, playerId: HERO, potWon: 20, netWon: 10 }] }),
    ];
    expect(computeNetSeries(hands, HERO)).toEqual([10]);
  });

  it('returns an empty series when the player never appears', () => {
    expect(computeNetSeries([makeHand({ players: [player(V1)] })], HERO)).toEqual([]);
  });
});

describe('uncalled all-in refund (losers)', () => {
  // Hero shoves 200; villain can only call 150 (all-in) and wins. Hero's
  // uncalled 50 comes back — the true loss is 150, not 200.
  const calledForLess = makeHand({
    players: [player(HERO), player(V1)],
    actions: [
      { ...act(HERO, ActionType.ALL_IN, 200, Street.PREFLOP), totalStreetBet: 200 },
      { ...act(V1, ActionType.ALL_IN, 150, Street.PREFLOP), totalStreetBet: 150 },
    ],
    results: [{ seat: 2, playerId: V1, potWon: 300, netWon: 150 }],
  });

  it('caps the loss at what the opponent matched', () => {
    expect(uncalledRefund(calledForLess, HERO)).toBe(50);
    expect(netWonInHand(calledForLess, HERO)).toBe(-150);
  });

  it('handles a multi-street hand: earlier matched streets stay fully lost', () => {
    // 50 each preflop; flop hero shoves 300 more, villain calls 200 all-in.
    const hand = makeHand({
      players: [player(HERO), player(V1)],
      actions: [
        act(HERO, ActionType.RAISE, 50, Street.PREFLOP),
        act(V1, ActionType.CALL, 50, Street.PREFLOP),
        { ...act(HERO, ActionType.ALL_IN, 300, Street.FLOP), totalStreetBet: 300 },
        { ...act(V1, ActionType.ALL_IN, 200, Street.FLOP), totalStreetBet: 200 },
      ],
      results: [{ seat: 2, playerId: V1, potWon: 500, netWon: 250 }],
    });
    expect(uncalledRefund(hand, HERO)).toBe(100);
    expect(netWonInHand(hand, HERO)).toBe(-250);   // 50 preflop + 200 matched
  });

  it('no refund without an all-in: a plain loss stays the full invested amount', () => {
    const hand = makeHand({
      players: [player(HERO), player(V1)],
      actions: [act(HERO, ActionType.CALL, 30, Street.PREFLOP)],
      results: [{ seat: 2, playerId: V1, potWon: 60, netWon: 30 }],
    });
    expect(uncalledRefund(hand, HERO)).toBe(0);
    expect(netWonInHand(hand, HERO)).toBe(-30);
  });

  it('no refund when the hero was the one called for less', () => {
    // Villain shoves 200, hero calls all-in for 150 and loses: full 150 lost.
    const hand = makeHand({
      players: [player(HERO), player(V1)],
      actions: [
        { ...act(V1, ActionType.ALL_IN, 200, Street.PREFLOP), totalStreetBet: 200 },
        { ...act(HERO, ActionType.ALL_IN, 150, Street.PREFLOP), totalStreetBet: 150 },
      ],
      results: [{ seat: 2, playerId: V1, potWon: 300, netWon: 100 }],
    });
    expect(uncalledRefund(hand, HERO)).toBe(0);
    expect(netWonInHand(hand, HERO)).toBe(-150);
  });
});
