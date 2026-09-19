export type Suit = 'c' | 'd' | 'h' | 's';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

// A card string like "Ah", "Td", "2c"
export type Card = `${Rank}${Suit}`;

export const SUITS: Suit[] = ['c', 'd', 'h', 's'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
