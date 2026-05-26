import type { Shoe } from './Shoe.js';

export interface CountSnapshot {
  runningCount: number;
  trueCount: number;
  remainingDecks: number;
}

/**
 * Hi-Lo counting. Running count comes straight from the shoe (which updates it
 * on every reveal). True count divides by the estimated remaining decks.
 */
export function runningCount(shoe: Shoe): number {
  return shoe.runningCount;
}

/**
 * True count = running count / remaining decks, rounded to one decimal.
 * When fewer than half a deck remains we treat divisor as 0.5 to avoid blow-ups.
 */
export function trueCount(shoe: Shoe): number {
  const decks = Math.max(0.5, shoe.remainingDecks);
  return Math.round((shoe.runningCount / decks) * 10) / 10;
}

export function snapshot(shoe: Shoe): CountSnapshot {
  return {
    runningCount: runningCount(shoe),
    trueCount: trueCount(shoe),
    remainingDecks: Math.round(shoe.remainingDecks * 10) / 10,
  };
}
