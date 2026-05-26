import { RULES, type Card } from '@blackjack/shared';
import { Hand } from './Hand.js';
import { Shoe } from './Shoe.js';

/**
 * The house. Owns one hand whose second card is the hole card (face-down until
 * the dealer's turn). Implements S17: stand on all 17s, hit anything lower.
 */
export class Dealer {
  readonly hand: Hand;
  private holeCard: Card | null = null;
  private holeRevealed = false;

  constructor() {
    this.hand = new Hand(0);
  }

  reset(): void {
    this.hand.cards.length = 0;
    this.hand.hasStood = false;
    this.holeCard = null;
    this.holeRevealed = false;
  }

  /** Up-card (the dealer's first, face-up card). */
  get upCard(): Card | null {
    return this.hand.cards[0] ?? null;
  }

  get holeCardRevealed(): boolean {
    return this.holeRevealed;
  }

  /** Deal the first, face-up card. */
  takeUpCard(shoe: Shoe): Card {
    const card = shoe.draw();
    this.hand.addCard(card);
    return card;
  }

  /**
   * Deal the hole card face-down. The card is removed from the shoe (so
   * penetration advances) but its rank does NOT yet enter the running count.
   */
  takeHoleCard(shoe: Shoe): Card {
    const card = shoe.drawHole();
    this.holeCard = card;
    this.hand.addCard(card);
    return card;
  }

  /** Flip the hole card. Idempotent if already revealed. */
  revealHole(shoe: Shoe): void {
    if (this.holeRevealed) return;
    if (!this.holeCard) throw new Error('Dealer.revealHole: no hole card');
    shoe.revealHole(this.holeCard);
    this.holeRevealed = true;
  }

  /**
   * Peek at whether the (still-hidden) total is a natural Blackjack. Used
   * after the initial deal — typically only when the up-card is A or 10.
   * Returns true without revealing; caller decides whether to flip.
   */
  hasBlackjack(): boolean {
    return this.hand.cards.length === 2 && this.hand.total().value === 21;
  }

  /**
   * Draw cards according to S17 until the hand stands or busts. The hole card
   * must already be revealed before calling this.
   */
  playOut(shoe: Shoe): void {
    if (!this.holeRevealed) {
      throw new Error('Dealer.playOut: reveal hole card first');
    }
    while (this.shouldHit()) {
      this.hand.addCard(shoe.draw());
    }
    this.hand.hasStood = true;
  }

  private shouldHit(): boolean {
    const { value, isSoft } = this.hand.total();
    if (value < 17) return true;
    if (value === 17 && isSoft && !RULES.DEALER_STANDS_ON_SOFT_17) return true;
    return false;
  }
}
