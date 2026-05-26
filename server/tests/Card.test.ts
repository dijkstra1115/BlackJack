import { describe, expect, it } from 'vitest';
import { cardValue, hiLoWeight } from '../src/game/Card.js';
import type { Rank } from '@blackjack/shared';

describe('cardValue', () => {
  it('treats face cards as 10', () => {
    expect(cardValue('J')).toBe(10);
    expect(cardValue('Q')).toBe(10);
    expect(cardValue('K')).toBe(10);
    expect(cardValue('10')).toBe(10);
  });

  it('treats ace as 11 (Hand will demote when needed)', () => {
    expect(cardValue('A')).toBe(11);
  });

  it('returns the pip value for 2–9', () => {
    const expected: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    };
    for (const [rank, val] of Object.entries(expected)) {
      expect(cardValue(rank as Rank)).toBe(val);
    }
  });
});

describe('hiLoWeight', () => {
  it('2–6 are +1', () => {
    for (const r of ['2', '3', '4', '5', '6'] as Rank[]) {
      expect(hiLoWeight(r)).toBe(1);
    }
  });

  it('7–9 are 0', () => {
    for (const r of ['7', '8', '9'] as Rank[]) {
      expect(hiLoWeight(r)).toBe(0);
    }
  });

  it('10, J, Q, K, A are -1', () => {
    for (const r of ['10', 'J', 'Q', 'K', 'A'] as Rank[]) {
      expect(hiLoWeight(r)).toBe(-1);
    }
  });
});
