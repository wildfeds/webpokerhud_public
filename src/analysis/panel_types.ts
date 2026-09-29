// Types for the server-computed Analysis Panel payload, plus the tiny pure
// display helpers the panel needs to lay them out. The computation lives in
// the analysis server (webpokerhud-server, POST /v1/panel); these shapes
// mirror its response — keep the two in sync.
import { Card, Rank, RANKS } from '../model';
import { HeroStats } from './hero_stats';

export type Tier = 'free' | 'pro';

// Panel views the server locks for the free tier. 'overview' and 'hands'
// (browse + replays) always stay available, as does client-side hand
// export/import; within the Hands view the big pots/wins/losses shortcuts
// grey out per tier.
export type ProView = 'positions' | 'cards' | 'sessions' | 'trends';

// ── Per stake-level summary ──────────────────────────────────────────────────

export interface StakeStats {
  level:    string;   // stakeKey, e.g. "5/10"
  sb:       number;
  bb:       number;
  hands:    number;
  handsWon: number;
  net:      number;   // net chips (cents)
  sessions: number;
  bb100:    number;   // net in big blinds per 100 hands
}

// ── Hand history summaries ───────────────────────────────────────────────────

export interface HandSummary {
  handId:    string;
  tableId:   string;
  timestamp: number;
  level:     string;   // stakeKey
  sb:        number;
  bb:        number;
  position:  string | null;
  heroCards: Card[];
  board:     Card[];
  net:       number;    // net chips (cents) for the player
  won:       boolean;   // net > 0
  // Line-filter fields (34)
  streetReached: 'preflop' | 'flop' | 'turn' | 'river';   // how far the hand got
  wasPfa:        boolean;         // the player was the last preflop raiser
  threeBetPot:   boolean;         // preflop saw a raise and a re-raise
  sawShowdown:   boolean;         // the player reached showdown
  potBb:         number;          // final pot in big blinds
  holeKey:       string | null;   // matrix cell, e.g. "AKs"
}

// ── Leak highlights ──────────────────────────────────────────────────────────

export interface Leak {
  severity: 'warn' | 'info';
  title:    string;
  detail:   string;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface SessionSummary {
  start:    number;   // Unix ms of first hand
  end:      number;   // Unix ms of last hand
  hands:    number;
  handsWon: number;   // hands with a positive net
  net:      number;   // net chips (cents) over the session
  netBb:    number;   // net in big blinds (per-hand bb, so mixed stakes add up)
}

// ── Starting-hand matrix ─────────────────────────────────────────────────────

export interface HoleCellStats {
  hands: number;   // times dealt
  net:   number;   // net chips (cents) over those hands
  vpip:  number;   // hands with a voluntary preflop call/bet/raise
}

// key ('AA', 'AKs', …) → accumulated results.
export type HoleCardMatrix = Record<string, HoleCellStats>;

// Matrix row/column order: high card first, PT4-style.
export const MATRIX_RANKS: Rank[] = [...RANKS].reverse();   // A, K, …, 2

// Cell key at grid position (row, col) in MATRIX_RANKS order: pairs on the
// diagonal, suited above it (row rank first), offsuit below.
export function matrixKeyAt(row: number, col: number): string {
  const hi = MATRIX_RANKS[Math.min(row, col)]!;
  const lo = MATRIX_RANKS[Math.max(row, col)]!;
  if (row === col) return hi + lo;
  return hi + lo + (row < col ? 's' : 'o');
}

// ── Rolling trends ───────────────────────────────────────────────────────────

export interface RollingStats {
  window: number;
  // One point per dealt-in hand from index window-1 on (empty when the
  // selection holds fewer hands than the window).
  vpip:  number[];   // % over the trailing window
  pfr:   number[];   // % over the trailing window
  bb100: number[];   // big blinds per 100 hands over the trailing window
}

// ── The full panel payload ───────────────────────────────────────────────────

export interface PanelData {
  stats:      HeroStats | null;
  stakeStats: StakeStats[];
  leaks:      Leak[];
  byPosition: Record<string, HeroStats>;
  netSeries:  number[];
  evSeries:   number[];
  hands:      HandSummary[];
  matrix:     HoleCardMatrix;
  sessions:   SessionSummary[];
  rolling:    RollingStats;
}

export function emptyPanelData(window: number): PanelData {
  return {
    stats: null, stakeStats: [], leaks: [], byPosition: {}, netSeries: [],
    evSeries: [], hands: [], matrix: {}, sessions: [],
    rolling: { window, vpip: [], pfr: [], bb100: [] },
  };
}
