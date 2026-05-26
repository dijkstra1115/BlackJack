import { describe, expect, it } from 'vitest';
import { Shoe } from '../src/game/Shoe.js';
import { mulberry32 } from '../src/game/rng.js';
import { RANKS, SUITS } from '@blackjack/shared';

describe('Shoe construction', () => {
  it('default shoe has NUM_DECKS × 52 cards', () => {
    const shoe = new Shoe({ rng: mulberry32(42) });
    expect(shoe.totalCards).toBe(shoe.numDecks * 52);
    expect(shoe.remainingCards).toBe(shoe.totalCards);
    expect(shoe.dealtCount).toBe(0);
  });

  it('contains the correct rank and suit distribution', () => {
    const shoe = new Shoe({ rng: mulberry32(42) });
    const n = shoe.numDecks;
    const ranks: Record<string, number> = {};
    const suits: Record<string, number> = {};
    while (shoe.remainingCards > 0) {
      const card = shoe.draw();
      ranks[card.rank] = (ranks[card.rank] ?? 0) + 1;
      suits[card.suit] = (suits[card.suit] ?? 0) + 1;
    }
    for (const r of RANKS) expect(ranks[r]).toBe(4 * n);   // 4 suits per deck
    for (const s of SUITS) expect(suits[s]).toBe(13 * n);  // 13 ranks per deck
  });
});

describe('Shoe shuffling', () => {
  it('seeded RNG → deterministic shuffle', () => {
    const a = new Shoe({ rng: mulberry32(7) });
    const b = new Shoe({ rng: mulberry32(7) });
    for (let i = 0; i < 100; i++) {
      const ca = a.draw();
      const cb = b.draw();
      expect(ca).toEqual(cb);
    }
  });

  it('different seeds → different shuffles', () => {
    const a = new Shoe({ rng: mulberry32(1) });
    const b = new Shoe({ rng: mulberry32(2) });
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const ca = a.draw();
      const cb = b.draw();
      if (ca.rank !== cb.rank || ca.suit !== cb.suit) diff++;
    }
    expect(diff).toBeGreaterThan(20);
  });
});

describe('Shoe running count', () => {
  it('drawing a full balanced shoe ends with running count = 0', () => {
    // Hi-Lo is a balanced count: +1 cards (2-6, 20 ranks) cancel -1 cards (10s+A, 20 ranks).
    const shoe = new Shoe({ rng: mulberry32(123) });
    while (shoe.remainingCards > 0) shoe.draw();
    expect(shoe.runningCount).toBe(0);
  });

  it('drawing only +1 cards moves running count up', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    shoe.setStack([
      { rank: '2', suit: '♠' }, { rank: '3', suit: '♠' }, { rank: '4', suit: '♠' },
      { rank: '5', suit: '♠' }, { rank: '6', suit: '♠' },
    ]);
    for (let i = 0; i < 5; i++) shoe.draw();
    expect(shoe.runningCount).toBe(5);
  });

  it('drawing only -1 cards moves running count down', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    shoe.setStack([
      { rank: '10', suit: '♠' }, { rank: 'A', suit: '♠' }, { rank: 'K', suit: '♠' },
      { rank: 'Q', suit: '♠' }, { rank: 'J', suit: '♠' },
    ]);
    for (let i = 0; i < 5; i++) shoe.draw();
    expect(shoe.runningCount).toBe(-5);
  });

  it('neutral 7-9 cards leave running count untouched', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    shoe.setStack([
      { rank: '7', suit: '♠' }, { rank: '8', suit: '♠' }, { rank: '9', suit: '♠' },
    ]);
    for (let i = 0; i < 3; i++) shoe.draw();
    expect(shoe.runningCount).toBe(0);
  });
});

describe('Shoe hole card', () => {
  it('hole card draw advances dealt count but not running count', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    shoe.setStack([{ rank: '2', suit: '♠' }]);
    const card = shoe.drawHole();
    expect(shoe.dealtCount).toBe(1);
    expect(shoe.runningCount).toBe(0);
    expect(shoe.hasHiddenCards).toBe(true);
    shoe.revealHole(card);
    expect(shoe.runningCount).toBe(1);
    expect(shoe.hasHiddenCards).toBe(false);
  });

  it('revealing without a hidden card throws', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    expect(() => shoe.revealHole({ rank: '2', suit: '♠' })).toThrow();
  });
});

describe('Shoe penetration', () => {
  it('needsReshuffle is false before 75% dealt', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    const cut = Math.ceil(shoe.totalCards * 0.75);
    for (let i = 0; i < cut - 1; i++) shoe.draw();
    expect(shoe.needsReshuffle()).toBe(false);
  });

  it('needsReshuffle is true at and beyond 75% dealt', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    const cut = Math.ceil(shoe.totalCards * 0.75);
    for (let i = 0; i < cut; i++) shoe.draw();
    expect(shoe.needsReshuffle()).toBe(true);
  });

  it('shuffle() resets dealt count and running count', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    for (let i = 0; i < 20; i++) shoe.draw();
    expect(shoe.dealtCount).toBe(20);
    shoe.shuffle();
    expect(shoe.dealtCount).toBe(0);
    expect(shoe.runningCount).toBe(0);
  });
});

describe('Shoe exhaustion', () => {
  it('drawing past the end throws', () => {
    const shoe = new Shoe({ rng: mulberry32(1) });
    shoe.setStack([{ rank: '2', suit: '♠' }]);
    shoe.draw();
    expect(() => shoe.draw()).toThrow();
  });
});
