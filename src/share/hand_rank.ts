// Best five-card hand from up to seven cards, with the wording PokerStars
// hand histories use at showdown ("a pair of Kings", "two pair, Aces and
// Tens", "a straight, Nine to King"). Only the text exports need this, so it
// favours obvious code over speed: every 5-card combination is scored and the
// best kept. Pure, unit-tested.

import { Card, Rank, RANKS } from '../model';

export type HandCategory =
  | 'high_card' | 'pair' | 'two_pair' | 'three_of_a_kind' | 'straight'
  | 'flush' | 'full_house' | 'four_of_a_kind' | 'straight_flush' | 'royal_flush';

export interface RankedHand {
  category: HandCategory;
  // Rank values (2..14) that define the hand, most significant first:
  // pair → [pairRank, kicker, kicker, kicker]; straight → [highRank]; etc.
  ranks:    number[];
  // Comparable score: higher wins.
  score:    number;
}

const CATEGORY_ORDER: HandCategory[] = [
  'high_card', 'pair', 'two_pair', 'three_of_a_kind', 'straight',
  'flush', 'full_house', 'four_of_a_kind', 'straight_flush', 'royal_flush',
];

const RANK_VALUE: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const SINGULAR: Record<number, string> = {
  2: 'Deuce', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};
const PLURAL: Record<number, string> = {
  2: 'Deuces', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights',
  9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

export function rankValue(card: Card): number {
  return RANK_VALUE[card[0] as Rank] ?? 0;
}

// Score five cards exactly.
function scoreFive(cards: Card[]): RankedHand {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const suits = new Set(cards.map(c => c[1]));
  const flush = suits.size === 1;

  // Straight: five distinct consecutive values, or the wheel (A-2-3-4-5).
  const distinct = [...new Set(values)];
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0]! - distinct[4]! === 4) straightHigh = distinct[0]!;
    else if (distinct.join(',') === '14,5,4,3,2') straightHigh = 5;
  }

  // Group by count, then by rank (desc).
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);   // [rank, count]
  const pattern = groups.map(g => g[1]).join('');
  const ordered = groups.map(g => g[0]);

  let category: HandCategory;
  let ranks: number[];
  if (straightHigh && flush) {
    category = straightHigh === 14 ? 'royal_flush' : 'straight_flush';
    ranks = [straightHigh];
  } else if (pattern === '41') {
    category = 'four_of_a_kind'; ranks = ordered;
  } else if (pattern === '32') {
    category = 'full_house'; ranks = ordered;
  } else if (flush) {
    category = 'flush'; ranks = values;
  } else if (straightHigh) {
    category = 'straight'; ranks = [straightHigh];
  } else if (pattern === '311') {
    category = 'three_of_a_kind'; ranks = ordered;
  } else if (pattern === '221') {
    category = 'two_pair'; ranks = ordered;
  } else if (pattern === '2111') {
    category = 'pair'; ranks = ordered;
  } else {
    category = 'high_card'; ranks = values;
  }

  // Base-15 positional score: category first, then the defining ranks.
  let score = CATEGORY_ORDER.indexOf(category);
  for (let i = 0; i < 5; i++) score = score * 15 + (ranks[i] ?? 0);
  return { category, ranks, score };
}

// Best hand over all 5-card subsets of `cards` (5–7 cards). Null below five.
export function bestHand(cards: Card[]): RankedHand | null {
  if (cards.length < 5) return null;
  let best: RankedHand | null = null;
  const n = cards.length;
  const pick: Card[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      const h = scoreFive(pick);
      if (!best || h.score > best.score) best = h;
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]!);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return best;
}

// PokerStars-style description of a ranked hand.
export function describeHand(h: RankedHand): string {
  const r = h.ranks;
  switch (h.category) {
    case 'royal_flush':     return 'a Royal Flush';
    case 'straight_flush':  return `a straight flush, ${SINGULAR[r[0]! - 4]} to ${SINGULAR[r[0]!]}`;
    case 'four_of_a_kind':  return `four of a kind, ${PLURAL[r[0]!]}`;
    case 'full_house':      return `a full house, ${PLURAL[r[0]!]} full of ${PLURAL[r[1]!]}`;
    case 'flush':           return `a flush, ${SINGULAR[r[0]!]} high`;
    case 'straight':        return `a straight, ${SINGULAR[r[0]! === 5 ? 14 : r[0]! - 4]} to ${SINGULAR[r[0]!]}`;
    case 'three_of_a_kind': return `three of a kind, ${PLURAL[r[0]!]}`;
    case 'two_pair':        return `two pair, ${PLURAL[r[0]!]} and ${PLURAL[r[1]!]}`;
    case 'pair':            return `a pair of ${PLURAL[r[0]!]}`;
    case 'high_card':       return `high card ${SINGULAR[r[0]!]}`;
  }
}

// Convenience: description of the best hand, or null below five cards.
export function describeBest(cards: Card[]): string | null {
  const h = bestHand(cards);
  return h ? describeHand(h) : null;
}
