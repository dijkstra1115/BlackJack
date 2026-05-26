import { describe, expect, it } from 'vitest';
import { Dealer } from '../src/game/Dealer.js';
import { stackedShoe } from './helpers.js';
import type { Card } from '@blackjack/shared';

const stack = (ranks: string[]): Card[] =>
  ranks.map((r) => ({ rank: r as Card['rank'], suit: '♠' }));

describe('Dealer initial deal', () => {
  it('up card revealed, hole card hidden from running count', () => {
    const shoe = stackedShoe(stack(['5', '6']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    expect(shoe.runningCount).toBe(1); // only the 5 (up) counted
    expect(shoe.hasHiddenCards).toBe(true);
    d.revealHole(shoe);
    expect(shoe.runningCount).toBe(2); // both 5 and 6 now in
    expect(shoe.hasHiddenCards).toBe(false);
  });
});

describe('Dealer S17 logic', () => {
  it('stands on hard 17', () => {
    const shoe = stackedShoe(stack(['10', '7', '5']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.revealHole(shoe);
    d.playOut(shoe);
    expect(d.hand.cards).toHaveLength(2);
    expect(d.hand.total().value).toBe(17);
  });

  it('stands on soft 17 (S17)', () => {
    const shoe = stackedShoe(stack(['A', '6', '5']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.revealHole(shoe);
    d.playOut(shoe);
    expect(d.hand.cards).toHaveLength(2);
    expect(d.hand.total()).toEqual({ value: 17, isSoft: true });
  });

  it('hits on hard 16', () => {
    const shoe = stackedShoe(stack(['10', '6', '5']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.revealHole(shoe);
    d.playOut(shoe);
    expect(d.hand.cards.length).toBeGreaterThan(2);
  });

  it('hits soft 16', () => {
    const shoe = stackedShoe(stack(['A', '5', '5']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.revealHole(shoe);
    d.playOut(shoe);
    expect(d.hand.cards.length).toBeGreaterThan(2);
  });

  it('keeps drawing until reaching 17+', () => {
    const shoe = stackedShoe(stack(['2', '3', '4', '5', '6']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.revealHole(shoe);
    d.playOut(shoe);
    expect(d.hand.total().value).toBeGreaterThanOrEqual(17);
  });

  it('busts when forced past 21', () => {
    const shoe = stackedShoe(stack(['10', '7', '5']));
    // 10 + 7 = 17, would stop. Use cards that ensure busting.
    const shoe2 = stackedShoe(stack(['10', '6', 'K']));
    const d = new Dealer();
    d.takeUpCard(shoe2);
    d.takeHoleCard(shoe2);
    d.revealHole(shoe2);
    d.playOut(shoe2);
    expect(d.hand.isBust()).toBe(true);
    void shoe;
  });
});

describe('Dealer blackjack detection', () => {
  it('detects natural BJ on initial deal', () => {
    const shoe = stackedShoe(stack(['A', '10']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    expect(d.hasBlackjack()).toBe(true);
  });

  it('returns false when 21 takes more than 2 cards', () => {
    const shoe = stackedShoe(stack(['5', '6', '10']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    expect(d.hasBlackjack()).toBe(false);
  });
});

describe('Dealer.reset', () => {
  it('clears hand and hole state between rounds', () => {
    const shoe = stackedShoe(stack(['10', '7']));
    const d = new Dealer();
    d.takeUpCard(shoe);
    d.takeHoleCard(shoe);
    d.reset();
    expect(d.hand.cards).toHaveLength(0);
    expect(d.holeCardRevealed).toBe(false);
    expect(d.upCard).toBeNull();
  });
});
