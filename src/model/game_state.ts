import { Card } from './card';
import { Street } from './street';
import { Action } from './action';

// Per-seat state during a live hand. Mutable — updated by each incoming event.
export interface SeatState {
  playerId:   string;
  // Stack at hand start, captured when the seat is first seen this hand.
  // Not derivable at hand end: winners' final stacks include pot awards
  // and uncalled-bet returns.
  startStack: number;
  // Current stack (decreases as chips go in)
  stack:      number;
  // Chips committed to the pot on the current street
  streetBet:  number;
  // Total chips committed across all streets this hand
  totalInvested: number;
  // Hole cards: null = not yet known / face-down; Card[] = revealed
  cards:      Card[] | null;
  isActive:   boolean;  // false once folded or sitting out
  isHero:     boolean;
}

// Transient in-memory representation of a hand in progress.
// Built up by the Platform Connector as events arrive.
// Never persisted — serialised into a Hand object when the hand ends.
export interface GameState {
  handId:     string;
  tableId:    string;
  platform:   string;
  timestamp:  number;    // Unix ms when NEW_HAND was observed
  gameType:   string;
  stakes: {
    sb: number;
    bb: number;
  };
  maxSeats:   number;
  street:     Street;
  dealerSeat: number;
  heroSeat:   number;
  // Keyed by seat number (1-based)
  seats:      Record<number, SeatState>;
  // Seats with a player in them per the CO_TABLE_INFO join snapshot (1-based).
  // UI-only (drives the seat chips); hand records list dealt-in players only.
  occupiedSeats: number[];
  board:      Card[];
  // Side pots: index 0 = main pot
  pots:       number[];
  rake:       number[];
  actions:    Action[];
}

export function createEmptyGameState(): GameState {
  return {
    handId:     '',
    tableId:    '',
    platform:   '',
    timestamp:  0,
    gameType:   '',
    stakes:     { sb: 0, bb: 0 },
    maxSeats:   9,
    street:     Street.WAITING,
    dealerSeat: 0,
    heroSeat:   0,
    seats:      {},
    occupiedSeats: [],
    board:      [],
    pots:       [0],
    rake:       [0],
    actions:    [],
  };
}
