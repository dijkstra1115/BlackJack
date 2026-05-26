export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANKS: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
] as const;

export const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'] as const;

export type PlayerAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type HandOutcome =
  | 'win'
  | 'lose'
  | 'push'
  | 'blackjack'
  | 'surrender'
  | 'bust';

export type RoundPhase =
  | 'waitingForBets'
  | 'dealing'
  | 'playerAction'
  | 'dealerTurn'
  | 'settled';
