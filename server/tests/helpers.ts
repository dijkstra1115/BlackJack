import type { Card, Rank, Suit } from '@blackjack/shared';
import { Shoe } from '../src/game/Shoe.js';
import { mulberry32 } from '../src/game/rng.js';

export const c = (rank: Rank, suit: Suit = '♠'): Card => ({ rank, suit });

export function cards(ranks: Rank[]): Card[] {
  return ranks.map((r) => c(r));
}

/** A Shoe whose draw order matches `stack` exactly. */
export function stackedShoe(stack: Card[]): Shoe {
  const shoe = new Shoe({ rng: mulberry32(1) });
  shoe.setStack(stack);
  return shoe;
}

/** Seeded shoe with the standard 8-deck configuration. */
export function seededShoe(seed = 1, numDecks = 8): Shoe {
  return new Shoe({ rng: mulberry32(seed), numDecks });
}
