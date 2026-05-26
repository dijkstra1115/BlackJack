/**
 * Bet sizing strategies. Each receives the true count (rounded to 0.1) and
 * returns the wager for the next hand in "units". The simulator multiplies
 * by a base unit ($25 by default) to get the actual chip amount.
 */
export interface BetContext {
  trueCount: number;
  baseUnit: number;
  bankroll: number;
}

export type BetSizing = (ctx: BetContext) => number;

/** Flat — always one unit. */
export const flatBet: BetSizing = ({ baseUnit }) => baseUnit;

/**
 * Linear spread tied to true count — the textbook "1 to 8" spread:
 *
 *   TC ≤ 1  →  1 unit
 *   TC = 2  →  2 units
 *   TC = 3  →  4 units
 *   TC = 4  →  6 units
 *   TC ≥ 5  →  8 units
 *
 * Rough proxy for Kelly without needing a continuous bankroll calc.
 */
export const spread1to8: BetSizing = ({ trueCount, baseUnit }) => {
  if (trueCount < 2) return baseUnit;
  if (trueCount < 3) return 2 * baseUnit;
  if (trueCount < 4) return 4 * baseUnit;
  if (trueCount < 5) return 6 * baseUnit;
  return 8 * baseUnit;
};

/**
 * Wong-style: don't play hands at non-positive counts. Returns 0 to signal
 * "skip this hand"; the simulator treats that as "place a minimum bet but
 * tag this hand as a Wong-out" for stats.
 *
 * (We don't physically leave the table — simpler to keep flat throughput.)
 */
export const wong: BetSizing = ({ trueCount, baseUnit }) => {
  if (trueCount < 1) return baseUnit;       // table minimum
  if (trueCount < 2) return 2 * baseUnit;
  if (trueCount < 3) return 4 * baseUnit;
  if (trueCount < 4) return 8 * baseUnit;
  return 12 * baseUnit;
};

/**
 * 1-to-15 spread — more aggressive than spread1to8, used together with
 * Wong-out for serious counting. EV per +1 TC is ~+0.5%, so by TC ≥ 5 you
 * have ~+2% edge — that's when you want a big multiplier on the table.
 *
 *   TC ≤ 1  →  1 unit
 *   TC = 2  →  3 units
 *   TC = 3  →  7 units
 *   TC = 4  →  11 units
 *   TC ≥ 5  →  15 units
 */
export const spread1to15: BetSizing = ({ trueCount, baseUnit }) => {
  if (trueCount < 2) return baseUnit;
  if (trueCount < 3) return 3 * baseUnit;
  if (trueCount < 4) return 7 * baseUnit;
  if (trueCount < 5) return 11 * baseUnit;
  return 15 * baseUnit;
};

export const BET_SIZINGS: Record<string, BetSizing> = {
  flat: flatBet,
  spread: spread1to8,
  spread15: spread1to15,
  wong,
};
