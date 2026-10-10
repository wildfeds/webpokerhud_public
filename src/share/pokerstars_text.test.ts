import { describe, it, expect } from 'vitest';
import { pokerStarsHandText, pokerStarsFileText } from './pokerstars_text';
import { PREFLOP_FOLD, FLOP_FOLD, SPLIT_SHOWDOWN, ALL_IN } from './fixtures/hands';
import { makeHand } from '../testing/fixtures';

describe('pokerStarsHandText', () => {
  it('writes a complete PokerStars-format hand', () => {
    expect(pokerStarsHandText(FLOP_FOLD)).toBe(
`PokerStars Hand #4904599212:  Hold'em No Limit ($0.05/$0.10 USD) - 2026/07/17 20:32:37 ET [2026/07/17 20:32:37 ET]
Table 'Bovada 37417367' 9-max Seat #4 is the button
Seat 4: Player4 ($12.97 in chips)
Seat 5: Hero ($10.00 in chips)
Player4: posts small blind $0.05
Hero: posts big blind $0.10
*** HOLE CARDS ***
Dealt to Hero [2h 6h]
Player4: raises $0.10 to $0.20
Hero: calls $0.10
*** FLOP *** [3c Kh 8d]
Hero: checks
Player4: bets $0.29
Hero: folds
Uncalled bet ($0.29) returned to Player4
Player4 collected $0.38 from pot
Player4: doesn't show hand
*** SUMMARY ***
Total pot $0.40 | Rake $0.02
Board [3c Kh 8d]
Seat 4: Player4 (button) (small blind) collected ($0.38)
Seat 5: Hero (big blind) folded on the Flop
`);
  });

  it('announces the uncalled bet before the run-out and describes both hands', () => {
    const text = pokerStarsHandText(ALL_IN)!;
    expect(text).toContain(
`Player3: bets $10.92 and is all-in
Player2: calls $7.61 and is all-in
Uncalled bet ($3.31) returned to Player3
*** RIVER *** [Qs 7s 9h 4h] [Td]
*** SHOW DOWN ***
Player2: shows [8c 8d] (a pair of Eights)
Player3: shows [Ac Ah] (a pair of Aces)
Player3 collected $22.99 from pot`);
    expect(text).toContain('Seat 2: Player2 (small blind) showed [8c 8d] and lost with a pair of Eights');
    expect(text).toContain('Seat 3: Player3 (big blind) showed [Ac Ah] and won ($22.99) with a pair of Aces');
    expect(text).toContain('Seat 1: Hero (button) folded before Flop (didn\'t bet)');
    expect(text).toContain('Seat 6: Player6 folded before Flop\n');   // posted, so no "(didn't bet)"
  });

  it('handles a split pot and a dead blind post', () => {
    const text = pokerStarsHandText(SPLIT_SHOWDOWN)!;
    expect(text).toContain('Player4: posts big blind $0.10\nHero: posts big blind $0.10');
    expect(text).toContain('Hero collected $0.29 from pot\nPlayer4 collected $0.29 from pot');
    expect(text).toContain('Seat 1: Hero showed [5c 2d] and won ($0.29) with a pair of Deuces');
    expect(text).toContain('Total pot $0.61 | Rake $0.03');
  });

  it('writes raise increments and a zero rake', () => {
    const text = pokerStarsHandText(PREFLOP_FOLD)!;
    expect(text).toContain('Player6: raises $0.20 to $0.30\nPlayer4: raises $0.60 to $0.90\nPlayer6: raises $1.30 to $2.20\nPlayer4: folds\nUncalled bet ($1.30) returned to Player6');
    expect(text).toContain('Total pot $1.80 | Rake $0.00');
    expect(text).not.toContain('Board');
  });

  it('respects the time zone option', () => {
    expect(pokerStarsHandText(FLOP_FOLD, { timeZone: 'UTC', tzLabel: 'UTC' })).toContain('- 2026/07/18 00:32:37 UTC [2026/07/18 00:32:37 UTC]');
  });

  it('skips records with no dealt-in players', () => {
    expect(pokerStarsHandText(makeHand())).toBeNull();
    const file = pokerStarsFileText([makeHand(), FLOP_FOLD, PREFLOP_FOLD]);
    expect(file.match(/PokerStars Hand #/g)).toHaveLength(2);
    expect(file).toContain('folded on the Flop\n\n\nPokerStars Hand #4904599058');
  });
});
