import { Street } from './street';

export enum ActionType {
  POST_SB  = 'post_sb',
  POST_BB  = 'post_bb',
  FOLD     = 'fold',
  CHECK    = 'check',
  CALL     = 'call',
  BET      = 'bet',    // first aggressor on a street
  RAISE    = 'raise',  // aggression after a bet/raise already exists
  ALL_IN   = 'all_in',
  SHOW     = 'show',
  MUCK     = 'muck',
}

export interface Action {
  seat:        number;
  playerId:    string;
  type:        ActionType;
  // Chips committed by this action (0 for fold / check / muck / show)
  amount:      number;
  // Total amount this player has put in on this street after the action
  totalStreetBet: number;
  street:      Street;
  // Stack remaining after the action
  stackAfter:  number;
}
