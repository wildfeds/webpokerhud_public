// Pure display formatters for the HUD panel — no DOM, unit-testable.
import { HeroStats } from '../analysis';
import { ActionType, Card, GameState, Street, Suit } from '../model';

// ── Stakes ───────────────────────────────────────────────────────────────────

// Bovada stores blinds in cents (sb:5, bb:10 = $0.05/$0.10).
const CENTS_PER_CHIP = 100;

export function formatStakeLevel(sb: number, bb: number): string {
  return `$${dollars(sb)}/$${dollars(bb)}`;
}

// Signed dollar amount from a cent value: +$0.72 / −$0.50 / $0.00
export function formatDollars(cents: number): string {
  const abs = dollars(Math.abs(cents));
  if (cents > 0) return `+$${abs}`;
  if (cents < 0) return `−$${abs}`;
  return `$${abs}`;
}

function dollars(cents: number): string {
  return (cents / CENTS_PER_CHIP).toFixed(2);
}

// ── Stats panel ──────────────────────────────────────────────────────────────

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();

// Three compact lines for the lifetime stats section.
export function statLines(stats: HeroStats): [string, string, string] {
  return [
    `VPIP ${r1(stats.vpip)} · PFR ${r1(stats.pfr)} · 3B ${r1(stats.threeBet)}`,
    `AF ${r1(stats.af)} · WTSD ${r1(stats.wtsd)} · W$SD ${r1(stats.wsd)}`,
    `${stats.handsPlayed} hands · ${formatChips(stats.winRate)}/hand`,
  ];
}

// One line for the current-table session section.
export function sessionLine(stats: HeroStats | null): string {
  if (!stats || stats.handsPlayed === 0) return 'no hands at this table yet';
  const net = Math.round(stats.winRate * stats.handsPlayed);
  return `${stats.handsPlayed} hands · ${formatChips(net)}`;
}

// Signed chip amount: +240 / −35 / 0
export function formatChips(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return '0';
}

// ── Live hand section ────────────────────────────────────────────────────────

export interface LiveInfo {
  street:    string;   // display label, e.g. 'FLOP'
  pot:       number;   // collected pot (main + side pots)
  board:     Card[];
  heroCards: Card[];
}

export function liveInfo(gs: GameState): LiveInfo {
  return {
    street:    gs.street.replace(/_/g, ' ').toUpperCase(),
    pot:       gs.pots.reduce((a, b) => a + b, 0),
    board:     gs.board,
    heroCards: gs.seats[gs.heroSeat]?.cards ?? [],
  };
}

// A live hand is worth showing once cards are dealt or chips are moving.
export function isHandLive(gs: GameState): boolean {
  return gs.street !== Street.WAITING && gs.handId !== '';
}

// Unsigned dollar amount: $2.50
export function formatUsd(cents: number): string {
  return `$${dollars(cents)}`;
}

// ── Pot odds (37) ────────────────────────────────────────────────────────────

export interface PotOdds {
  toCall:    number;   // cents the hero must add to continue
  pot:       number;   // collected pots + all chips in front this street
  equityPct: number;   // toCall / (pot + toCall) — break-even equity
}

// Pot odds the hero is being offered, or null when there is nothing to call
// (no outstanding bet, hero not dealt in, or hero already folded). Derived
// entirely from tracked street bets — no extra capture needed.
export function potOdds(gs: GameState): PotOdds | null {
  const hero = gs.seats[gs.heroSeat];
  if (!hero || !hero.cards || hero.cards.length === 0) return null;
  if (gs.actions.some(a => a.seat === gs.heroSeat && a.type === ActionType.FOLD)) return null;

  const seats = Object.values(gs.seats);
  const maxBet = Math.max(0, ...seats.map(s => s.streetBet));
  const toCall = maxBet - hero.streetBet;
  if (toCall <= 0) return null;

  const pot = gs.pots.reduce((a, b) => a + b, 0)
    + seats.reduce((a, s) => a + s.streetBet, 0);
  return { toCall, pot, equityPct: (toCall / (pot + toCall)) * 100 };
}

// ── Cards ────────────────────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLOR:  Record<Suit, string> = {
  c: '#7ec97e',  // green
  d: '#6fa8ff',  // blue
  h: '#ff6b6b',  // red
  s: '#e0e0e0',  // white
};

export function cardLabel(card: Card): string {
  return card[0] + SUIT_SYMBOL[card[1] as Suit];
}

export function cardColor(card: Card): string {
  return SUIT_COLOR[card[1] as Suit];
}
