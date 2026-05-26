import { describe, expect, it } from 'vitest';
import { runningCount, trueCount, snapshot } from '../src/game/CountingSystem.js';
import { stackedShoe } from './helpers.js';
import type { Card } from '@blackjack/shared';

const stack = (ranks: string[]): Card[] =>
  ranks.map((r) => ({ rank: r as Card['rank'], suit: '♠' }));

describe('runningCount', () => {
  it('mirrors the shoe', () => {
    const shoe = stackedShoe(stack(['2', '3', '4']));
    shoe.draw();
    shoe.draw();
    shoe.draw();
    expect(runningCount(shoe)).toBe(3);
  });
});

describe('trueCount', () => {
  it('+6 running, 3 decks remaining → 2.0', () => {
    // 6-deck shoe (totalCards = 312). To leave 3 decks (156 cards), draw 156.
    // Stack 6 fives (running +6) then 150 sevens (neutrals).
    const fives = Array(6).fill('5');
    const sevens = Array(150).fill('7');
    const shoe = stackedShoe(stack([...fives, ...sevens]));
    for (let i = 0; i < 156; i++) shoe.draw();
    expect(runningCount(shoe)).toBe(6);
    expect(shoe.remainingDecks).toBeCloseTo(3.0, 5);
    expect(trueCount(shoe)).toBe(2.0);
  });

  it('+5 running with 2.5 decks remaining → 2.0', () => {
    // To leave 2.5 decks (130 cards), draw 312-130 = 182.
    const fives = Array(5).fill('5');
    const sevens = Array(177).fill('7'); // 5 + 177 = 182
    const shoe = stackedShoe(stack([...fives, ...sevens]));
    for (let i = 0; i < 182; i++) shoe.draw();
    expect(runningCount(shoe)).toBe(5);
    expect(shoe.remainingDecks).toBeCloseTo(2.5, 5);
    expect(trueCount(shoe)).toBe(2.0);
  });

  it('snapshot returns all three values', () => {
    const shoe = stackedShoe(stack(['5', '5', '5']));
    shoe.draw(); shoe.draw(); shoe.draw();
    const snap = snapshot(shoe);
    expect(snap.runningCount).toBe(3);
    expect(snap.trueCount).toBeGreaterThan(0);
    expect(snap.remainingDecks).toBeGreaterThan(0);
  });
});
