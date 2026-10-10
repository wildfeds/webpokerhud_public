// Shared plumbing for the text exports (2+2 forum text, PokerStars format):
// a street-by-street walk over a stored Hand that both formatters consume.
// Pure; unit-tested through the formatters.

import { Action, ActionType, Card, Hand, Player, Street } from '../model';
import { seatPositions, netWonInHand } from '../analysis';

export type BettingStreet = 'preflop' | 'flop' | 'turn' | 'river';
export const BETTING_ORDER: BettingStreet[] = ['preflop', 'flop', 'turn', 'river'];

const BOARD_CARDS: Record<BettingStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

// How an action reads once street context is known.
export interface WalkedAction {
  action:   Action;
  player:   Player;
  kind:     'post' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'show' | 'muck';
  allIn:    boolean;
  amount:   number;   // call/bet amount, or raise-to total for raises (cents)
  raiseBy:  number;   // for raises: increment over the previous street max
}

export interface WalkedStreet {
  street:    BettingStreet;
  board:     Card[];          // board visible on this street
  potBefore: number;          // chips in the pot when the street starts
  players:   Player[];        // still in the hand at the start of the street
  actions:   WalkedAction[];
}

export interface HandWalk {
  hand:       Hand;
  hero:       Player | null;
  positions:  Map<number, string>;   // seat → BTN / SB / … (may be empty)
  players:    Player[];              // dealt in, seat order
  blinds:     WalkedAction[];        // posting actions
  streets:    WalkedStreet[];        // only streets that were reached
  // Chips bet on the final betting street beyond what anyone matched —
  // returned to the bettor outside the pot. Null when fully called.
  uncalled:   { player: Player; amount: number } | null;
  lastBetting: BettingStreet | null;   // last street with any action
  showdown:   boolean;               // ≥ 2 players never folded
  winners:    { player: Player; amount: number }[];   // from results, potWon > 0
  heroNet:    number;                // cents
}

export function playerBySeat(hand: Hand, seat: number): Player | undefined {
  return hand.players.find(p => p.seat === seat);
}

function foldedBefore(hand: Hand, playerId: string, upTo: number): boolean {
  for (let i = 0; i < upTo; i++) {
    const a = hand.actions[i]!;
    if (a.playerId === playerId && a.type === ActionType.FOLD) return true;
  }
  return false;
}

function streetOf(a: Action): BettingStreet | null {
  switch (a.street) {
    case Street.PREFLOP: return 'preflop';
    case Street.FLOP:    return 'flop';
    case Street.TURN:    return 'turn';
    case Street.RIVER:   return 'river';
    default:             return null;
  }
}

