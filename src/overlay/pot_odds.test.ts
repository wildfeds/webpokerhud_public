import { describe, it, expect } from 'vitest';
import { ActionType, Card, GameState, SeatState, Street, createEmptyGameState } from '../model';
import { potOdds } from './format';

function seat(playerId: string, streetBet: number, cards: Card[] | null = null): SeatState {
  return {
    playerId, startStack: 1000, stack: 1000 - streetBet, streetBet,
    totalInvested: streetBet, cards, isActive: true, isHero: false,
  };
}

// Hero in seat 1 holding cards, villain in seat 2.
function gsWith(heroBet: number, villainBet: number, pots = [0]): GameState {
  const gs = createEmptyGameState();
  gs.handId = 'h1';
  gs.street = Street.FLOP;
  gs.heroSeat = 1;
  gs.seats = {
    1: { ...seat('hero', heroBet, ['Ah', 'Kh']), isHero: true },
    2: seat('v', villainBet),
  };
  gs.pots = pots;
  return gs;
}

describe('potOdds', () => {
  it('computes call amount, pot, and break-even equity', () => {
    // Collected pot 820 − villain’s 250 already in front... pot for odds =
    // collected 570 + street bets (0 + 250) = 820; call 250 → 250/1070 ≈ 23%.
    const odds = potOdds(gsWith(0, 250, [570]))!;
    expect(odds.toCall).toBe(250);
    expect(odds.pot).toBe(820);
    expect(odds.equityPct).toBeCloseTo((250 / 1070) * 100, 5);
  });

  it('accounts for the hero’s partial street bet when raised', () => {
    // Hero bet 100, villain raised to 300: call 200 into 0+100+300.
    const odds = potOdds(gsWith(100, 300))!;
    expect(odds.toCall).toBe(200);
    expect(odds.pot).toBe(400);
  });

  it('returns null when there is nothing to call', () => {
    expect(potOdds(gsWith(100, 100))).toBeNull();
    expect(potOdds(gsWith(0, 0, [500]))).toBeNull();
  });

  it('returns null when the hero has no cards or has folded', () => {
    const noCards = gsWith(0, 250);
    noCards.seats[1]!.cards = null;
    expect(potOdds(noCards)).toBeNull();

    const folded = gsWith(0, 250);
    folded.actions.push({ seat: 1, playerId: 'hero', type: ActionType.FOLD,
      amount: 0, totalStreetBet: 0, street: Street.FLOP, stackAfter: 1000 });
    expect(potOdds(folded)).toBeNull();
  });
});
