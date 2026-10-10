import { describe, it, expect } from 'vitest';
import { bestHand, describeBest } from './hand_rank';
import { Card } from '../model';

const c = (s: string) => s.split(' ') as Card[];

describe('bestHand / describeBest', () => {
  it('needs five cards', () => {
    expect(bestHand(c('Ah Kh'))).toBeNull();
    expect(describeBest(c('Ah Kh Qh Jh'))).toBeNull();
  });

  it('names every category the PokerStars way', () => {
    expect(describeBest(c('Ah Kh Qh Jh Th 2c 3d'))).toBe('a Royal Flush');
    expect(describeBest(c('9s Ks Qs Js Ts 2c 3d'))).toBe('a straight flush, Nine to King');
    expect(describeBest(c('Jc Jd Jh Js 2c 3d 4h'))).toBe('four of a kind, Jacks');
    expect(describeBest(c('Kc Kd Kh 7s 7c 2d 3h'))).toBe('a full house, Kings full of Sevens');
    expect(describeBest(c('Ah 9h 5h 3h 2h Kc Qd'))).toBe('a flush, Ace high');
    expect(describeBest(c('9c Td Jh Qs Kc 2d 2h'))).toBe('a straight, Nine to King');
    expect(describeBest(c('Ac 2d 3h 4s 5c Kd Qh'))).toBe('a straight, Ace to Five');
    expect(describeBest(c('Qc Qd Qh 7s 2c 9d 4h'))).toBe('three of a kind, Queens');
    expect(describeBest(c('Ac Ad Tc Td 2h 9s 4c'))).toBe('two pair, Aces and Tens');
    expect(describeBest(c('Kc Kd 7h 2s 9c Jd 4h'))).toBe('a pair of Kings');
    expect(describeBest(c('Ac 9d 7h 2s Jc Kd 4h'))).toBe('high card Ace');
    expect(describeBest(c('2c 2d 7h 9s Jc Kd 4h'))).toBe('a pair of Deuces');
  });

  it('picks the best five of seven', () => {
    // Board gives two pair; the seven cards also hold a third pair — the best
    // two pair must use the two highest pairs.
    expect(describeBest(c('2c 2d 7h 7s Jc Jd 4h'))).toBe('two pair, Jacks and Sevens');
    // Flush beats a straight when both are available.
    expect(describeBest(c('9h Th Jh Qh 2h Kc 8d'))).toBe('a flush, Queen high');
  });

  it('ranks hands in order', () => {
    const s = (x: string) => bestHand(c(x))!.score;
    expect(s('Ah Kh Qh Jh Th 2c 3d')).toBeGreaterThan(s('9s Ks Qs Js Ts 2c 3d'));
    expect(s('Jc Jd Jh Js 2c 3d 4h')).toBeGreaterThan(s('Kc Kd Kh 7s 7c 2d 3h'));
    expect(s('Kc Kd 7h 2s 9c Jd 4h')).toBeGreaterThan(s('Qc Qd 7h 2s 9c Jd 4h'));   // KK > QQ
    expect(s('Kc Kd Ah 2s 9c Jd 4h')).toBeGreaterThan(s('Kh Ks Qh 2s 9c Jd 4h'));   // kicker
    // Real example: AA vs 88 on Qs 7s 9h 4h Td.
    expect(s('Ac Ah Qs 7s 9h 4h Td')).toBeGreaterThan(s('8c 8d Qs 7s 9h 4h Td'));
  });
});
