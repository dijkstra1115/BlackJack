import type { Card, PlayerAction } from '@blackjack/shared';
import { cardValue } from '../game/Card.js';
import type { Hand } from '../game/Hand.js';

export interface DecisionContext {
  hand: Hand;
  dealerUp: Card;
  trueCount: number;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
  /** Whether the hand currently being decided is post-split. */
  isFromSplit: boolean;
}

export type Strategy = (ctx: DecisionContext) => PlayerAction;

/**
 * Standard Basic Strategy for the rules we run:
 *   8 decks, S17 (dealer stands on soft 17), DAS, Late Surrender allowed.
 *
 * Tables encoded as 10-character strings indexed by dealer up-card value
 * (index 0 = dealer 2, …, index 7 = dealer 9, index 8 = dealer 10/face,
 *  index 9 = dealer A).
 *
 * Cell symbols:
 *   H  hit
 *   S  stand
 *   D  double if allowed, otherwise hit
 *   Ds double if allowed, otherwise stand  (used for soft 18 vs 3-6)
 *   P  split
 *   R  surrender if allowed, otherwise hit
 */

const HARD: Record<string, string> = {
  // total : '  2  3  4  5  6  7  8  9 10  A'
  '5':  'HHHHHHHHHH',
  '6':  'HHHHHHHHHH',
  '7':  'HHHHHHHHHH',
  '8':  'HHHHHHHHHH',
  '9':  'HDDDDHHHHH',
  '10': 'DDDDDDDDHH',
  '11': 'DDDDDDDDDD', // S17: double vs A
  '12': 'HHSSSHHHHH',
  '13': 'SSSSSHHHHH',
  '14': 'SSSSSHHHHH',
  '15': 'SSSSSHHHRH', // R vs 10
  '16': 'SSSSSHHRRR', // R vs 9, 10, A
  '17': 'SSSSSSSSSS',
  '18': 'SSSSSSSSSS',
  '19': 'SSSSSSSSSS',
  '20': 'SSSSSSSSSS',
  '21': 'SSSSSSSSSS',
};

const SOFT: Record<string, string> = {
  // 'A,n' = soft hand totalling n + 11
  'A,2':  'HHHDDHHHHH', // soft 13
  'A,3':  'HHHDDHHHHH', // soft 14
  'A,4':  'HHDDDHHHHH', // soft 15
  'A,5':  'HHDDDHHHHH', // soft 16
  'A,6':  'HDDDDHHHHH', // soft 17
  'A,7':  'SDDDDSSHHH', // soft 18  (S17: Ds vs 3-6, replaced by D below)
  'A,8':  'SSSSSSSSSS', // soft 19
  'A,9':  'SSSSSSSSSS', // soft 20
};

// Patches for "Ds" cells (double-if-allowed-else-stand): soft 18 vs 3..6.
const SOFT_DS: Record<string, number[]> = {
  // 0 = dealer 2, 1 = 3, ... 9 = A
  'A,7': [1, 2, 3, 4],
};

const PAIRS: Record<string, string> = {
  // pair      :  '  2  3  4  5  6  7  8  9 10  A'
  '2,2':   'PPPPPPHHHH',
  '3,3':   'PPPPPPHHHH',
  '4,4':   'HHHPPHHHHH',
  '5,5':   'DDDDDDDDHH', // never split — treat as 10
  '6,6':   'PPPPPHHHHH',
  '7,7':   'PPPPPPHHHH',
  '8,8':   'PPPPPPPPPP', // always split
  '9,9':   'PPPPPSPPSS',
  '10,10': 'SSSSSSSSSS',
  'A,A':   'PPPPPPPPPP',
};

const DEALER_INDEX: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4,
  '7': 5, '8': 6, '9': 7, '10': 8,
  'J': 8, 'Q': 8, 'K': 8, 'A': 9,
};

function isPair(hand: Hand): boolean {
  if (hand.cards.length !== 2) return false;
  const [a, b] = hand.cards as [Card, Card];
  return cardValue(a.rank) === cardValue(b.rank);
}

