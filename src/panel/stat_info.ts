// Stat glossary definitions — the single source of truth for what each stat
// means. Rendered as popovers in the panel and, at build time, as the
// website's stat-glossary docs page (website/scripts/gen-stat-docs.ts) — keep
// this module free of DOM access and side effects so it stays importable from
// a Node build script.
import type { StatExampleKey } from '../analysis';

export interface StatInfo { title: string; definition: string; example?: StatExampleKey }

export const STAT_INFO: Record<string, StatInfo> = {
  steal: {
    title: 'Steal', example: 'steal',
    definition: 'Raise first-in from the cutoff, button, or small blind — an attempt to take the blinds before anyone else has entered the pot.',
  },
  stealByPos: {
    title: 'Steal by position',
    definition: 'Your steal frequency split by seat — cutoff / button / small blind. Each is a raise first-in from that position with no one else in the pot.',
  },
  foldBBToSteal: {
    title: 'Fold BB to steal', example: 'foldBBToSteal',
    definition: 'Fold in the big blind when facing a single steal-position open (CO/BTN/SB) with no callers.',
  },
  foldSBToSteal: {
    title: 'Fold SB to steal', example: 'foldSBToSteal',
    definition: 'Fold in the small blind when facing a single steal-position open (CO/BTN) with no callers.',
  },
  squeeze: {
    title: 'Squeeze', example: 'squeeze',
    definition: 'Raise facing an open plus at least one cold-caller — “squeezing” the caller between two raises.',
  },
  coldCall: {
    title: 'Cold call', example: 'coldCall',
    definition: 'Call an open raise at your first decision, from outside the blinds, with no chips already invested.',
  },
  fourBet: {
    title: '4-bet', example: 'fourBet',
    definition: 'Re-raise after your own open was 3-bet.',
  },
  foldTo4Bet: {
    title: 'Fold to 4-bet', example: 'foldTo4Bet',
    definition: 'Fold after your own 3-bet was 4-bet.',
  },
  cbet: {
    title: 'Continuation bet', example: 'cbet',
    definition: 'As the preflop aggressor, make the first bet on the street. Turn and river c-bets require having c-bet the street before.',
  },
  foldToCbet: {
    title: 'Fold to c-bet', example: 'foldToCbet',
    definition: 'Fold when facing the preflop aggressor’s continuation bet.',
  },
  checkRaise: {
    title: 'Check-raise', example: 'checkRaise',
    definition: 'Check, then raise after an opponent bets on the same street.',
  },
  afq: {
    title: 'Aggression frequency',
    definition: 'Aggressive actions (bets and raises) as a share of all your actions on the street: aggr / (aggr + calls + checks + folds).',
  },
  wwsf: {
    title: 'Won when saw flop', example: 'wwsf',
    definition: 'Won more money than you put in, over the hands where you saw the flop (WWSF).',
  },
  // Winnings-graph legend (definition-only).
  lineTotal: {
    title: 'Total winnings',
    definition: 'Cumulative net result over all dealt hands, in play order.',
  },
  lineEv: {
    title: 'All-in EV (luck-adjusted)',
    definition: 'What you “should” have won: in hands that went all-in before the last card with all cards revealed, the actual result is replaced by equity × pot. Running above the total line = running bad; below = running good. Shown only once it differs from the total.',
  },
  // Definition-only basics (core card, summary cards, Positions-tab headers).
  foldTo3Bet: {
    title: 'Fold to 3-bet',
    definition: '% of times you folded after your own preflop raise was re-raised (3-bet).',
  },
  winRate: {
    title: 'Win rate',
    definition: 'Average net result per hand played. bb/100 (in the summary above) is the same idea normalised by blind size, so mixed stakes compare.',
  },
  bb100: {
    title: 'bb / 100',
    definition: 'Big blinds won per 100 hands — win rate normalised by stake size. Computed per level, then combined, so mixed-stake samples stay comparable.',
  },
  handsWon: {
    title: 'Hands won',
    definition: '% of dealt hands where you won money — any pot, with or without showdown.',
  },
  sessions: {
    title: 'Sessions',
    definition: 'Continuous stretches of play. A new session starts after 30 minutes without a hand.',
  },
  vpip: {
    title: 'VPIP',
    definition: 'Voluntarily put money in pot: % of hands with a preflop call or raise (posting blinds doesn’t count).',
  },
  pfr: {
    title: 'PFR',
    definition: 'Preflop raise: % of hands where you raised before the flop.',
  },
  threeBet: {
    title: '3-bet',
    definition: 'Raise when facing exactly the open raise, over your opportunities to do so.',
  },
  af: {
    title: 'Aggression factor',
    definition: '(Bets + raises) ÷ calls, across all streets. Higher = more aggressive.',
  },
  wtsd: {
    title: 'Went to showdown',
    definition: '% of flops you saw that you took all the way to showdown.',
  },
  wsd: {
    title: 'Won $ at showdown',
    definition: '% of showdowns you reached where you won money (W$SD).',
  },
};
