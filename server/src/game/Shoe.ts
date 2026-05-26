import { RANKS, RULES, SUITS, type Card } from '@blackjack/shared';
import { hiLoWeight } from './Card.js';
import { mulberry32, type Rng } from './rng.js';

const CARDS_PER_DECK = 52;

export interface ShoeOptions {
  numDecks?: number;
  penetration?: number;
  rng?: Rng;
}

/**
 * Card shoe. Holds N decks, shuffles, deals from the top.
 *
 * Hi-Lo running count updates as cards are revealed. The dealer's hole card
 * is drawn but NOT counted until reveal — mirroring what a live player can
 * actually see.
 */
export class Shoe {
  private cards: Card[] = [];
  private cursor = 0;
  private hiddenWeight = 0;
  private hiddenCount = 0;
  private revealedCount = 0;
  private _runningCount = 0;
  private readonly rng: Rng;
  readonly numDecks: number;
  readonly penetration: number;

  constructor(options: ShoeOptions = {}) {
    this.numDecks = options.numDecks ?? RULES.NUM_DECKS;
    this.penetration = options.penetration ?? RULES.PENETRATION;
    this.rng = options.rng ?? mulberry32(Math.floor(Math.random() * 0xffffffff));
    this.shuffle();
  }

  get totalCards(): number {
    return this.numDecks * CARDS_PER_DECK;
  }

  /** Cards that have left the shoe (revealed + hidden hole cards). */
  get dealtCount(): number {
    return this.cursor;
  }

  /** Cards still inside the shoe. */
  get remainingCards(): number {
    return this.totalCards - this.cursor;
  }

  /** Approx remaining decks, used for true-count division. */
  get remainingDecks(): number {
    return this.remainingCards / CARDS_PER_DECK;
  }

  /** Running count over REVEALED cards only. */
  get runningCount(): number {
    return this._runningCount;
  }

  /** Whether any hole cards are still face-down. */
  get hasHiddenCards(): boolean {
    return this.hiddenCount > 0;
  }

  /**
   * Resets the shoe: rebuild N decks, Fisher-Yates shuffle, zero counts.
   */
  shuffle(): void {
    this.cards = [];
    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({ rank, suit });
        }
      }
    }
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = this.cards[i]!;
      this.cards[i] = this.cards[j]!;
      this.cards[j] = tmp;
    }
    this.cursor = 0;
    this.hiddenWeight = 0;
    this.hiddenCount = 0;
    this.revealedCount = 0;
    this._runningCount = 0;
  }

  /** Draw a face-up card; running count updates immediately. */
  draw(): Card {
    const card = this.takeNext();
    this._runningCount += hiLoWeight(card.rank);
    this.revealedCount++;
    return card;
  }

  /**
   * Draw a face-down hole card. The card has left the shoe (so penetration
   * advances), but it does NOT contribute to running count yet.
   */
  drawHole(): Card {
    const card = this.takeNext();
    this.hiddenWeight += hiLoWeight(card.rank);
    this.hiddenCount++;
    return card;
  }

  /**
   * Reveal a previously-hidden hole card. The card object itself is supplied
   * by the caller (the Dealer holds it); we just shift its weight from the
   * hidden bucket into the running count.
   */
  revealHole(card: Card): void {
    if (this.hiddenCount === 0) {
      throw new Error('Shoe.revealHole: no hidden cards to reveal');
    }
    const w = hiLoWeight(card.rank);
    this.hiddenWeight -= w;
    this.hiddenCount--;
    this._runningCount += w;
    this.revealedCount++;
  }

  /**
   * True after a hand finishes if the shoe has crossed the penetration mark.
   * Callers should reshuffle BETWEEN hands, never mid-hand.
   */
  needsReshuffle(): boolean {
    return this.dealtCount / this.totalCards >= this.penetration;
  }

  /** Snapshot the next N cards without drawing — test helper, do not use in game logic. */
  peek(n: number): Card[] {
    return this.cards.slice(this.cursor, this.cursor + n);
  }

  /**
   * TEST-ONLY. Replace the entire card sequence with a fixed deal order. Use
   * for deterministic Round / Dealer tests. Production code must not call this.
   */
  setStack(cards: Card[]): void {
    this.cards = [...cards];
    this.cursor = 0;
    this.hiddenWeight = 0;
    this.hiddenCount = 0;
    this.revealedCount = 0;
    this._runningCount = 0;
  }

  private takeNext(): Card {
    if (this.cursor >= this.cards.length) {
      throw new Error('Shoe.takeNext: shoe exhausted (forgot to reshuffle?)');
    }
    return this.cards[this.cursor++]!;
  }
}
