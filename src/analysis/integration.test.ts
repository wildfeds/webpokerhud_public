// L2 → L4 seam test: replay the captured session and verify stats against
// values derived by hand from the raw log (see bovada_connector.test.ts for
// the underlying chip accounting).
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { Hand } from '../model';
import { replayLogFile } from '../testing/replay';
import { computeHeroStats, computePlayerStats } from './hero_stats';

const LOG = join(__dirname, '../../examples/hands_and_raw_log/raw_logs_1.txt');
const HERO_ID = '560201380440500';

let hands: Hand[] = [];

beforeAll(() => {
  hands = replayLogFile(LOG);
});

describe('hero stats over the captured session', () => {
  // Hero sat in for 5 hands (the 6th predates their arrival) and folded every
  // one: dead blind 10, BB 10, SB 5 → net -25 over 5 hands.
  it('matches the hand-derived session summary', () => {
    const stats = computeHeroStats(hands, HERO_ID);
    expect(stats).toMatchObject({
      playerId:    HERO_ID,
      handsPlayed: 5,
      vpip:        0,
      pfr:         0,
      threeBet:    0,
      foldTo3Bet:  0,
      af:          0,
      wtsd:        0,
      wsd:         0,
      winRate:     -5,
    });
  });
});

describe('opponent stats (seat-scoped token, single table)', () => {
  // Seat 1 played all 5 full hands; saw one flop (the limped family pot),
  // check-raised the turn to 252, and won 563 at showdown: net +272 there,
  // -10 as the folded BB in the first full hand.
  it('computes seat 1 stats matching the raw-log accounting', () => {
    const stats = computePlayerStats(hands, 'bovada:37407996:1');
    expect(stats.handsPlayed).toBe(5);
    expect(stats.vpip).toBe(20);            // limp-completed once
    expect(stats.pfr).toBe(0);
    expect(stats.wtsd).toBe(100);           // 1 showdown / 1 saw-flop
    expect(stats.wsd).toBe(100);
    expect(stats.winRate).toBeCloseTo((272 - 10) / 5);
    expect(stats.afByStreet.turn).toBe(1);  // the check-raise, no turn calls
    expect(stats.af).toBeCloseTo(1 / 2);    // 1 raise / (SB-complete + flop call)
  });
});
