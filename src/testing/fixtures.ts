// Test fixture — not imported by production code.
import { Hand } from '../model';
import { HeroStats, newExtCounters } from '../analysis/hero_stats';

let nextHandId = 1;

// A zeroed HeroStats with all extended counters present, for tests that only
// care about a few fields.
export function makeHeroStats(overrides: Partial<HeroStats> = {}): HeroStats {
  return {
    playerId:   'hero',
    handsPlayed: 0,
    vpip: 0, pfr: 0, threeBet: 0, foldTo3Bet: 0,
    af: 0, afByStreet: { preflop: 0, flop: 0, turn: 0, river: 0 },
    wtsd: 0, wsd: 0, winRate: 0,
    ...newExtCounters(),
    ...overrides,
  };
}

export function makeHand(overrides: Partial<Hand> = {}): Hand {
  return {
    handId:     String(nextHandId++),
    tableId:    'table-1',
    platform:   'bovada',
    timestamp:  1_784_000_000_000,
    gameType:   'nlhe',
    stakes:     { sb: 5, bb: 10 },
    maxSeats:   9,
    dealerSeat: 1,
    heroSeat:   4,
    players:    [],
    actions:    [],
    board:      [],
    totalPot:   0,
    rake:       0,
    results:    [],
    ...overrides,
  };
}
