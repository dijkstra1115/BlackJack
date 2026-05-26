/**
 * Single registry of all strategies that the CLI can pick.
 * (Split out from strategy.ts to keep illustrious18.ts's dependency clean.)
 */
import { illustrious18 } from './illustrious18.js';
import { STRATEGIES_BASE, type Strategy } from './strategy.js';

export const STRATEGIES: Record<string, Strategy> = {
  ...STRATEGIES_BASE,
  i18: illustrious18,
};
