// Layer 4 — pure functions over Hand[]. No I/O, no platform or storage
// knowledge: takes completed hands, returns statistics.
import { Hand, Action, ActionType, Street } from '../model';
import { seatPositions } from './position';

// A conditional stat as a raw counter: n = times made, d = opportunities.
// The percentage (n/d) is derived at display time so small samples stay legible.
export interface Counter { n: number; d: number }

// Percentage for a counter, or 0 when there were no opportunities.
export function counterPct(c: Counter): number {
  return c.d > 0 ? (c.n / c.d) * 100 : 0;
}

type StreetCounters = { flop: Counter; turn: Counter; river: Counter };

// Reference to a stored hand held up as a worked example of a stat.
export interface HandRef { handId: string; tableId: string; timestamp: number }

// Stats that carry an example hand — the latest hand where the stat's event
// actually happened (the numerator, not merely an opportunity). Keys are per
// UI row, so per-street counters (c-bet F/T/R) share one key.
export type StatExampleKey =
  | 'steal' | 'foldBBToSteal' | 'foldSBToSteal' | 'squeeze' | 'coldCall'
  | 'fourBet' | 'foldTo4Bet' | 'cbet' | 'foldToCbet' | 'checkRaise' | 'wwsf';

export type StatExamples = Partial<Record<StatExampleKey, HandRef>>;

type NoteExample = (key: StatExampleKey, made: boolean) => void;

export interface HeroStats {
  playerId:    string;
  handsPlayed: number;
  vpip:        number;   // % of hands with voluntary preflop chips
  pfr:         number;   // % of hands with a preflop raise
  threeBet:    number;   // % of 3-bet opportunities taken
  foldTo3Bet:  number;   // % folded when re-raised after own preflop raise
  af:          number;   // (bets + raises) / calls, all streets
  afByStreet:  { preflop: number; flop: number; turn: number; river: number };
  wtsd:        number;   // % went to showdown, of hands that saw the flop
  wsd:         number;   // % won money at showdown, of showdowns reached
  winRate:     number;   // net chips per hand

  // ── Extended (Phase 3) — counter-based; percentages derived via counterPct ──
  steal:         Counter;                                   // raise first-in from CO/BTN/SB
  stealByPos:    { co: Counter; btn: Counter; sb: Counter };
  foldBBToSteal: Counter;                                   // fold in BB vs a steal open
  foldSBToSteal: Counter;                                   // fold in SB vs a steal open
  fourBet:       Counter;                                   // re-raise after own open was 3-bet
  foldTo4Bet:    Counter;                                   // fold after own 3-bet was 4-bet
  squeeze:       Counter;                                   // raise vs an open + ≥1 caller
  coldCall:      Counter;                                   // call an open, out of the blinds, first in
  cbet:          StreetCounters;                            // c-bet as preflop aggressor
  foldToCbet:    StreetCounters;                            // fold facing the PFA's c-bet
  checkRaise:    StreetCounters;                            // check then raise a bet
  afq:           StreetCounters;                            // aggressive actions / all actions
  wwsf:          Counter;                                   // won money | saw the flop
  examples:      StatExamples;                              // latest example hand per stat
}

// Phase 1 (Bovada, anonymous tables): only the hero has a stable playerId.
export function computeHeroStats(hands: Hand[], heroPlayerId: string): HeroStats {
  return computePlayerStats(hands, heroPlayerId);
}

// Cumulative net chips after each hand the player was dealt in, in play order
// (hands arrive timestamp-ascending). series[k] = running net over hands 0..k.
// Per-hand net matches the Win Rate definition in computePlayerStats.
export function computeNetSeries(hands: Hand[], playerId: string): number[] {
  const series: number[] = [];
  let cumulative = 0;
  for (const hand of hands) {
    if (!hand.players.some(p => p.playerId === playerId)) continue;
    cumulative += netWonInHand(hand, playerId);
    series.push(cumulative);
  }
  return series;
}

// Same showdown semantics as walkHand: the player never folded and at least
// two players were still in at the end of the hand.
export function reachedShowdownIn(hand: Hand, playerId: string): boolean {
  const folded = (id: string) =>
    hand.actions.some(a => a.playerId === id && a.type === ActionType.FOLD);
  if (folded(playerId)) return false;
  return hand.players.filter(p => !folded(p.playerId)).length >= 2;
}

