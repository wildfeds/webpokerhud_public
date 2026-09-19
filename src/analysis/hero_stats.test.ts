import { describe, it, expect } from 'vitest';
import { Action, ActionType, Card, Street } from '../model';
import { makeHand } from '../testing/fixtures';
import { computeHeroStats, computePlayerStats } from './hero_stats';

const HERO = 'hero';
const V1 = 'villain1';
const V2 = 'villain2';

function act(
  playerId: string, type: ActionType, amount: number, street: Street,
  totalStreetBet = amount,
): Action {
  const seat = playerId === HERO ? 1 : playerId === V1 ? 2 : 3;
  return { seat, playerId, type, amount, street, totalStreetBet, stackAfter: 1000 };
}

function player(playerId: string, overrides = {}) {
  const seat = playerId === HERO ? 1 : playerId === V1 ? 2 : 3;
  return { seat, playerId, startStack: 1000, cards: null, isHero: playerId === HERO, ...overrides };
}

const FLOP: Card[] = ['2h', 'Ks', 'Tc'];
const FULL_BOARD: Card[] = ['2h', 'Ks', 'Tc', 'Jh', '3s'];

describe('handsPlayed / hand filtering', () => {
  it('only counts hands where the player was dealt in', () => {
    const hands = [
      makeHand({ players: [player(HERO), player(V1)] }),
      makeHand({ players: [player(V1), player(V2)] }),
    ];
    expect(computeHeroStats(hands, HERO).handsPlayed).toBe(1);
  });

  it('returns all-zero stats for no hands', () => {
    const stats = computeHeroStats([], HERO);
    expect(stats).toMatchObject({
      handsPlayed: 0, vpip: 0, pfr: 0, threeBet: 0, foldTo3Bet: 0,
      af: 0, wtsd: 0, wsd: 0, winRate: 0,
    });
  });
});

describe('vpip', () => {
  it('counts preflop calls and raises, not blind posts, checks, or folds', () => {
    const hands = [
      // limp = VPIP
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.CALL, 10, Street.PREFLOP),
      ]}),
      // BB check = not VPIP
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.POST_BB, 10, Street.POSTING_BLINDS),
        act(HERO, ActionType.CHECK, 0, Street.PREFLOP, 10),
      ]}),
      // fold = not VPIP
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.FOLD, 0, Street.PREFLOP),
      ]}),
      // raise = VPIP
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.RAISE, 30, Street.PREFLOP),
      ]}),
    ];
    expect(computeHeroStats(hands, HERO).vpip).toBe(50);
  });
});

describe('pfr', () => {
  it('counts raises but not calls', () => {
    const hands = [
      makeHand({ players: [player(HERO)], actions: [act(HERO, ActionType.RAISE, 30, Street.PREFLOP)] }),
      makeHand({ players: [player(HERO)], actions: [act(HERO, ActionType.CALL, 10, Street.PREFLOP)] }),
    ];
    const stats = computeHeroStats(hands, HERO);
    expect(stats.pfr).toBe(50);
    expect(stats.vpip).toBe(100);
  });
});

describe('threeBet', () => {
  it('counts re-raises over the open; opens are not opportunities', () => {
    const hands = [
      // hero 3-bets villain's open
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(V1, ActionType.RAISE, 30, Street.PREFLOP),
        act(HERO, ActionType.RAISE, 90, Street.PREFLOP),
      ]}),
      // hero flats the open: opportunity, no 3-bet
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(V1, ActionType.RAISE, 30, Street.PREFLOP),
        act(HERO, ActionType.CALL, 30, Street.PREFLOP),
      ]}),
      // hero opens: no opportunity
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.RAISE, 30, Street.PREFLOP),
      ]}),
      // hero acts facing a 3-bet (two raises before): not a 3-bet opportunity
      makeHand({ players: [player(HERO), player(V1), player(V2)], actions: [
        act(V1, ActionType.RAISE, 30, Street.PREFLOP),
        act(V2, ActionType.RAISE, 90, Street.PREFLOP),
        act(HERO, ActionType.FOLD, 0, Street.PREFLOP),
      ]}),
    ];
    expect(computeHeroStats(hands, HERO).threeBet).toBe(50); // 1 of 2 opportunities
  });
});

describe('foldTo3Bet', () => {
  const openThenFace3Bet = (heroResponse: Action) => makeHand({
    players: [player(HERO), player(V1)],
    actions: [
      act(HERO, ActionType.RAISE, 30, Street.PREFLOP),
      act(V1, ActionType.RAISE, 90, Street.PREFLOP),
      heroResponse,
    ],
  });

  it('counts folds facing a re-raise after own raise', () => {
    const hands = [
      openThenFace3Bet(act(HERO, ActionType.FOLD, 0, Street.PREFLOP)),
      openThenFace3Bet(act(HERO, ActionType.CALL, 60, Street.PREFLOP, 90)),
    ];
    expect(computeHeroStats(hands, HERO).foldTo3Bet).toBe(50);
  });

  it('is not triggered when hero never raised', () => {
    const hands = [makeHand({ players: [player(HERO), player(V1)], actions: [
      act(V1, ActionType.RAISE, 30, Street.PREFLOP),
      act(HERO, ActionType.FOLD, 0, Street.PREFLOP),
    ]})];
    expect(computeHeroStats(hands, HERO).foldTo3Bet).toBe(0);
  });
});

