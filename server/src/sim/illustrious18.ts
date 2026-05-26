import type { Card, PlayerAction } from '@blackjack/shared';
import { cardValue } from '../game/Card.js';
import type { Hand } from '../game/Hand.js';
import { basicStrategy, type DecisionContext, type Strategy } from './strategy.js';

/**
 * Illustrious 18 — Don Schlesinger's ranked list of the 18 play deviations
 * that recover the largest share of EV at high or low true counts.
 *
 * Each override is conditional on the true count clearing a threshold ("index")
 * relative to a comparator. When the condition holds, we override basic
 * strategy's action.
 *
 * Notes:
 *  - The Insurance deviation (#1, "buy at TC ≥ +3") needs an Insurance phase
 *    that this codebase doesn't model yet. It is documented as a TODO in
 *    INSURANCE_SKIPPED below; the other 17 entries are active.
 *  - "11 vs A double" is already basic for S17 (we double 11 against any
 *    up-card), so listing it here would be a no-op.
 *  - Pair entries match a literal pair; total-based entries match the hard
 *    total and explicitly exclude pairs (so we don't override the pair table).
 */

type Compare = 'gte' | 'lte';

interface Deviation {
  label: string;
  /** Match: hand description. 'hard:N' or 'soft:N' (currently unused) or 'pair:V'. */
  matchHand: string;
  /** Match: dealer up-card key — '2'..'10','A'. */
  matchDealer: string;
  index: number;
  compare: Compare;
  override: PlayerAction;
}

const I18: Deviation[] = [
  // Rank 2 — biggest play-side gain.
  // Note: classical I18 lists this as TC ≥ 0, but that assumes no Late Surrender.
  // With LS available, basic = surrender (EV -0.5); stand only beats surrender
  // around TC ≥ +4. We use +4 here to be consistent with our LS-enabled rules.
  { label: '16 vs 10  → stand (TC ≥ +4, LS-aware)', matchHand: 'hard:16', matchDealer: '10', index: 4,  compare: 'gte', override: 'stand'  },
  // Rank 3
  { label: '15 vs 10  → stand (TC ≥ +4)', matchHand: 'hard:15', matchDealer: '10', index: 4,  compare: 'gte', override: 'stand'  },
  // Rank 4 — the famous "split tens"
  { label: '10,10 vs 5 → split (TC ≥ +5)', matchHand: 'pair:10', matchDealer: '5',  index: 5,  compare: 'gte', override: 'split'  },
  // Rank 5
  { label: '10,10 vs 6 → split (TC ≥ +4)', matchHand: 'pair:10', matchDealer: '6',  index: 4,  compare: 'gte', override: 'split'  },
  // Rank 6
  { label: '10 vs 10  → double (TC ≥ +4)', matchHand: 'hard:10', matchDealer: '10', index: 4,  compare: 'gte', override: 'double' },
  // Rank 7
  { label: '12 vs 3   → stand (TC ≥ +2)', matchHand: 'hard:12', matchDealer: '3',  index: 2,  compare: 'gte', override: 'stand'  },
  // Rank 8
  { label: '12 vs 2   → stand (TC ≥ +3)', matchHand: 'hard:12', matchDealer: '2',  index: 3,  compare: 'gte', override: 'stand'  },
  // Rank 10  (rank 9 is "11 vs A double" which is already basic under S17)
  { label: '9 vs 2    → double (TC ≥ +1)', matchHand: 'hard:9',  matchDealer: '2',  index: 1,  compare: 'gte', override: 'double' },
  // Rank 11
  { label: '10 vs A   → double (TC ≥ +4)', matchHand: 'hard:10', matchDealer: 'A',  index: 4,  compare: 'gte', override: 'double' },
  // Rank 12
  { label: '9 vs 7    → double (TC ≥ +3)', matchHand: 'hard:9',  matchDealer: '7',  index: 3,  compare: 'gte', override: 'double' },
  // Rank 13
  { label: '16 vs 9   → stand  (TC ≥ +5)', matchHand: 'hard:16', matchDealer: '9',  index: 5,  compare: 'gte', override: 'stand'  },
  // Rank 14 — negative-side deviations: hit when basic says stand at low TC
  { label: '13 vs 2   → hit    (TC ≤ -1)', matchHand: 'hard:13', matchDealer: '2',  index: -1, compare: 'lte', override: 'hit'    },
  // Rank 15
  { label: '12 vs 4   → hit    (TC ≤ 0)',  matchHand: 'hard:12', matchDealer: '4',  index: 0,  compare: 'lte', override: 'hit'    },
  // Rank 16
  { label: '12 vs 5   → hit    (TC ≤ -2)', matchHand: 'hard:12', matchDealer: '5',  index: -2, compare: 'lte', override: 'hit'    },
  // Rank 17
  { label: '12 vs 6   → hit    (TC ≤ -1)', matchHand: 'hard:12', matchDealer: '6',  index: -1, compare: 'lte', override: 'hit'    },
  // Rank 18
  { label: '13 vs 3   → hit    (TC ≤ -2)', matchHand: 'hard:13', matchDealer: '3',  index: -2, compare: 'lte', override: 'hit'    },
];