// Generic core — works for any playerId with cross-hand identity
// (hero everywhere; opponents too on named platforms, Phase 2).
export function computePlayerStats(hands: Hand[], playerId: string): HeroStats {
  const played = hands.filter(h => h.players.some(p => p.playerId === playerId));

  let vpipHands = 0, pfrHands = 0;
  let threeBets = 0, threeBetOpps = 0;
  let foldsTo3Bet = 0, faced3Bets = 0;
  const aggr    = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const calls   = { preflop: 0, flop: 0, turn: 0, river: 0 };
  let sawFlop = 0, showdowns = 0, wonAtShowdown = 0;
  let netChips = 0;
  const ext = newExtCounters();

  for (const hand of played) {
    const w = walkHand(hand, playerId);
    if (w.vpip) vpipHands++;
    if (w.pfr) pfrHands++;
    threeBets    += w.threeBets;
    threeBetOpps += w.threeBetOpps;
    foldsTo3Bet  += w.foldsTo3Bet;
    faced3Bets   += w.faced3Bets;
    for (const street of BETTING_STREETS) {
      aggr[street]  += w.aggr[street];
      calls[street] += w.calls[street];
    }
    if (w.sawFlop) sawFlop++;
    if (w.reachedShowdown) {
      showdowns++;
      if (hand.results.some(r => r.playerId === playerId && r.potWon > 0)) wonAtShowdown++;
    }
    netChips += netWonInHand(hand, playerId);
    walkExtended(ext, hand, playerId);
  }

  const totalAggr  = sum(Object.values(aggr));
  const totalCalls = sum(Object.values(calls));

  return {
    playerId,
    handsPlayed: played.length,
    vpip:        pct(vpipHands, played.length),
    pfr:         pct(pfrHands, played.length),
    threeBet:    pct(threeBets, threeBetOpps),
    foldTo3Bet:  pct(foldsTo3Bet, faced3Bets),
    af:          ratio(totalAggr, totalCalls),
    afByStreet: {
      preflop: ratio(aggr.preflop, calls.preflop),
      flop:    ratio(aggr.flop, calls.flop),
      turn:    ratio(aggr.turn, calls.turn),
      river:   ratio(aggr.river, calls.river),
    },
    wtsd:    pct(showdowns, sawFlop),
    wsd:     pct(wonAtShowdown, showdowns),
    winRate: played.length > 0 ? netChips / played.length : 0,
    ...ext,
  };
}

// ── Per-hand walk ────────────────────────────────────────────────────────────

const BETTING_STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
type BettingStreet = (typeof BETTING_STREETS)[number];

