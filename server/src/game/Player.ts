import { Hand } from './Hand.js';

/**
 * A seated player. Owns chips and a list of hands. After splits a player can
 * hold up to 4 hands; the round walks through them in order.
 */
export class Player {
  readonly id: string;
  readonly seat: number;
  chips: number;
  hands: Hand[] = [];
  /** Index into `hands` for the hand currently acting. */
  currentHandIndex = 0;
  /** How many splits this player has performed in the current round. */
  splitCount = 0;

  constructor(id: string, seat: number, chips: number) {
    this.id = id;
    this.seat = seat;
    this.chips = chips;
  }

  /** Deduct stake, create an initial hand. Returns the hand. */
  placeBet(amount: number): Hand {
    if (amount <= 0) throw new Error('Player.placeBet: amount must be positive');
    if (amount > this.chips) throw new Error('Player.placeBet: insufficient chips');
    this.chips -= amount;
    const hand = new Hand(amount);
    this.hands = [hand];
    this.currentHandIndex = 0;
    this.splitCount = 0;
    return hand;
  }

  /** Hand currently up for action, or null if all hands resolved. */
  get currentHand(): Hand | null {
    return this.hands[this.currentHandIndex] ?? null;
  }

  /** Move to the next hand. Returns false if there are no more. */
  advanceHand(): boolean {
    this.currentHandIndex++;
    return this.currentHandIndex < this.hands.length;
  }

  /** Insert a new hand right after the current one (used after a split). */
  insertHandAfterCurrent(hand: Hand): void {
    this.hands.splice(this.currentHandIndex + 1, 0, hand);
  }

  hasUnresolvedHands(): boolean {
    return this.currentHandIndex < this.hands.length;
  }

  clearHands(): void {
    this.hands = [];
    this.currentHandIndex = 0;
    this.splitCount = 0;
  }
}
