export const RULES = {
  NUM_DECKS: 6,
  PENETRATION: 0.75,
  BJ_PAYOUT: 1.5,
  DEALER_STANDS_ON_SOFT_17: true,
  DOUBLE_AFTER_SPLIT: true,
  ALLOW_SURRENDER: true,
  MAX_SPLITS: 3,
  MAX_SEATS: 7,
} as const;

export type RulesConfig = typeof RULES;