export function walkHand(hand: Hand): HandWalk {
  const players = [...hand.players].sort((a, b) => a.seat - b.seat);
  const hero = players.find(p => p.isHero) ?? null;
  const positions = seatPositions(hand);
  const byId = new Map(players.map(p => [p.playerId, p]));

  const blinds: WalkedAction[] = [];
  const perStreet = new Map<BettingStreet, WalkedAction[]>();
  const streetMax = new Map<BettingStreet, number>();
  let potSoFar = 0;
  const potAtStart = new Map<BettingStreet, number>();

  hand.actions.forEach((a, idx) => {
    const player = byId.get(a.playerId);
    if (!player) return;
    if (a.street === Street.POSTING_BLINDS || a.street === Street.NEW_HAND) {
      if (a.type === ActionType.POST_SB || a.type === ActionType.POST_BB) {
        blinds.push({ action: a, player, kind: 'post', allIn: false, amount: a.amount, raiseBy: 0 });
        potSoFar += a.amount;
      }
      return;
    }
    const street = streetOf(a);
    if (!street) {
      // showdown / result phase: shows and mucks ride on the river block
      if (a.type === ActionType.SHOW || a.type === ActionType.MUCK) {
        const last = lastStreet(perStreet) ?? 'preflop';
        getList(perStreet, last).push({
          action: a, player, kind: a.type === ActionType.SHOW ? 'show' : 'muck',
          allIn: false, amount: 0, raiseBy: 0,
        });
      }
      return;
    }
    if (!potAtStart.has(street)) {
      potAtStart.set(street, potSoFar);
      // Preflop opens with the blinds already counted as this street's max.
      streetMax.set(street, street === 'preflop'
        ? Math.max(0, ...blinds.map(b => b.action.totalStreetBet)) : 0);
    }
    const prevMax = streetMax.get(street) ?? 0;
    const list = getList(perStreet, street);
    let kind: WalkedAction['kind'];
    let amount = a.amount;
    let raiseBy = 0;
    let allIn = false;
    switch (a.type) {
      case ActionType.FOLD:  kind = 'fold'; break;
      case ActionType.CHECK: kind = 'check'; break;
      case ActionType.CALL:  kind = 'call'; break;
      case ActionType.BET:   kind = 'bet'; break;
      case ActionType.RAISE:
        kind = 'raise'; amount = a.totalStreetBet; raiseBy = a.totalStreetBet - prevMax; break;
      case ActionType.ALL_IN:
        allIn = true;
        if (a.totalStreetBet > prevMax) {
          if (prevMax === 0) { kind = 'bet'; amount = a.amount; }
          else { kind = 'raise'; amount = a.totalStreetBet; raiseBy = a.totalStreetBet - prevMax; }
        } else {
          kind = 'call';
        }
        break;
      case ActionType.SHOW:  kind = 'show'; break;
      case ActionType.MUCK:  kind = 'muck'; break;
      default:               kind = 'post'; break;
    }
    list.push({ action: a, player, kind, allIn, amount, raiseBy });
    potSoFar += a.amount;
    streetMax.set(street, Math.max(prevMax, a.totalStreetBet));
    void idx;
  });

  // Streets reached: every betting street with actions, plus later streets
  // the board ran out on (all-in) up to the dealt board length.
  const reached: WalkedStreet[] = [];
  const boardStreets = hand.board.length >= 5 ? 4 : hand.board.length >= 4 ? 3 : hand.board.length >= 3 ? 2 : 1;
  const lastActed = lastStreet(perStreet);
  const lastIdx = Math.max(lastActed ? BETTING_ORDER.indexOf(lastActed) : 0, boardStreets - 1);
  let pot = blinds.reduce((a, b) => a + b.action.amount, 0);
  for (let i = 0; i <= lastIdx; i++) {
    const street = BETTING_ORDER[i]!;
    const actions = perStreet.get(street) ?? [];
    const firstIdx = actions.length > 0 ? hand.actions.indexOf(actions[0]!.action) : hand.actions.length;
    const alive = players.filter(p => !foldedBefore(hand, p.playerId, firstIdx));
    reached.push({
      street, board: hand.board.slice(0, BOARD_CARDS[street]),
      potBefore: potAtStart.get(street) ?? pot, players: alive, actions,
    });
    pot += actions.reduce((a, w) => a + w.action.amount, 0);
  }

  // Uncalled bet: on the last street with betting, the top committed amount
  // beyond the next-highest among the other players.
  let uncalled: HandWalk['uncalled'] = null;
  if (lastActed) {
    const maxBy = new Map<string, number>();
    for (const w of perStreet.get(lastActed) ?? []) {
      maxBy.set(w.player.playerId, Math.max(maxBy.get(w.player.playerId) ?? 0, w.action.totalStreetBet));
    }
    if (lastActed === 'preflop') {
      for (const b of blinds) {
        maxBy.set(b.player.playerId, Math.max(maxBy.get(b.player.playerId) ?? 0, b.action.totalStreetBet));
      }
    }
    const sorted = [...maxBy.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topId, top] = sorted[0]!;
      const second = sorted[1]?.[1] ?? 0;
      if (top > second) {
        const player = byId.get(topId);
        if (player) uncalled = { player, amount: top - second };
      }
    }
  }

  // Streets dealt after the betting ended (an all-in run-out) start with the
  // real pot: the uncalled chips never went in.
  if (uncalled && lastActed) {
    const lastActedIdx = BETTING_ORDER.indexOf(lastActed);
    for (const s of reached) {
      if (BETTING_ORDER.indexOf(s.street) > lastActedIdx) s.potBefore -= uncalled.amount;
    }
  }

  const folded = (id: string) => hand.actions.some(a => a.playerId === id && a.type === ActionType.FOLD);
  const showdown = players.filter(p => !folded(p.playerId)).length >= 2;

  const wonBy = new Map<string, number>();
  for (const r of hand.results) {
    if (r.potWon > 0) wonBy.set(r.playerId, (wonBy.get(r.playerId) ?? 0) + r.potWon);
  }
  const winners = [...wonBy.entries()]
    .map(([id, amount]) => ({ player: byId.get(id), amount }))
    .filter((w): w is { player: Player; amount: number } => !!w.player);

  return {
    hand, hero, positions, players, blinds, streets: reached, uncalled, lastBetting: lastActed,
    showdown, winners,
    heroNet: hero ? netWonInHand(hand, hero.playerId) : 0,
  };
}

function getList(map: Map<BettingStreet, WalkedAction[]>, s: BettingStreet): WalkedAction[] {
  let list = map.get(s);
  if (!list) { list = []; map.set(s, list); }
  return list;
}

function lastStreet(map: Map<BettingStreet, WalkedAction[]>): BettingStreet | null {
  let last: BettingStreet | null = null;
  for (const s of BETTING_ORDER) if ((map.get(s)?.length ?? 0) > 0) last = s;
  return last;
}

// "$0.05" / "$12.50" — unsigned, two decimals.
export function usd2(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// "$3" / "$0.50" / "$2.75" — unsigned, trailing zeros trimmed (forum style).
export function usdShort(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

// Hand timestamp in PokerStars' "YYYY/MM/DD HH:MM:SS" shape for a time zone.
export function formatStamp(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}/${get('month')}/${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}
