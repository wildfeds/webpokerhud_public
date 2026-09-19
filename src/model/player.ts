import { Card } from './card';

export interface Player {
  seat:     number;
  // Username on named platforms (PokerStars); session-scoped id on anonymous
  // platforms (Bovada). Format for anonymous: "<platform>:<tableId>:<seat>"
  playerId: string;
  // Stack at the start of the hand, before posting blinds
  startStack: number;
  // Hole cards — null until revealed (showdown or hero's own cards)
  cards:    Card[] | null;
  isHero:   boolean;
}
