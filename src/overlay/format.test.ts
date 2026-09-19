import { describe, it, expect } from 'vitest';
import { Street, createEmptyGameState } from '../model';
import { makeHeroStats } from '../testing/fixtures';
import { statLines, sessionLine, formatChips, formatStakeLevel, formatDollars, liveInfo, isHandLive, cardLabel, cardColor } from './format';

const stats = makeHeroStats({
  handsPlayed: 122,
  vpip: 35.24, pfr: 22.95, threeBet: 9.3, foldTo3Bet: 0,
  af: 1.84, afByStreet: { preflop: 1.5, flop: 1.1, turn: 4.5, river: 6 },
  wtsd: 37.1, wsd: 53.8, winRate: 0.59,
});

describe('statLines', () => {
  it('renders three compact lines with one-decimal rounding', () => {
    expect(statLines(stats)).toEqual([
      'VPIP 35.2 · PFR 23 · 3B 9.3',
      'AF 1.8 · WTSD 37.1 · W$SD 53.8',
      '122 hands · +0.6/hand',
    ]);
  });
});

describe('sessionLine', () => {
  it('shows hands and net chips', () => {
    expect(sessionLine({ ...stats, handsPlayed: 18, winRate: 13.4 })).toBe('18 hands · +241');
  });

  it('handles missing or empty session stats', () => {
    expect(sessionLine(null)).toBe('no hands at this table yet');
    expect(sessionLine({ ...stats, handsPlayed: 0 })).toBe('no hands at this table yet');
  });
});

describe('formatChips', () => {
  it('signs and rounds amounts', () => {
    expect(formatChips(240)).toBe('+240');
    expect(formatChips(-35.26)).toBe('−35.3');
    expect(formatChips(0)).toBe('0');
    expect(formatChips(0.04)).toBe('0'); // rounds to zero
  });
});

describe('formatStakeLevel', () => {
  it('formats cent-denominated blinds as dollars', () => {
    expect(formatStakeLevel(5, 10)).toBe('$0.05/$0.10');
    expect(formatStakeLevel(25, 50)).toBe('$0.25/$0.50');
    expect(formatStakeLevel(100, 200)).toBe('$1.00/$2.00');
  });
});

describe('formatDollars', () => {
  it('renders signed dollar amounts from cents', () => {
    expect(formatDollars(72)).toBe('+$0.72');
    expect(formatDollars(-50)).toBe('−$0.50');
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(1234)).toBe('+$12.34');
  });
});

describe('liveInfo / isHandLive', () => {
  it('extracts street, pot, board, and hero cards from GameState', () => {
    const gs = createEmptyGameState();
    gs.handId = '123';
    gs.street = Street.FLOP;
    gs.pots = [100, 15];
    gs.board = ['2h', 'Ks', 'Tc'];
    gs.heroSeat = 4;
    gs.seats[4] = {
      playerId: 'hero', startStack: 1000, stack: 900, streetBet: 0,
      totalInvested: 100, cards: ['Ah', 'Ad'], isActive: true, isHero: true,
    };
    expect(liveInfo(gs)).toEqual({
      street: 'FLOP', pot: 115, board: ['2h', 'Ks', 'Tc'], heroCards: ['Ah', 'Ad'],
    });
    expect(isHandLive(gs)).toBe(true);
  });

  it('formats multi-word streets and handles missing hero seat', () => {
    const gs = createEmptyGameState();
    gs.handId = '123';
    gs.street = Street.POSTING_BLINDS;
    expect(liveInfo(gs).street).toBe('POSTING BLINDS');
    expect(liveInfo(gs).heroCards).toEqual([]);
  });

  it('is not live while waiting or before a hand id exists', () => {
    const gs = createEmptyGameState();
    expect(isHandLive(gs)).toBe(false);
    gs.street = Street.PREFLOP;
    expect(isHandLive(gs)).toBe(false); // no handId yet
  });
});

describe('cards', () => {
  it('labels cards with suit symbols', () => {
    expect(cardLabel('Ah')).toBe('A♥');
    expect(cardLabel('Tc')).toBe('T♣');
    expect(cardLabel('2s')).toBe('2♠');
    expect(cardLabel('Kd')).toBe('K♦');
  });

  it('assigns a distinct color per suit', () => {
    const colors = new Set(['Ah', 'Ac', 'Ad', 'As'].map(c => cardColor(c as never)));
    expect(colors.size).toBe(4);
  });
});
