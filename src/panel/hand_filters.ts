// Pure filter + sort logic for the Hands browser (items 34 and 50). Kept out
// of the page script so it is unit-testable (index.ts touches chrome.* and the
// DOM at module level).
import { HandSummary } from '../analysis';

// A pot at or above this many big blinds counts as "big" (item 50). Display
// threshold only — every hand is stored regardless of pot size.
export const BIG_POT_BB = 30;

export type HandSort = 'newest' | 'pot' | 'win' | 'loss';

export interface HandFilterState {
  position: string;   // 'all' or a POSITION_ORDER label
  result:   string;   // 'all' | 'won' | 'lost'
  street:   string;   // 'all' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
  line:     string;   // 'all' | '3bp' | 'pfa'
  pot:      string;   // 'all' | 'small' | 'mid' | 'big'
  sort:     HandSort;
}

export function defaultHandFilters(): HandFilterState {
  return { position: 'all', result: 'all', street: 'all', line: 'all', pot: 'all', sort: 'newest' };
}

// One-click retrieval presets (item 50).
export type HandPreset = 'bigPots' | 'bigWins' | 'bigLosses';

export const PRESET_LABELS: Record<HandPreset, string> = {
  bigPots:   `Big pots (${BIG_POT_BB}bb+)`,
  bigWins:   'Big wins',
  bigLosses: 'Big losses',
};

export function presetFilters(preset: HandPreset): HandFilterState {
  const f = defaultHandFilters();
  switch (preset) {
    case 'bigPots':   f.sort = 'pot';  f.pot = 'big';     break;
    case 'bigWins':   f.sort = 'win';  f.result = 'won';  break;
    case 'bigLosses': f.sort = 'loss'; f.result = 'lost'; break;
  }
  return f;
}

// The preset the current state exactly equals, so its button can highlight —
// and stop highlighting once the user hand-tunes any select.
export function activePreset(state: HandFilterState): HandPreset | null {
  for (const preset of Object.keys(PRESET_LABELS) as HandPreset[]) {
    if (JSON.stringify(presetFilters(preset)) === JSON.stringify(state)) return preset;
  }
  return null;
}

const STREET_ORD = { preflop: 0, flop: 1, turn: 2, river: 3 } as const;

// Filters then sorts the summaries. `hands` arrive newest-first (the 'newest'
// sort keeps that order); the input array is never mutated.
export function applyHandFilters(
  hands: HandSummary[], f: HandFilterState, holeKey: string | null,
): HandSummary[] {
  let out = hands;
  if (holeKey) out = out.filter(h => h.holeKey === holeKey);
  if (f.position !== 'all') out = out.filter(h => h.position === f.position);
  if (f.result === 'won')  out = out.filter(h => h.net > 0);
  if (f.result === 'lost') out = out.filter(h => h.net < 0);
  if (f.street === 'preflop') out = out.filter(h => h.streetReached === 'preflop');
  else if (f.street === 'showdown') out = out.filter(h => h.sawShowdown);
  else if (f.street !== 'all') {
    const min = STREET_ORD[f.street as keyof typeof STREET_ORD];
    out = out.filter(h => STREET_ORD[h.streetReached] >= min);
  }
  if (f.line === '3bp') out = out.filter(h => h.threeBetPot);
  if (f.line === 'pfa') out = out.filter(h => h.wasPfa);
  if (f.pot === 'small') out = out.filter(h => h.potBb < 10);
  if (f.pot === 'mid')   out = out.filter(h => h.potBb >= 10 && h.potBb < BIG_POT_BB);
  if (f.pot === 'big')   out = out.filter(h => h.potBb >= BIG_POT_BB);

  switch (f.sort) {
    case 'pot':  return [...out].sort((a, b) => b.potBb - a.potBb);
    case 'win':  return [...out].sort((a, b) => b.net - a.net);
    case 'loss': return [...out].sort((a, b) => a.net - b.net);
    default:     return out === hands ? [...out] : out;
  }
}
