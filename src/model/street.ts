export enum Street {
  WAITING         = 'waiting',
  NEW_HAND        = 'new_hand',
  POSTING_BLINDS  = 'posting_blinds',
  PREFLOP         = 'preflop',
  FLOP            = 'flop',
  TURN            = 'turn',
  RIVER           = 'river',
  SHOWDOWN        = 'showdown',
  RESULT          = 'result',
}

// Streets in which betting occurs (useful for stat computation)
export const BETTING_STREETS: Street[] = [
  Street.PREFLOP,
  Street.FLOP,
  Street.TURN,
  Street.RIVER,
];
