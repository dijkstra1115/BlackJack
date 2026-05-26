import type { Card, Rank } from '@blackjack/shared';

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function hiLoWeight(rank: Rank): number {
  if (rank === '2' || rank === '3' || rank === '4' || rank === '5' || rank === '6') {
    return 1;
  }
  if (rank === '7' || rank === '8' || rank === '9') {
    return 0;
  }
  return -1;
}

export function cardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}
