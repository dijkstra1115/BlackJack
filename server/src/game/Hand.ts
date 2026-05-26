import { RULES, type Card } from '@blackjack/shared';
import { cardValue } from './Card.js';

export interface HandTotal {
  value: number;
  isSoft: boolean;
}

/**
 * A player's hand (or one of several after splits). Carries its own bet
 * because split / double hands track their own stakes.
 */
export class Hand {
  readonly cards: Card[] = [];
  bet: number;

  /** True if this hand was produced by a split. */
  isFromSplit: boolean;
  /** True if this hand came from splitting a pair of aces — gets exactly one extra card. */
  isFromSplitAces: boolean;

  hasDoubled = false;
  hasSurrendered = false;
  hasStood = false;

  constructor(bet: number, opts: { isFromSplit?: boolean; isFromSplitAces?: boolean } = {}) {
    if (bet < 0) throw new Error('Hand: bet cannot be negative');
    this.bet = bet;
    this.isFromSplit = opts.isFromSplit ?? false;
    this.isFromSplitAces = opts.isFromSplitAces ?? false;
  }

  addCard(card: Card): void {
    this.cards.push(card);
  }

  /**
   * Compute hand total. Try every Ace as 11; if that busts, demote them to 1
   * one at a time. isSoft = true if at least one Ace is still counted as 11.
   */
  total(): HandTotal {
    let value = 0;
    let aces = 0;
    for (const c of this.cards) {
      value += cardValue(c.rank);
      if (c.rank === 'A') aces++;
    }
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return { value, isSoft: aces > 0 };
  }

  isBust(): boolean {
    return this.total().value > 21;
  }

  /**
   * Natural Blackjack — only the initial two-card 21, never from a split.
   * (21 from 5+6+10 is NOT a Blackjack; a split A+10 is NOT a Blackjack.)
   */
  isBlackjack(): boolean {
    if (this.isFromSplit) return false;
    if (this.cards.length !== 2) return false;
    return this.total().value === 21;
  }

  /** Two cards of equal point-value (10/J/Q/K interchangeable). */
  canSplit(currentSplitCount: number): boolean {
    if (this.cards.length !== 2) return false;
    if (currentSplitCount >= RULES.MAX_SPLITS) return false;
    const [a, b] = this.cards as [Card, Card];
    return cardValue(a.rank) === cardValue(b.rank);
  }

  /**
   * Double Down — exactly two cards, no prior actions. DAS is allowed under
   * current rules. Split-aces hands cannot double (they get one card only).
   */
  canDouble(): boolean {
    if (this.cards.length !== 2) return false;
    if (this.hasDoubled || this.hasStood || this.hasSurrendered) return false;
    if (this.isFromSplitAces) return false;
    if (this.isFromSplit && !RULES.DOUBLE_AFTER_SPLIT) return false;
    return true;
  }

  /** Late Surrender — initial two cards only, never after split or double. */
  canSurrender(): boolean {
    if (!RULES.ALLOW_SURRENDER) return false;
    if (this.cards.length !== 2) return false;
    if (this.isFromSplit) return false;
    if (this.hasDoubled || this.hasStood || this.hasSurrendered) return false;
    return true;
  }

  canHit(): boolean {
    if (this.isTerminal()) return false;
    if (this.isFromSplitAces && this.cards.length >= 2) return false;
    return true;
  }

  /** True when no further action can or should be taken on this hand. */
  isTerminal(): boolean {
    if (this.hasSurrendered || this.hasStood || this.hasDoubled) return true;
    if (this.isBust()) return true;
    if (this.total().value === 21) return true;
    return false;
  }
}
