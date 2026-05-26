import { RULES } from '@blackjack/shared';
import type { Hand } from './Hand.js';

export type Outcome =
  | 'blackjack'    // 玩家 natural BJ 勝（3:2）
  | 'win'          // 玩家點數較高或莊家爆牌
  | 'push'         // 平手
  | 'lose'         // 玩家點數較低
  | 'bust'         // 玩家爆牌
  | 'surrender';   // 玩家投降

export interface SettlementResult {
  outcome: Outcome;
  /** Net chip delta to apply to player (positive = won, negative = lost). */
  payout: number;
}

/**
 * Settle one player hand against the dealer hand. Pure function.
 *
 * Convention: bet has ALREADY been deducted from the player's stack when
 * placed. payout is the net delta to add back. So a win returns bet*2 worth
 * of net positive only on the WIN side — we return `+bet` (the dealer matches
 * the wager) so the caller does `chips += bet + payout` ⇒ wrong. Let me clarify:
 *
 *   - Player wins  → payout = +bet         (gets stake back via separate flow)
 *   - Blackjack    → payout = +bet * 1.5
 *   - Lose / bust  → payout = -bet
 *   - Push         → payout = 0
 *   - Surrender    → payout = -bet / 2
 *
 * The caller is responsible for returning the original stake on non-loss
 * outcomes. See Player.settle() / Round.settle() for the bookkeeping.
 */
export function settle(playerHand: Hand, dealerHand: Hand): SettlementResult {
  const bet = playerHand.bet;

  if (playerHand.hasSurrendered) {
    return { outcome: 'surrender', payout: -bet / 2 };
  }
  if (playerHand.isBust()) {
    return { outcome: 'bust', payout: -bet };
  }

  const playerTotal = playerHand.total().value;
  const dealerTotal = dealerHand.total().value;
  const dealerBust = dealerTotal > 21;

  const playerBJ = playerHand.isBlackjack();
  const dealerBJ = dealerHand.isBlackjack();

  if (playerBJ && dealerBJ) return { outcome: 'push', payout: 0 };
  if (playerBJ) return { outcome: 'blackjack', payout: bet * RULES.BJ_PAYOUT };
  if (dealerBJ) return { outcome: 'lose', payout: -bet };

  if (dealerBust) return { outcome: 'win', payout: bet };
  if (playerTotal > dealerTotal) return { outcome: 'win', payout: bet };
  if (playerTotal < dealerTotal) return { outcome: 'lose', payout: -bet };
  return { outcome: 'push', payout: 0 };
}
