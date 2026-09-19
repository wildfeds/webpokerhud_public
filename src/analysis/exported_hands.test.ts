// Sanity check over real exported data: load the JSONL hand objects the
// extension downloaded (examples/hands_jsonl_objs/), verify data-quality
// invariants, and compute hero stats end-to-end.
//
// The folder is refreshed with new exports as more hands are collected, so
// assertions are invariant-based rather than pinned to exact values; the
// computed stats are printed for eyeballing.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { Hand } from '../model';
import { computeHeroStats } from './hero_stats';

const EXPORT_DIR = join(__dirname, '../../examples/hands_jsonl_objs');

let hands: Hand[] = [];
let heroId = '';

beforeAll(() => {
  for (const file of readdirSync(EXPORT_DIR).filter(f => f.endsWith('.jsonl'))) {
    const lines = readFileSync(join(EXPORT_DIR, file), 'utf8').split('\n').filter(Boolean);
    hands.push(...lines.map(l => JSON.parse(l) as Hand));
  }
  const heroIds = new Set(
    hands.flatMap(h => h.players.filter(p => p.isHero).map(p => p.playerId)));
  expect(heroIds.size).toBe(1);
  heroId = [...heroIds][0]!;
});

describe('exported hand data quality', () => {
  it('has hands to analyse', () => {
    expect(hands.length).toBeGreaterThan(0);
  });

  it('has unique (platform, handId) keys across all tables', () => {
    const keys = hands.map(h => `${h.platform}:${h.handId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('satisfies totalPot === rake + sum(potWon) in every hand', () => {
    for (const h of hands) {
      const awarded = h.results.reduce((sum, r) => sum + r.potWon, 0);
      expect(h.totalPot, `hand ${h.handId}`).toBe(h.rake + awarded);
    }
  });

  it('never awards a winner more net than pot chips', () => {
    for (const h of hands) {
      for (const r of h.results) {
        expect(r.netWon, `hand ${h.handId} seat ${r.seat}`).toBeLessThanOrEqual(r.potWon);
      }
    }
  });

  it('references only dealt-in players in actions', () => {
    for (const h of hands) {
      const ids = new Set(h.players.map(p => p.playerId));
      for (const a of h.actions) {
        expect(ids.has(a.playerId), `hand ${h.handId}: action by unknown ${a.playerId}`).toBe(true);
      }
    }
  });
});

describe('hero stats over exported hands', () => {
  it('computes internally consistent stats', () => {
    const stats = computeHeroStats(hands, heroId);
    console.log('[hero stats]', JSON.stringify(stats, null, 2));

    const heroDealtIn = hands.filter(h => h.players.some(p => p.isHero)).length;
    expect(stats.handsPlayed).toBe(heroDealtIn);
    expect(stats.handsPlayed).toBeGreaterThan(0);

    for (const pctStat of [stats.vpip, stats.pfr, stats.threeBet,
                           stats.foldTo3Bet, stats.wtsd, stats.wsd] as const) {
      expect(pctStat).toBeGreaterThanOrEqual(0);
      expect(pctStat).toBeLessThanOrEqual(100);
    }
    // a preflop raise is by definition voluntary
    expect(stats.pfr).toBeLessThanOrEqual(stats.vpip);

    expect(Number.isFinite(stats.af)).toBe(true);
    for (const af of Object.values(stats.afByStreet)) {
      expect(Number.isFinite(af)).toBe(true);
      expect(af).toBeGreaterThanOrEqual(0);
    }

    // winRate is chips/hand; the total must match an independent per-hand sum
    const expectedNet = hands.reduce((sum, h) => {
      if (!h.players.some(p => p.isHero)) return sum;
      const result = h.results.find(r => r.playerId === heroId);
      if (result) return sum + result.netWon;
      const invested = h.actions
        .filter(a => a.playerId === heroId)
        .reduce((s, a) => s + a.amount, 0);
      return sum - invested;
    }, 0);
    expect(stats.winRate * stats.handsPlayed).toBeCloseTo(expectedNet, 6);
  });

  it('computes stats per table without losing hands', () => {
    const tables = [...new Set(hands.map(h => h.tableId))];
    const perTable = tables.map(t =>
      computeHeroStats(hands.filter(h => h.tableId === t), heroId));
    const total = perTable.reduce((sum, s) => sum + s.handsPlayed, 0);
    expect(total).toBe(computeHeroStats(hands, heroId).handsPlayed);
  });
});
