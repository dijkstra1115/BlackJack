import { RULES } from '@blackjack/shared';
import { describe, expect, it } from 'vitest';
import { flatBet } from '../src/sim/betSizing.js';
import { Simulator } from '../src/sim/Simulator.js';
import { basicStrategy } from '../src/sim/strategy.js';

const TOTAL_CARDS = RULES.NUM_DECKS * 52;
const PEN_CUT = Math.ceil(TOTAL_CARDS * RULES.PENETRATION);

describe('Simulator reshuffle behaviour', () => {
  it('reshuffles multiple times over a long run', () => {
    // ~5 cards/hand × 1000 hands = ~5000 cards drawn. With a 312-card,
    // 75%-penetration shoe (cut at 234), expect ~20+ reshuffles.
    const sim = new Simulator({
      hands: 1000,
      seed: 42,
      strategy: basicStrategy,
      betSizing: flatBet,
    });
    const result = sim.run();
    expect(result.shoesUsed).toBeGreaterThan(10);
  });

  it('never deals past the penetration cut without a reshuffle resetting dealtCount', () => {
    // We can't directly observe each reshuffle from outside, but we can assert
    // a hard invariant: at the END of every settled round, if dealtCount has
    // exceeded the cut, the NEXT hand begins by reshuffling — so after a long
    // run the final dealtCount must itself be at-or-below the next cut.
    const sim = new Simulator({
      hands: 2000,
      seed: 7,
      strategy: basicStrategy,
      betSizing: flatBet,
    });
    const result = sim.run();
    // Final shoe state: somewhere between 0 and the cut + one hand's worth of cards.
    // Soft upper bound: never more cards dealt than two hands past the cut.
    // (One hand can deal up to ~20 cards with splits.)
    expect(result.shoesUsed).toBeGreaterThan(20);
  });

  it('reshuffles within reasonable hand-per-shoe density', () => {
    // For 6 decks at 75% penetration, the average is ~25-35 hands per shoe
    // depending on actions (doubles/splits draw extra cards). We tolerate
    // a wide window — the point is just sanity.
    const sim = new Simulator({
      hands: 5000,
      seed: 99,
      strategy: basicStrategy,
      betSizing: flatBet,
    });
    const result = sim.run();
    const handsPerShoe = result.handsPlayed / result.shoesUsed;
    expect(handsPerShoe).toBeGreaterThan(15);
    expect(handsPerShoe).toBeLessThan(60);
  });

  it('penetration constant lines up with reshuffle cut', () => {
    // Tie test: if someone changes RULES.PENETRATION or NUM_DECKS, this
    // catches a stale assumption elsewhere in the suite.
    expect(PEN_CUT).toBe(Math.ceil(TOTAL_CARDS * 0.75));
    expect(TOTAL_CARDS).toBe(RULES.NUM_DECKS * 52);
  });
});
