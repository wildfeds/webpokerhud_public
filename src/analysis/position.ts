// Layer 4 — table positions derived purely from a completed Hand.
// Positions come from dealerSeat + the dealt-in seats; no new captured data.
// (Position-bucketed stats moved to the analysis server with the panel.)
import { Hand } from '../model';

// Canonical positions in seat order starting from the small blind, for each
// table size. Last entry is always the button (BTN). Ordered SB, BB, then
// preflop-action order (UTG … CO) up to BTN.
const POSITIONS: Record<number, string[]> = {
  2: ['SB', 'BB'],                                                  // HU: dealer posts SB
  3: ['SB', 'BB', 'BTN'],
  4: ['SB', 'BB', 'UTG', 'BTN'],
  5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'MP', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN'],
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO', 'BTN'],
};

// Display order for aggregation / tables (earliest to latest).
export const POSITION_ORDER = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

// Map each dealt-in seat to its position label. Returns an empty map when the
// table size is unsupported or the dealer seat is not among the dealt-in seats.
export function seatPositions(hand: Hand): Map<number, string> {
  const seats = hand.players.map(p => p.seat).sort((a, b) => a - b);
  const n = seats.length;
  const labels = POSITIONS[n];
  const dealerIdx = seats.indexOf(hand.dealerSeat);
  if (!labels || dealerIdx < 0) return new Map();

  // SB is the seat after the button, except heads-up where the button is SB.
  const startIdx = n === 2 ? dealerIdx : (dealerIdx + 1) % n;
  const ordered = [...seats.slice(startIdx), ...seats.slice(0, startIdx)];

  const map = new Map<number, string>();
  ordered.forEach((seat, i) => map.set(seat, labels[i]!));
  return map;
}

// Position of a specific player in a hand, or null if it can't be determined.
export function positionOf(hand: Hand, playerId: string): string | null {
  const player = hand.players.find(p => p.playerId === playerId);
  if (!player) return null;
  return seatPositions(hand).get(player.seat) ?? null;
}
