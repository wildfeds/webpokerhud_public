import { Card, Street, ActionType } from '../../model';

// card_code = suit * 13 + rank
// suit: 0=c 1=d 2=h 3=s   rank: 0=A 1=2 ... 12=K
const SUITS = ['c', 'd', 'h', 's'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const HIDDEN_CARD = 32896;

export function decodeCard(code: number): Card | null {
  if (code === HIDDEN_CARD || code == null) return null;
  const suit = SUITS[Math.floor(code / 13)];
  const rank = RANKS[code % 13];
  if (!suit || !rank) return null;
  return `${rank}${suit}` as Card;
}

const TABLE_STATE_MAP: Record<number, Street> = {
  1:     Street.WAITING,
  2:     Street.NEW_HAND,
  4:     Street.POSTING_BLINDS,
  8:     Street.PREFLOP,
  16:    Street.FLOP,
  32:    Street.TURN,
  64:    Street.RIVER,
  32768: Street.SHOWDOWN,
  65536: Street.RESULT,
};

export function tableStateToStreet(tableState: number): Street | null {
  return TABLE_STATE_MAP[tableState] ?? null;
}

// btn: 2 = SB, 4 = BB
export function blindBtnToActionType(btn: number): ActionType {
  return btn === 4 ? ActionType.POST_BB : ActionType.POST_SB;
}

// Verified against stack deltas in captured sessions:
// 128 = lead bet, 256 = call, 512 = raise (preflop opens included — the
// blinds count as the open bet, so btn distinguishes bet/raise natively).
export function selectBtnToActionType(btn: number): ActionType {
  if (btn & 64)    return ActionType.CHECK;
  if (btn & 128)   return ActionType.BET;
  if (btn & 256)   return ActionType.CALL;
  if (btn & 512)   return ActionType.RAISE;
  if (btn & 1024)  return ActionType.FOLD;
  if (btn & 2048)  return ActionType.ALL_IN;
  if (btn & 4096)  return ActionType.ALL_IN;
  if (btn & 8192)  return ActionType.SHOW;
  if (btn & 32768) return ActionType.MUCK;
  return ActionType.FOLD;
}

// CO_TABLE_INFO.seatState values observed with a player in the seat (16, 80 in
// captures; PLAY_SEAT_INFO also reports state 16 for a seated player). 0 is
// empty; 32 has been seen but is undecoded — suspected empty/reserved, so it
// deliberately does NOT count as occupied until a capture proves otherwise.
const OCCUPIED_SEAT_STATES = new Set([16, 80]);

// Occupied seat numbers (1-based) from a CO_TABLE_INFO seatState array
// (0-indexed: seatState[i] describes seat i+1).
export function decodeOccupiedSeats(seatState: unknown): number[] {
  if (!Array.isArray(seatState)) return [];
  return seatState
    .map((state, i) => (OCCUPIED_SEAT_STATES.has(Number(state)) ? i + 1 : 0))
    .filter(seat => seat > 0);
}
