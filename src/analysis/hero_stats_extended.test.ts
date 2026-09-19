import { describe, it, expect } from 'vitest';
import { Action, ActionType, Card, Street } from '../model';
import { makeHand } from '../testing/fixtures';
import { computePlayerStats, counterPct } from './hero_stats';

const HERO = 'hero';

function P(seat: number, playerId: string) {
  return { seat, playerId, startStack: 1000, cards: null, isHero: playerId === HERO };
}

function A(
  seat: number, playerId: string, type: ActionType, amount: number,
  street: Street, totalStreetBet = amount,
): Action {
  return { seat, playerId, type, amount, totalStreetBet, street, stackAfter: 1000 };
}

// 6-max seats 1..6 with the button on seat 3 →
// SB=4, BB=5, UTG=6, MP=1, CO=2, BTN=3  (see position.test.ts).
const SIX = [1, 2, 3, 4, 5, 6].map(s => P(s, s === 3 ? HERO : `p${s}`));
function sixMax(actions: Action[], overrides = {}) {
  return makeHand({ dealerSeat: 3, players: SIX, actions, ...overrides });
}

const FLOP: Card[] = ['2h', '7s', 'Tc'];

describe('steal', () => {
  it('counts a first-in raise from the button', () => {
    // Hero is BTN (seat 3). Folded to hero, hero opens.
    const hand = sixMax([
      A(6, 'p6', ActionType.FOLD, 0, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, HERO, ActionType.RAISE, 30, Street.PREFLOP),
    ]);
    const s = computePlayerStats([hand], HERO);
    expect(s.steal).toEqual({ n: 1, d: 1 });
    expect(s.stealByPos.btn).toEqual({ n: 1, d: 1 });
    expect(counterPct(s.steal)).toBe(100);
  });

  it('is not an opportunity when someone has already entered', () => {
    const hand = sixMax([
      A(6, 'p6', ActionType.RAISE, 30, Street.PREFLOP),   // UTG opens first
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, HERO, ActionType.RAISE, 90, Street.PREFLOP),
    ]);
    expect(computePlayerStats([hand], HERO).steal).toEqual({ n: 0, d: 0 });
  });
});

describe('blind defense', () => {
  it('counts folding the BB to a button steal', () => {
    // Hero is BB (seat 5); button opens, folded to hero.
    const hand = sixMax([
      A(6, 'p6', ActionType.FOLD, 0, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, 'p3', ActionType.RAISE, 30, Street.PREFLOP),   // BTN steal (p3, not hero here)
      A(4, 'p4', ActionType.FOLD, 0, Street.PREFLOP),
      A(5, HERO, ActionType.FOLD, 0, Street.PREFLOP),
    ], { players: [1, 2, 3, 4, 6].map(s => P(s, `p${s}`)).concat(P(5, HERO)) });
    const s = computePlayerStats([hand], HERO);
    expect(s.foldBBToSteal).toEqual({ n: 1, d: 1 });
  });
});

describe('squeeze', () => {
  it('counts a raise facing an open and a cold-caller', () => {
    // Hero BB (seat 5): UTG opens, MP calls, folded to hero who raises.
    const hand = sixMax([
      A(6, 'p6', ActionType.RAISE, 30, Street.PREFLOP),
      A(1, 'p1', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, 'p3', ActionType.FOLD, 0, Street.PREFLOP),
      A(4, 'p4', ActionType.FOLD, 0, Street.PREFLOP),
      A(5, HERO, ActionType.RAISE, 120, Street.PREFLOP),
    ], { players: [1, 2, 3, 4, 6].map(s => P(s, `p${s}`)).concat(P(5, HERO)) });
    expect(computePlayerStats([hand], HERO).squeeze).toEqual({ n: 1, d: 1 });
  });
});

