// Layer 4 — session-scoped per-seat stats for anonymous tables (43). Pure.
//
// On anonymous Bovada a *seat* keeps its occupant until they leave, so within
// the current session per-seat VPIP/PFR/AF is a usable read (the DriveHUD
// "anonymous mode" trick). Occupant changes are detected by a stack
// discontinuity between consecutive hands and reset that seat's window; a
// rebuy also trips the check, which errs on the safe side (fresh read).
import { ActionType, Hand, Street } from '../model';
import { netWonInHand } from './hero_stats';

// Hands separated by more than this idle gap start a new session. The server's
// session splitting (panel_stats.ts there) uses the same value.
export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface SeatSessionStats {
  seat:  number;
  hands: number;
  vpip:  number;   // %
  pfr:   number;   // %
  af:    number;   // (bets + raises) / calls, all streets
}

export function computeSeatSessionStats(
  hands: Hand[], tableId: string, gapMs = SESSION_GAP_MS,
): SeatSessionStats[] {
  const atTable = hands.filter(h => h.tableId === tableId);
  if (atTable.length === 0) return [];

  // Current session: the trailing run of hands with no idle gap between them.
  let start = atTable.length - 1;
  while (start > 0 && atTable[start]!.timestamp - atTable[start - 1]!.timestamp <= gapMs) start--;
  const session = atTable.slice(start);

  interface Acc { hands: number; vpip: number; pfr: number; aggr: number; calls: number; expectedStack: number | null }
  const fresh = (): Acc => ({ hands: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0, expectedStack: null });
  const bySeat = new Map<number, Acc>();

  for (const hand of session) {
    for (const p of hand.players) {
      let acc = bySeat.get(p.seat) ?? fresh();
      // Stack doesn't follow from the previous hand → new occupant (or rebuy).
      if (acc.expectedStack !== null && Math.abs(p.startStack - acc.expectedStack) > 1) {
        acc = fresh();
      }
      const w = walkSeat(hand, p.playerId);
      acc.hands++;
      if (w.vpip) acc.vpip++;
      if (w.pfr) acc.pfr++;
      acc.aggr += w.aggr;
      acc.calls += w.calls;
      acc.expectedStack = p.startStack + netWonInHand(hand, p.playerId);
      bySeat.set(p.seat, acc);
    }
  }

  return [...bySeat.entries()]
    .map(([seat, a]) => ({
      seat,
      hands: a.hands,
      vpip:  a.hands > 0 ? (a.vpip / a.hands) * 100 : 0,
      pfr:   a.hands > 0 ? (a.pfr / a.hands) * 100 : 0,
      af:    a.calls > 0 ? a.aggr / a.calls : a.aggr,
    }))
    .sort((a, b) => a.seat - b.seat);
}

type Round = 'preflop' | 'flop' | 'turn' | 'river';

function roundOf(street: Street): Round | null {
  switch (street) {
    case Street.NEW_HAND:
    case Street.POSTING_BLINDS:
    case Street.PREFLOP: return 'preflop';
    case Street.FLOP:    return 'flop';
    case Street.TURN:    return 'turn';
    case Street.RIVER:   return 'river';
    default:             return null;
  }
}

// One player's VPIP/PFR flags and aggression counts for a hand — the same
// rules as walkHand (ALL_IN is aggressive when it beats the street's price).
function walkSeat(hand: Hand, playerId: string) {
  let vpip = false, pfr = false, aggr = 0, calls = 0;
  const maxBet: Record<Round, number> = { preflop: 0, flop: 0, turn: 0, river: 0 };

  for (const a of hand.actions) {
    const round = roundOf(a.street);
    if (!round) continue;
    const isBlind = a.type === ActionType.POST_SB || a.type === ActionType.POST_BB;
    if (!isBlind && a.playerId === playerId) {
      const aggressive =
        a.type === ActionType.BET || a.type === ActionType.RAISE ||
        (a.type === ActionType.ALL_IN && a.totalStreetBet > maxBet[round]);
      const passive =
        a.type === ActionType.CALL || (a.type === ActionType.ALL_IN && !aggressive);
      if (aggressive) aggr++;
      if (passive) calls++;
      if (round === 'preflop') {
        if (aggressive || passive) vpip = true;
        if (aggressive) pfr = true;
      }
    }
    maxBet[round] = Math.max(maxBet[round], a.totalStreetBet);
  }
  return { vpip, pfr, aggr, calls };
}
