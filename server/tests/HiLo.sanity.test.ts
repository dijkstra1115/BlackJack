import { describe, expect, it } from 'vitest';
import { Shoe } from '../src/game/Shoe.js';
import { mulberry32 } from '../src/game/rng.js';

describe('Hi-Lo balance sanity', () => {
  it('a full shoe returns running count to exactly 0', () => {
    // Hi-Lo is a balanced count system: across one full deck,
    //   +1 cards (2-6, 20 cards) and -1 cards (10/J/Q/K/A, 20 cards) cancel.
    // Therefore any whole-deck multiple drawn end-to-end must yield 0.
    for (const seed of [1, 7, 42, 999, 31337]) {
      const shoe = new Shoe({ rng: mulberry32(seed) });
      while (shoe.remainingCards > 0) shoe.draw();
      expect(shoe.runningCount).toBe(0);
    }
  });

  it('rank distribution survives shuffle (4 of each rank per deck)', () => {
    const shoe = new Shoe({ rng: mulberry32(12345) });
    const counts = new Map<string, number>();
    while (shoe.remainingCards > 0) {
      const c = shoe.draw();
      counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    }
    for (const v of counts.values()) expect(v).toBe(4 * shoe.numDecks);
  });
});