describe('aggression factor', () => {
  it('divides bets+raises by calls, overall and per street', () => {
    const hands = [makeHand({ players: [player(HERO), player(V1)], board: FULL_BOARD, actions: [
      act(HERO, ActionType.CALL, 10, Street.PREFLOP),
      act(HERO, ActionType.BET, 20, Street.FLOP),
      act(V1, ActionType.RAISE, 60, Street.FLOP),
      act(HERO, ActionType.CALL, 40, Street.FLOP, 60),
      act(HERO, ActionType.BET, 80, Street.TURN),
      act(HERO, ActionType.CALL, 100, Street.RIVER),
    ]})];
    const stats = computeHeroStats(hands, HERO);
    expect(stats.afByStreet).toEqual({ preflop: 0, flop: 1, turn: 1, river: 0 });
    expect(stats.af).toBe(2 / 3); // 2 aggressive, 3 calls
  });

  it('classifies ALL_IN by whether it raised the street max', () => {
    const hands = [makeHand({ players: [player(HERO), player(V1), player(V2)], actions: [
      act(V1, ActionType.RAISE, 30, Street.PREFLOP),
      // shove over the raise: totalStreetBet 200 > 30 → aggressive
      act(HERO, ActionType.ALL_IN, 200, Street.PREFLOP),
      // call-all-in for less: totalStreetBet 150 < 200 → passive
      act(V2, ActionType.ALL_IN, 150, Street.PREFLOP, 150),
    ]})];
    expect(computePlayerStats(hands, HERO).afByStreet.preflop).toBe(1);   // 1 aggr, 0 calls
    expect(computePlayerStats(hands, V2).afByStreet.preflop).toBe(0);     // 0 aggr, 1 call
    expect(computePlayerStats(hands, HERO).pfr).toBe(100);
    expect(computePlayerStats(hands, V2).pfr).toBe(0);
  });
});

describe('wtsd / wsd', () => {
  const showdownHand = (heroWins: boolean) => makeHand({
    players: [player(HERO), player(V1)],
    board: FULL_BOARD,
    actions: [
      act(HERO, ActionType.CALL, 10, Street.PREFLOP),
      act(HERO, ActionType.CHECK, 0, Street.RIVER),
      act(V1, ActionType.CHECK, 0, Street.RIVER),
    ],
    results: [heroWins
      ? { seat: 1, playerId: HERO, potWon: 20, netWon: 10 }
      : { seat: 2, playerId: V1, potWon: 20, netWon: 10 }],
  });

  it('computes went-to-showdown over saw-flop hands', () => {
    const hands = [
      showdownHand(true),
      // saw flop, folded before showdown
      makeHand({ players: [player(HERO), player(V1)], board: FLOP, actions: [
        act(HERO, ActionType.CALL, 10, Street.PREFLOP),
        act(V1, ActionType.BET, 20, Street.FLOP),
        act(HERO, ActionType.FOLD, 0, Street.FLOP),
      ]}),
      // folded preflop: not in wtsd denominator even though board ran out
      makeHand({ players: [player(HERO), player(V1), player(V2)], board: FULL_BOARD, actions: [
        act(HERO, ActionType.FOLD, 0, Street.PREFLOP),
      ]}),
      // won without showdown (everyone folded): not a showdown
      makeHand({ players: [player(HERO), player(V1)], board: FLOP, actions: [
        act(HERO, ActionType.CALL, 10, Street.PREFLOP),
        act(HERO, ActionType.BET, 20, Street.FLOP),
        act(V1, ActionType.FOLD, 0, Street.FLOP),
      ], results: [{ seat: 1, playerId: HERO, potWon: 20, netWon: 10 }]}),
    ];
    const stats = computeHeroStats(hands, HERO);
    expect(stats.wtsd).toBeCloseTo(100 / 3); // 1 showdown / 3 saw-flop hands
    expect(stats.wsd).toBe(100);
  });

  it('wsd counts only showdowns won', () => {
    const stats = computeHeroStats([showdownHand(true), showdownHand(false)], HERO);
    expect(stats.wtsd).toBe(100);
    expect(stats.wsd).toBe(50);
  });
});

describe('winRate', () => {
  it('uses netWon for winners and -invested for losers', () => {
    const hands = [
      // hero wins: netWon is authoritative (covers uncalled-bet returns)
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.RAISE, 30, Street.PREFLOP),
      ], results: [{ seat: 1, playerId: HERO, potWon: 15, netWon: 5 }]}),
      // hero loses: net = -(blind + call)
      makeHand({ players: [player(HERO), player(V1)], actions: [
        act(HERO, ActionType.POST_BB, 10, Street.POSTING_BLINDS),
        act(HERO, ActionType.CALL, 20, Street.PREFLOP, 30),
      ], results: [{ seat: 2, playerId: V1, potWon: 60, netWon: 30 }]}),
    ];
    expect(computeHeroStats(hands, HERO).winRate).toBe((5 - 30) / 2);
  });

  it('does not double-count split-pot result entries', () => {
    const hands = [makeHand({ players: [player(HERO), player(V1)], actions: [
      act(HERO, ActionType.CALL, 10, Street.PREFLOP),
    ], results: [
      { seat: 1, playerId: HERO, potWon: 100, netWon: 40 },
      { seat: 1, playerId: HERO, potWon: 50, netWon: 40 },  // side pot, same whole-hand net
    ]})];
    expect(computeHeroStats(hands, HERO).winRate).toBe(40);
  });
});
