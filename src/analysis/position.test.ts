import { describe, it, expect } from 'vitest';
import { ActionType, Street } from '../model';
import { makeHand } from '../testing/fixtures';
import { positionOf, seatPositions } from './position';

function player(seat: number, playerId: string, isHero = false) {
  return { seat, playerId, startStack: 1000, cards: null, isHero };
}

describe('seatPositions', () => {
  it('labels a 6-handed table from SB after the button', () => {
    // Button on seat 3 → SB=4, BB=5, UTG=6, MP=1, CO=2, BTN=3.
    const hand = makeHand({
      dealerSeat: 3,
      players: [1, 2, 3, 4, 5, 6].map(s => player(s, `p${s}`)),
    });
    const pos = seatPositions(hand);
    expect(pos.get(4)).toBe('SB');
    expect(pos.get(5)).toBe('BB');
    expect(pos.get(6)).toBe('UTG');
    expect(pos.get(1)).toBe('MP');
    expect(pos.get(2)).toBe('CO');
    expect(pos.get(3)).toBe('BTN');
  });

  it('treats the button as the small blind heads-up', () => {
    const hand = makeHand({ dealerSeat: 2, players: [player(1, 'a'), player(2, 'b')] });
    const pos = seatPositions(hand);
    expect(pos.get(2)).toBe('SB');
    expect(pos.get(1)).toBe('BB');
  });

  it('returns empty when the dealer seat was not dealt in', () => {
    const hand = makeHand({ dealerSeat: 9, players: [player(1, 'a'), player(2, 'b')] });
    expect(seatPositions(hand).size).toBe(0);
  });
});

describe('positionOf', () => {
  it('resolves a player id to its position', () => {
    const hand = makeHand({
      dealerSeat: 1,
      players: [player(1, 'btn'), player(2, 'sb'), player(3, 'bb')],
    });
    expect(positionOf(hand, 'btn')).toBe('BTN');
    expect(positionOf(hand, 'sb')).toBe('SB');
    expect(positionOf(hand, 'bb')).toBe('BB');
  });

  it('returns null for an absent player', () => {
    const hand = makeHand({ dealerSeat: 1, players: [player(1, 'a'), player(2, 'b')] });
    expect(positionOf(hand, 'ghost')).toBeNull();
  });
});