function isSoft(hand: Hand): boolean {
  return hand.total().isSoft;
}

function pairKey(hand: Hand): string {
  const [a] = hand.cards as [Card];
  if (a.rank === 'A') return 'A,A';
  const v = cardValue(a.rank);
  const r = v === 10 ? '10' : String(v);
  return `${r},${r}`;
}

function softKey(hand: Hand): string | null {
  // Need exactly 2-card or multi-card soft for proper soft-table lookup.
  // Standard basic strategy is defined for soft hands keyed by non-ace cards.
  // For multi-card soft hands we still use the total.
  const total = hand.total().value;
  if (total < 13 || total > 21) return null;
  const nonAce = total - 11;
  if (nonAce < 2 || nonAce > 9) return null;
  return `A,${nonAce}`;
}

function lookupCell(table: string | undefined, dealerIdx: number): string | null {
  if (!table) return null;
  return table[dealerIdx] ?? null;
}

function resolve(cell: string, ctx: DecisionContext): PlayerAction {
  switch (cell) {
    case 'H': return 'hit';
    case 'S': return 'stand';
    case 'D': return ctx.canDouble ? 'double' : 'hit';
    case 'Ds': return ctx.canDouble ? 'double' : 'stand';
    case 'P': return 'split';
    case 'R': return ctx.canSurrender ? 'surrender' : 'hit';
    default:  return 'stand'; // defensive: unknown cell
  }
}

/**
 * Pick an action from the basic-strategy chart. Order of evaluation:
 *   1. Pair (if eligible to split)
 *   2. Soft hand
 *   3. Hard total
 * Falls back to hit on anything below 12 hard.
 */
export const basicStrategy: Strategy = (ctx) => {
  const { hand, dealerUp } = ctx;
  const dealerIdx = DEALER_INDEX[dealerUp.rank]!;

  // 1. Pair branch
  if (ctx.canSplit && isPair(hand)) {
    const pk = pairKey(hand);
    const cell = lookupCell(PAIRS[pk], dealerIdx);
    if (cell === 'P') return 'split';
    // 5,5 maps to D / 10,10 to S — handled below in hard total.
    if (cell) {
      // For pair 5,5 (D) and 10,10 (S) fall through to hard handling via cell.
      // But we also handle non-split pair cells here for completeness.
      return resolve(cell, ctx);
    }
  }

  // 2. Soft hand branch
  if (isSoft(hand)) {
    const sk = softKey(hand);
    if (sk) {
      const table = SOFT[sk];
      let cell = lookupCell(table, dealerIdx);
      // Patch Ds cells for soft 18
      if (SOFT_DS[sk]?.includes(dealerIdx)) cell = 'Ds';
      if (cell) return resolve(cell, ctx);
    }
  }

  // 3. Hard total branch
  const total = hand.total().value;
  const key = String(Math.min(21, Math.max(5, total)));
  const cell = lookupCell(HARD[key], dealerIdx);
  if (cell) return resolve(cell, ctx);

  // Default safety net
  return total >= 17 ? 'stand' : 'hit';
};

/**
 * "Mimic the dealer" — hit until hard 17+ (no doubling, no splitting,
 * no surrender). Useful as a -EV baseline for comparison.
 */
export const mimicDealer: Strategy = (ctx) => {
  const { value, isSoft } = ctx.hand.total();
  if (value < 17) return 'hit';
  if (value === 17 && isSoft) return 'hit'; // dealer H17, mimic that
  return 'stand';
};

/**
 * "Always stand on 12+" — another diagnostic baseline.
 */
export const standOn12: Strategy = (ctx) => {
  const total = ctx.hand.total().value;
  if (total < 12) return 'hit';
  return 'stand';
};

// Note: STRATEGIES is wired up in strategies.ts to avoid circular imports
// between strategy.ts (basic) and illustrious18.ts (depends on basic).
export const STRATEGIES_BASE: Record<string, Strategy> = {
  basic: basicStrategy,
  mimic: mimicDealer,
  stand12: standOn12,
};