export const INSURANCE_SKIPPED =
  'Illustrious 18 rank 1 (Insurance at TC ≥ +3) is not active — the simulator ' +
  'does not currently offer Insurance. Activating it would add ~0.04% edge.';

function isPairOf(hand: Hand): number | null {
  if (hand.cards.length !== 2) return null;
  const [a, b] = hand.cards as [Card, Card];
  if (cardValue(a.rank) !== cardValue(b.rank)) return null;
  return cardValue(a.rank);
}

function dealerKey(card: Card): string {
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return '10';
  return card.rank;
}

function matchesHand(dev: Deviation, hand: Hand): boolean {
  const [kind, valStr] = dev.matchHand.split(':');
  const val = Number(valStr);
  if (kind === 'pair') {
    const pv = isPairOf(hand);
    return pv === val;
  }
  if (kind === 'hard') {
    // Hard total only — must not be soft, must not be a pair (pairs use the pair table).
    const total = hand.total();
    if (total.isSoft) return false;
    if (isPairOf(hand) !== null) return false;
    return total.value === val;
  }
  return false;
}

function thresholdMet(dev: Deviation, tc: number): boolean {
  return dev.compare === 'gte' ? tc >= dev.index : tc <= dev.index;
}

/**
 * Pick the first applicable I18 deviation for this context, or return null.
 * Exported so tests can assert exactly which deviation fired.
 */
export function findI18Deviation(ctx: DecisionContext): Deviation | null {
  const dk = dealerKey(ctx.dealerUp);
  for (const dev of I18) {
    if (dev.matchDealer !== dk) continue;
    if (!matchesHand(dev, ctx.hand)) continue;
    if (!thresholdMet(dev, ctx.trueCount)) continue;
    return dev;
  }
  return null;
}

/**
 * Validate an action against the rules — fall back to basic's action if the
 * deviation suggests something we can't legally do here (e.g. split when not
 * a pair, double when already hit, etc.).
 */
function coerce(action: PlayerAction, basic: PlayerAction, ctx: DecisionContext): PlayerAction {
  switch (action) {
    case 'double': return ctx.canDouble ? 'double' : basic;
    case 'split':  return ctx.canSplit ? 'split' : basic;
    case 'surrender': return ctx.canSurrender ? 'surrender' : basic;
    default: return action;
  }
}

/**
 * Basic strategy + Illustrious 18 deviations. The play side of card counting.
 */
export const illustrious18: Strategy = (ctx) => {
  const basic = basicStrategy(ctx);
  const dev = findI18Deviation(ctx);
  if (!dev) return basic;
  return coerce(dev.override, basic, ctx);
};

export { I18 as I18_TABLE };