// Blind posts (street 'posting_blinds') share a betting round with preflop:
// street bets carry over, so an ALL_IN over the blinds compares against them.
function bettingRound(street: Street): BettingStreet | null {
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

function walkHand(hand: Hand, playerId: string) {
  const aggr  = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const calls = { preflop: 0, flop: 0, turn: 0, river: 0 };
  let vpip = false, pfr = false;
  let threeBets = 0, threeBetOpps = 0;
  let foldsTo3Bet = 0, faced3Bets = 0;

  const maxStreetBet: Record<BettingStreet, number> = { preflop: 0, flop: 0, turn: 0, river: 0 };
  let preflopRaises = 0;        // aggressive preflop actions by anyone
  let playerRaisedPreflop = false;
  let reRaisedSincePlayerRaise = false;

  for (const action of hand.actions) {
    const round = bettingRound(action.street);
    if (!round) continue;
    const mine = action.playerId === playerId;

    // Aggressive = opened or increased the price of the street. ALL_IN is a
    // single ActionType; classify by whether it beat the prior street max.
    const aggressive =
      action.type === ActionType.BET ||
      action.type === ActionType.RAISE ||
      (action.type === ActionType.ALL_IN && action.totalStreetBet > maxStreetBet[round]);
    const passive =
      action.type === ActionType.CALL ||
      (action.type === ActionType.ALL_IN && !aggressive);

    if (mine) {
      if (aggressive) aggr[round]++;
      if (passive)    calls[round]++;

      if (round === 'preflop' && !isBlindPost(action)) {
        if (aggressive || passive) vpip = true;
        if (aggressive) pfr = true;

        // 3-bet: raising when facing exactly the open raise
        if (preflopRaises === 1) {
          threeBetOpps++;
          if (aggressive) threeBets++;
        }
        // Fold to 3-bet: acting after own raise was re-raised
        if (playerRaisedPreflop && reRaisedSincePlayerRaise) {
          faced3Bets++;
          if (action.type === ActionType.FOLD) foldsTo3Bet++;
          reRaisedSincePlayerRaise = false;
        }
        if (aggressive) {
          playerRaisedPreflop = true;
          reRaisedSincePlayerRaise = false;
        }
      }
    } else if (round === 'preflop' && aggressive && playerRaisedPreflop) {
      reRaisedSincePlayerRaise = true;
    }

    if (round === 'preflop' && aggressive && !isBlindPost(action)) preflopRaises++;
    maxStreetBet[round] = Math.max(maxStreetBet[round], action.totalStreetBet);
  }

  const folded = (id: string) =>
    hand.actions.some(a => a.playerId === id && a.type === ActionType.FOLD);
  const playersIn = hand.players.filter(p => !folded(p.playerId)).length;
  const playerFolded = folded(playerId);
  const foldedPreflop = hand.actions.some(
    a => a.playerId === playerId && a.type === ActionType.FOLD && bettingRound(a.street) === 'preflop');

  const sawFlop = hand.board.length >= 3 && !foldedPreflop;
  const reachedShowdown = !playerFolded && playersIn >= 2;

  return { vpip, pfr, threeBets, threeBetOpps, foldsTo3Bet, faced3Bets,
           aggr, calls, sawFlop, reachedShowdown };
}

function isBlindPost(action: Action): boolean {
  return action.type === ActionType.POST_SB || action.type === ActionType.POST_BB;
}

// ── Extended stats (Phase 3) ──────────────────────────────────────────────────
// A separate single-pass walk that computes the PT4-class counter stats. Kept
// apart from walkHand so the proven Phase-1 stats are untouched. Positions are
// derived per hand; hands on unsupported table sizes contribute non-positional
// stats only.

type ExtCounters = Pick<HeroStats,
  'steal' | 'stealByPos' | 'foldBBToSteal' | 'foldSBToSteal' | 'fourBet' |
  'foldTo4Bet' | 'squeeze' | 'coldCall' | 'cbet' | 'foldToCbet' | 'checkRaise' |
  'afq' | 'wwsf' | 'examples'>;

const c = (): Counter => ({ n: 0, d: 0 });
const sc = (): StreetCounters => ({ flop: c(), turn: c(), river: c() });

export function newExtCounters(): ExtCounters {
  return {
    steal: c(), stealByPos: { co: c(), btn: c(), sb: c() },
    foldBBToSteal: c(), foldSBToSteal: c(),
    fourBet: c(), foldTo4Bet: c(), squeeze: c(), coldCall: c(),
    cbet: sc(), foldToCbet: sc(), checkRaise: sc(), afq: sc(), wwsf: c(),
    examples: {},
  };
}

// Record an opportunity (and whether it was taken) on a counter.
function obs(counter: Counter, made: boolean): void {
  counter.d++;
  if (made) counter.n++;
}

const STEAL_POSITIONS = new Set(['CO', 'BTN', 'SB']);

function walkExtended(acc: ExtCounters, hand: Hand, playerId: string): void {
  const hero = hand.players.find(p => p.playerId === playerId);
  if (!hero) return;
  const heroSeat = hero.seat;
  const positions = seatPositions(hand);
  const heroPos = positions.get(heroSeat) ?? null;

  // Latest-example recorder for this hand: when a stat's event happens, keep
  // this hand's ref unless a newer example is already stored.
  const ref: HandRef = { handId: hand.handId, tableId: hand.tableId, timestamp: hand.timestamp };
  const note: NoteExample = (key, made) => {
    if (!made) return;
    const prev = acc.examples[key];
    if (!prev || ref.timestamp >= prev.timestamp) acc.examples[key] = ref;
  };

  const pfaSeat = walkExtendedPreflop(acc, hand, playerId, heroSeat, heroPos, positions, note);

  // WWSF: won money given the player saw the flop (didn't fold preflop).
  const foldedPreflop = hand.actions.some(
    a => a.playerId === playerId && a.type === ActionType.FOLD && bettingRound(a.street) === 'preflop');
  if (hand.board.length >= 3 && !foldedPreflop) {
    const won = netWonInHand(hand, playerId) > 0;
    obs(acc.wwsf, won);
    note('wwsf', won);
  }

  // Postflop streets, chaining c-bet eligibility (turn c-bet needs a flop c-bet).
  const heroIsPfa = pfaSeat !== null && pfaSeat === heroSeat;
  let cbetPrev = true;   // flop c-bet has no prior-street precondition
  for (const street of [Street.FLOP, Street.TURN, Street.RIVER] as const) {
    const key = street === Street.FLOP ? 'flop' : street === Street.TURN ? 'turn' : 'river';
    const reached = hand.board.length >= (street === Street.FLOP ? 3 : street === Street.TURN ? 4 : 5);
    cbetPrev = walkExtendedStreet(
      acc, hand, playerId, heroSeat, key, heroIsPfa, pfaSeat, reached && cbetPrev, note);
  }
}

// Preflop pass: steal, blind defense, squeeze, cold-call, 4-bet / fold-to-4-bet.
// Returns the seat of the preflop aggressor (last preflop raiser), or null.
function walkExtendedPreflop(
  acc: ExtCounters, hand: Hand, playerId: string,
  heroSeat: number, heroPos: string | null, positions: Map<number, string>,
  note: NoteExample,
): number | null {
  let numRaises = 0, numCallers = 0, maxBet = 0;
  let pfaSeat: number | null = null;
  let openerPos: string | null = null;
  let heroActed = false;
  let heroWasOpener = false, heroMade3Bet = false;
  let fourBetDone = false, foldTo4BetDone = false;

  for (const a of hand.actions) {
    if (bettingRound(a.street) !== 'preflop') break;   // preflop actions come first, in order
    if (isBlindPost(a)) { maxBet = Math.max(maxBet, a.totalStreetBet); continue; }

    const aggressive =
      a.type === ActionType.BET || a.type === ActionType.RAISE ||
      (a.type === ActionType.ALL_IN && a.totalStreetBet > maxBet);
    const mine = a.playerId === playerId;
    const firstIn = numRaises === 0 && numCallers === 0;

    if (mine) {
      // First-decision opportunities.
      if (!heroActed && heroPos) {
        if (firstIn && STEAL_POSITIONS.has(heroPos)) {
          obs(acc.steal, aggressive);
          note('steal', aggressive);
          const bucket = heroPos === 'CO' ? acc.stealByPos.co
            : heroPos === 'BTN' ? acc.stealByPos.btn : acc.stealByPos.sb;
          obs(bucket, aggressive);
        }
        // Facing a single steal-position open, heads-up, from the blinds.
        if (numRaises === 1 && numCallers === 0 && openerPos && STEAL_POSITIONS.has(openerPos)) {
          if (heroPos === 'BB') {
            obs(acc.foldBBToSteal, a.type === ActionType.FOLD);
            note('foldBBToSteal', a.type === ActionType.FOLD);
          }
          if (heroPos === 'SB') {
            obs(acc.foldSBToSteal, a.type === ActionType.FOLD);
            note('foldSBToSteal', a.type === ActionType.FOLD);
          }
        }
        // Squeeze: raise facing an open plus at least one cold-caller.
        if (numRaises === 1 && numCallers >= 1) {
          obs(acc.squeeze, aggressive);
          note('squeeze', aggressive);
        }
        // Cold-call: first voluntary call of an open, out of the blinds.
        if (numRaises === 1 && heroPos !== 'SB' && heroPos !== 'BB') {
          obs(acc.coldCall, a.type === ActionType.CALL);
          note('coldCall', a.type === ActionType.CALL);
        }
      }
      // Later-decision opportunities (may be hero's 2nd action).
      if (heroWasOpener && numRaises === 2 && !fourBetDone) {
        obs(acc.fourBet, aggressive);
        note('fourBet', aggressive);
        fourBetDone = true;
      }
      if (heroMade3Bet && numRaises === 3 && !foldTo4BetDone) {
        obs(acc.foldTo4Bet, a.type === ActionType.FOLD);
        note('foldTo4Bet', a.type === ActionType.FOLD);
        foldTo4BetDone = true;
      }
      heroActed = true;
    }

    // Apply the action to the running preflop state.
    if (aggressive) {
      if (numRaises === 0) openerPos = positions.get(a.seat) ?? null;
      numRaises++;
      pfaSeat = a.seat;
      if (mine) {
        if (numRaises === 1) heroWasOpener = true;
        if (numRaises === 2) heroMade3Bet = true;
      }
    } else if (a.type === ActionType.CALL) {
      numCallers++;
    }
    maxBet = Math.max(maxBet, a.totalStreetBet);
  }

  return pfaSeat;
}

// One postflop street. Returns whether the hero c-bet it (feeds the next
// street's c-bet eligibility).
function walkExtendedStreet(
  acc: ExtCounters, hand: Hand, playerId: string, heroSeat: number,
  key: 'flop' | 'turn' | 'river', heroIsPfa: boolean, pfaSeat: number | null,
  cbetEligible: boolean, note: NoteExample,
): boolean {
  const acts = hand.actions.filter(a => a.street === streetOf(key));
  let betOccurred = false, streetMax = 0;
  let lastAggressorSeat: number | null = null;
  let heroChecked = false, heroFirstDone = false;
  let foldToCbetDone = false, checkRaiseDone = false;
  let heroCbet = false;

  for (const a of acts) {
    const aggressive =
      a.type === ActionType.BET || a.type === ActionType.RAISE ||
      (a.type === ActionType.ALL_IN && a.totalStreetBet > streetMax);
    const mine = a.playerId === playerId;

    if (mine) {
      // Aggression frequency: aggressive actions over all actions this street.
      obs(acc.afq[key], aggressive);

      // C-bet: preflop aggressor makes the first bet, checked to or first to act.
      if (heroIsPfa && cbetEligible && !heroFirstDone && !betOccurred) {
        obs(acc.cbet[key], aggressive);
        note('cbet', aggressive);
        if (aggressive) heroCbet = true;
      }
      // Fold to c-bet: not the PFA, facing the PFA's bet.
      if (!heroIsPfa && betOccurred && lastAggressorSeat === pfaSeat && !foldToCbetDone) {
        obs(acc.foldToCbet[key], a.type === ActionType.FOLD);
        note('foldToCbet', a.type === ActionType.FOLD);
        foldToCbetDone = true;
      }
      // Check-raise: checked earlier, now a bet is in front.
      if (heroChecked && betOccurred && !checkRaiseDone) {
        obs(acc.checkRaise[key], aggressive);
        note('checkRaise', aggressive);
        checkRaiseDone = true;
      }
      if (a.type === ActionType.CHECK) heroChecked = true;
      heroFirstDone = true;
    }

    if (aggressive) { betOccurred = true; lastAggressorSeat = a.seat; }
    streetMax = Math.max(streetMax, a.totalStreetBet);
  }

  return heroCbet;
}

function streetOf(key: 'flop' | 'turn' | 'river'): Street {
  return key === 'flop' ? Street.FLOP : key === 'turn' ? Street.TURN : Street.RIVER;
}

// Winners: netWon is the authoritative whole-hand stack delta (identical in
// every result entry for the player — do not sum). Losers: chips invested
// minus any uncalled all-in excess returned outside the pot.
export function netWonInHand(hand: Hand, playerId: string): number {
  const result = hand.results.find(r => r.playerId === playerId);
  if (result) return result.netWon;
  const invested = sum(hand.actions.filter(a => a.playerId === playerId).map(a => a.amount));
  return uncalledRefund(hand, playerId) - invested;
}

// Chips bet beyond what the best-covered opponent matched on a round come
// back to the bettor outside the pot (all-in called for less). A refund can
// reach a LOSER only when someone was all-in — an uncalled bet with no all-in
// simply wins the pot (and carries a result row) — so the computation is
// gated on an ALL_IN action, which also keeps hands with partial action logs
// well-defined.
export function uncalledRefund(hand: Hand, playerId: string): number {
  if (!hand.actions.some(a => a.type === ActionType.ALL_IN)) return 0;

  const mine:   Record<BettingStreet, number> = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const others: Record<BettingStreet, number> = { preflop: 0, flop: 0, turn: 0, river: 0 };
  for (const a of hand.actions) {
    const round = bettingRound(a.street);
    if (!round) continue;
    const bucket = a.playerId === playerId ? mine : others;
    bucket[round] = Math.max(bucket[round], a.totalStreetBet);
  }
  return BETTING_STREETS.reduce((refund, r) => refund + Math.max(0, mine[r] - others[r]), 0);
}

// ── Small helpers ────────────────────────────────────────────────────────────

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

// AF with no calls observed: return the aggressive count (as if one call),
// avoiding Infinity while still signalling aggression.
function ratio(aggressive: number, calls: number): number {
  return calls > 0 ? aggressive / calls : aggressive;
}
