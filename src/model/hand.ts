import { Card } from './card';
import { Action } from './action';
import { Player } from './player';

export interface HandResult {
  seat:     number;
  playerId: string;
  // Chips awarded from the pot. Uncalled-bet returns are NOT included
  // (the platform refunds them outside the pot award).
  potWon:   number;
  // Net chips won or lost this hand: end-of-hand stack minus start-of-hand
  // stack. With side pots a player may appear in several HandResult entries;
  // netWon is the same whole-hand total in each (do not sum across entries).
  netWon:   number;
}

// Immutable record of a completed hand. This is the unit stored and analysed.
export interface Hand {
  handId:     string;    // platform-native hand id (e.g. Bovada stageNo)
  tableId:    string;
  platform:   string;    // 'bovada' | 'pokerstars' | ...
  timestamp:  number;    // Unix ms at hand start
  gameType:   string;    // 'nlhe' | 'plo' | ...
  stakes: {
    sb: number;          // small blind in chips
    bb: number;          // big blind in chips
  };
  maxSeats:   number;    // max seats at this table type (6, 9, etc.)
  dealerSeat: number;
  heroSeat:   number;
  players:    Player[];  // only seats that were dealt in
  actions:    Action[];  // full action history in order
  board:      Card[];    // final board cards (0–5)
  totalPot:   number;    // total pot before rake
  rake:       number;
  results:    HandResult[];
}
