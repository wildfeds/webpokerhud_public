import { describe, it, expect } from 'vitest';
import { forumHandText, FORUM_FOOTER } from './forum_text';
import { PREFLOP_FOLD, FLOP_FOLD, SPLIT_SHOWDOWN, ALL_IN } from './fixtures/hands';
import { makeHand } from '../testing/fixtures';

describe('forumHandText', () => {
  it('renders a flop fold in the 2+2 converter layout', () => {
    expect(forumHandText(FLOP_FOLD)).toBe(
`Bovada $0.05/$0.10 No Limit Hold'em - 2 players

SB: $12.97
Hero (BB): $10.00

Pre Flop: ($0.15) Hero is BB with 2h 6h
SB raises to $0.20, Hero calls $0.10

Flop: ($0.40) 3c Kh 8d (2 players)
Hero checks, SB bets $0.29, Hero folds

Final Pot: $0.40
SB wins $0.38
(Rake: $0.02)

${FORUM_FOOTER}
`);
  });

  it('handles a hand without the hero and no rake', () => {
    const text = forumHandText(PREFLOP_FOLD, { footer: false });
    expect(text).toContain('Pre Flop: ($0.15)\nSB raises to $0.30, BB raises to $0.90, SB raises to $2.20, BB folds');
    expect(text).toContain('Final Pot: $1.80\nSB wins $1.80\n');
    expect(text).not.toContain('Rake');
    expect(text).not.toContain(FORUM_FOOTER);
  });

  it('collapses folds, shows a dead post, and names both hands at a split showdown', () => {
    const text = forumHandText(SPLIT_SHOWDOWN);
    expect(text).toContain('Hero (CO): $10.00');
    expect(text).toContain('Pre Flop: ($0.25) Hero is CO with 5c 2d\nHero posts $0.10, 2 folds, Hero checks, 2 folds, BB checks');
    expect(text).toContain('Turn: ($0.25) 2s (2 players)\nBB bets $0.18, Hero calls $0.18');
    expect(text).toContain('Hero shows 5c 2d (a pair of Deuces)\nBB shows 2h 5h (a pair of Deuces)\nHero wins $0.29\nBB wins $0.29\n(Rake: $0.03)');
  });

  it('marks all-ins and shows the run-out with the real pot', () => {
    const text = forumHandText(ALL_IN);
    expect(text).toContain('SB checks, BB bets $10.92 (all-in), SB calls $7.61 (all-in)');
    expect(text).toContain('River: ($24.20) Td (2 players - all in)');
    expect(text).toContain('SB shows 8c 8d (a pair of Eights)\nBB shows Ac Ah (a pair of Aces)\nBB wins $22.99');
  });

  it('can use suit symbols', () => {
    expect(forumHandText(FLOP_FOLD, { suitSymbols: true })).toContain('Hero is BB with 2♥ 6♥');
  });

  it('does not throw on a record with no players', () => {
    expect(forumHandText(makeHand({ totalPot: 40, rake: 2 }))).toContain('Final Pot: $0.40');
  });
});