describe('cold call', () => {
  it('counts calling an open out of position, not from the blinds', () => {
    // Hero CO (seat 2): UTG opens, hero calls.
    const hand = sixMax([
      A(6, 'p6', ActionType.RAISE, 30, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, HERO, ActionType.CALL, 30, Street.PREFLOP),
    ], { players: [1, 3, 4, 5, 6].map(s => P(s, `p${s}`)).concat(P(2, HERO)) });
    expect(computePlayerStats([hand], HERO).coldCall).toEqual({ n: 1, d: 1 });
  });
});

describe('4-bet / fold to 4-bet', () => {
  it('counts hero 4-betting after its open was 3-bet', () => {
    // Hero BTN opens, SB 3-bets, hero 4-bets.
    const hand = sixMax([
      A(6, 'p6', ActionType.FOLD, 0, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(4, 'p4', ActionType.RAISE, 90, Street.PREFLOP),
      A(5, 'p5', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, HERO, ActionType.RAISE, 270, Street.PREFLOP),
    ]);
    const s = computePlayerStats([hand], HERO);
    expect(s.fourBet).toEqual({ n: 1, d: 1 });
  });

  it('counts hero folding its 3-bet to a 4-bet', () => {
    // UTG opens, hero (CO) 3-bets, UTG 4-bets, hero folds.
    const hand = sixMax([
      A(6, 'p6', ActionType.RAISE, 30, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, HERO, ActionType.RAISE, 90, Street.PREFLOP),
      A(3, 'p3', ActionType.FOLD, 0, Street.PREFLOP),
      A(4, 'p4', ActionType.FOLD, 0, Street.PREFLOP),
      A(5, 'p5', ActionType.FOLD, 0, Street.PREFLOP),
      A(6, 'p6', ActionType.RAISE, 270, Street.PREFLOP),
      A(2, HERO, ActionType.FOLD, 0, Street.PREFLOP),
    ], { players: [1, 3, 4, 5, 6].map(s => P(s, `p${s}`)).concat(P(2, HERO)) });
    const s = computePlayerStats([hand], HERO);
    expect(s.foldTo4Bet).toEqual({ n: 1, d: 1 });
  });
});

// Heads-up: seats 1 (SB/BTN) and 2 (BB). Dealer on seat 1.
function hu(heroSeat: 1 | 2, actions: Action[], board: Card[] = FLOP) {
  const players = [P(1, heroSeat === 1 ? HERO : 'v'), P(2, heroSeat === 2 ? HERO : 'v')];
  return makeHand({ dealerSeat: 1, players, actions, board });
}

describe('c-bet / fold to c-bet', () => {
  it('counts the preflop aggressor betting the flop when checked to', () => {
    // Hero (SB) raises pre, villain calls; villain checks flop, hero c-bets, villain folds.
    const hand = hu(1, [
      A(1, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CHECK, 0, Street.FLOP),
      A(1, HERO, ActionType.BET, 40, Street.FLOP),
      A(2, 'v', ActionType.FOLD, 0, Street.FLOP),
    ]);
    expect(computePlayerStats([hand], HERO).cbet.flop).toEqual({ n: 1, d: 1 });
    // The villain faced that c-bet and folded.
    expect(computePlayerStats([hand], 'v').foldToCbet.flop).toEqual({ n: 1, d: 1 });
  });
});

describe('check-raise', () => {
  it('counts checking then raising a bet on the flop', () => {
    // Villain (SB) raises pre & is PFA; hero (BB) calls, checks flop, villain bets, hero raises.
    const hand = hu(2, [
      A(1, 'v', ActionType.RAISE, 30, Street.PREFLOP),
      A(2, HERO, ActionType.CALL, 30, Street.PREFLOP),
      A(2, HERO, ActionType.CHECK, 0, Street.FLOP),
      A(1, 'v', ActionType.BET, 40, Street.FLOP),
      A(2, HERO, ActionType.RAISE, 120, Street.FLOP),
    ]);
    expect(computePlayerStats([hand], HERO).checkRaise.flop).toEqual({ n: 1, d: 1 });
  });
});

describe('wwsf and afq', () => {
  it('counts winning money after seeing the flop', () => {
    const hand = hu(1, [
      A(1, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CHECK, 0, Street.FLOP),
      A(1, HERO, ActionType.BET, 40, Street.FLOP),
      A(2, 'v', ActionType.FOLD, 0, Street.FLOP),
    ]);
    const won = makeHand({ ...hand, results: [{ seat: 1, playerId: HERO, potWon: 100, netWon: 40 }] });
    expect(computePlayerStats([won], HERO).wwsf).toEqual({ n: 1, d: 1 });
  });

  it('measures aggression frequency per street', () => {
    const hand = hu(1, [
      A(1, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CHECK, 0, Street.FLOP),
      A(1, HERO, ActionType.BET, 40, Street.FLOP),      // aggressive
      A(2, 'v', ActionType.RAISE, 120, Street.FLOP),
      A(1, HERO, ActionType.CALL, 80, Street.FLOP, 120), // passive
    ]);
    // Two hero flop actions, one aggressive.
    expect(computePlayerStats([hand], HERO).afq.flop).toEqual({ n: 1, d: 2 });
  });
});

describe('example hands', () => {
  // Folded to the hero on the button, who steals (or folds if `steals` is false).
  function btnFirstIn(steals: boolean, handId: string, timestamp: number) {
    return sixMax([
      A(6, 'p6', ActionType.FOLD, 0, Street.PREFLOP),
      A(1, 'p1', ActionType.FOLD, 0, Street.PREFLOP),
      A(2, 'p2', ActionType.FOLD, 0, Street.PREFLOP),
      A(3, HERO, steals ? ActionType.RAISE : ActionType.FOLD, steals ? 30 : 0, Street.PREFLOP),
    ], { handId, timestamp });
  }

  it('keeps the latest hand where the stat was made, skipping declined opportunities', () => {
    const s = computePlayerStats([
      btnFirstIn(true, 'h1', 1000),
      btnFirstIn(true, 'h2', 2000),
      btnFirstIn(false, 'h3', 3000),   // opportunity declined — must not become the example
    ], HERO);
    expect(s.steal).toEqual({ n: 2, d: 3 });
    expect(s.examples.steal).toEqual({ handId: 'h2', tableId: 'table-1', timestamp: 2000 });
  });

  it('records no example for a stat that never happened', () => {
    const s = computePlayerStats([btnFirstIn(false, 'h1', 1000)], HERO);
    expect(s.steal).toEqual({ n: 0, d: 1 });
    expect(s.examples.steal).toBeUndefined();
  });

  it('collapses per-street counters onto one key (c-bet, fold-to-c-bet)', () => {
    const hand = hu(1, [
      A(1, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CHECK, 0, Street.FLOP),
      A(1, HERO, ActionType.BET, 40, Street.FLOP),
      A(2, 'v', ActionType.FOLD, 0, Street.FLOP),
    ]);
    expect(computePlayerStats([hand], HERO).examples.cbet?.handId).toBe(hand.handId);
    expect(computePlayerStats([hand], 'v').examples.foldToCbet?.handId).toBe(hand.handId);
  });

  it('records a wwsf example on a winning flop-seen hand', () => {
    const hand = hu(1, [
      A(1, HERO, ActionType.RAISE, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CALL, 30, Street.PREFLOP),
      A(2, 'v', ActionType.CHECK, 0, Street.FLOP),
      A(1, HERO, ActionType.BET, 40, Street.FLOP),
      A(2, 'v', ActionType.FOLD, 0, Street.FLOP),
    ]);
    const won = makeHand({ ...hand, results: [{ seat: 1, playerId: HERO, potWon: 100, netWon: 40 }] });
    expect(computePlayerStats([won], HERO).examples.wwsf?.handId).toBe(won.handId);
  });
});
