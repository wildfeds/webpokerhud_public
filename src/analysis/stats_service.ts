// Async glue between the storage layer and the pure stats functions.
// Used by the background worker to answer stat queries from UI surfaces.
//
// Only live-HUD and popup stats are computed here. The Analysis Panel's
// aggregate views moved to the analysis server (webpokerhud-server,
// POST /v1/panel) — the background uploads the filtered hands via
// queryFiltered() and relays the server's PanelData response.
import { Hand } from '../model';
import { HandStore } from '../storage';
import { HeroStats, computeHeroStats, computeNetSeries } from './hero_stats';
import { SeatSessionStats, computeSeatSessionStats } from './seat_stats';

// Filter applied to any stat query. tableId + time bounds are native store
// filters; stakeLevel is a derived key filtered in memory.
export interface StatsFilter {
  tableId?:    string;
  stakeLevel?: string;   // stakeKey, e.g. "5/10"
  fromTime?:   number;   // Unix ms, inclusive
  toTime?:     number;   // Unix ms, inclusive
}

export interface TableSummary {
  tableId: string;
  hands:   number;
  level:   string;                       // stakeKey of the latest hand
  stakes:  { sb: number; bb: number };   // from the latest hand at that table
}

export interface StakeLevelSummary {
  level: string;   // stakeKey, e.g. "5/10"
  sb:    number;
  bb:    number;
  hands: number;
}

// Canonical grouping key for a blind level.
export function stakeKey(stakes: { sb: number; bb: number }): string {
  return `${stakes.sb}/${stakes.bb}`;
}

// Stats for the hero (the isHero player in stored hands) under a filter.
// Returns null when no hero hands match.
export async function getHeroStats(store: HandStore, filter: StatsFilter = {}): Promise<HeroStats | null> {
  const hands = await queryFiltered(store, filter);
  const heroId = findHeroId(hands);
  if (!heroId) return null;
  return computeHeroStats(hands, heroId);
}

// Cumulative net-chip series for the hero over the filtered hands (play order).
export async function getNetSeries(store: HandStore, filter: StatsFilter = {}): Promise<number[]> {
  const hands = await queryFiltered(store, filter);
  const heroId = findHeroId(hands);
  if (!heroId) return [];
  return computeNetSeries(hands, heroId);
}

// Session-scoped per-seat stats for the live HUD at one table.
export async function getSeatStats(store: HandStore, tableId: string): Promise<SeatSessionStats[]> {
  const hands = await store.query({ tableId });
  return computeSeatSessionStats(hands, tableId);
}

// A single full Hand for the replay view. Returns null if not found.
export async function getHand(store: HandStore, handId: string, tableId?: string): Promise<Hand | null> {
  const hands = await store.query({ tableId });
  return hands.find(h => h.handId === handId) ?? null;
}

export async function listTables(store: HandStore, filter: StatsFilter = {}): Promise<TableSummary[]> {
  const byTable = new Map<string, TableSummary>();
  for (const hand of await queryFiltered(store, filter)) {
    const entry = byTable.get(hand.tableId);
    if (entry) {
      entry.hands++;
      entry.level = stakeKey(hand.stakes);   // hands are timestamp-ascending → latest wins
      entry.stakes = hand.stakes;
    } else {
      byTable.set(hand.tableId, {
        tableId: hand.tableId, hands: 1, level: stakeKey(hand.stakes), stakes: hand.stakes,
      });
    }
  }
  return [...byTable.values()];
}

export async function listStakeLevels(store: HandStore, filter: StatsFilter = {}): Promise<StakeLevelSummary[]> {
  const byLevel = new Map<string, StakeLevelSummary>();
  for (const hand of await queryFiltered(store, filter)) {
    const level = stakeKey(hand.stakes);
    const entry = byLevel.get(level);
    if (entry) entry.hands++;
    else byLevel.set(level, { level, sb: hand.stakes.sb, bb: hand.stakes.bb, hands: 1 });
  }
  return [...byLevel.values()];
}

// Push table/time bounds to the store; apply the derived stakeLevel in memory.
// Exported: the background uses it to gather the hands uploaded for panel
// analysis.
export async function queryFiltered(store: HandStore, filter: StatsFilter = {}): Promise<Hand[]> {
  const hands = await store.query({
    tableId:  filter.tableId,
    fromTime: filter.fromTime,
    toTime:   filter.toTime,
  });
  if (filter.stakeLevel === undefined) return hands;
  return hands.filter(h => stakeKey(h.stakes) === filter.stakeLevel);
}

function findHeroId(hands: Hand[]): string | null {
  for (const hand of hands) {
    const hero = hand.players.find(p => p.isHero);
    if (hero) return hero.playerId;
  }
  return null;
}
