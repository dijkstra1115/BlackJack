import type { RoundPhase } from '@blackjack/shared';
import { Dealer } from './Dealer.js';
import { Hand } from './Hand.js';
import { Player } from './Player.js';
import { settle, type SettlementResult } from './settlement.js';
import { Shoe } from './Shoe.js';

export interface PlayerHandResult {
  playerId: string;
  seat: number;
  handIndex: number;
  result: SettlementResult;
  /** Player chips immediately AFTER this hand was applied. */
  chipsAfter: number;
}

export interface RoundOptions {
  shoe: Shoe;
  players: Player[];
}

/**
 * Single hand of blackjack. State machine:
 *
 *   waitingForBets → dealing → playerAction → dealerTurn → settled
 *
 * Players act in seat order, one hand at a time. After every action `advance()`
 * decides whether the same hand keeps acting, the player moves to its next
 * (post-split) hand, or control passes to the next player. When all players
 * are done the dealer reveals the hole, plays out S17, and the round settles.
 */
export class Round {
  readonly shoe: Shoe;
  readonly dealer: Dealer;
  readonly players: Player[];
  phase: RoundPhase = 'waitingForBets';
  private activeIndex = 0;
  results: PlayerHandResult[] = [];

  constructor(opts: RoundOptions) {
    this.shoe = opts.shoe;
    this.dealer = new Dealer();
    this.players = [...opts.players].sort((a, b) => a.seat - b.seat);
  }

  placeBet(playerId: string, amount: number): void {
    if (this.phase !== 'waitingForBets') {
      throw new Error('Round.placeBet: not in betting phase');
    }
    const p = this.findPlayer(playerId);
    p.placeBet(amount);
  }

  /** Validate every player has bet, then deal the initial four-card sequence. */
  startDeal(): void {
    if (this.phase !== 'waitingForBets') {
      throw new Error('Round.startDeal: already dealt');
    }
    for (const p of this.players) {
      if (p.hands.length === 0) {
        throw new Error(`Round.startDeal: player ${p.id} has not bet`);
      }
    }
    this.phase = 'dealing';

    // Casino order: every seat gets one card, dealer up-card, every seat
    // gets a second card, dealer hole card.
    for (const p of this.players) {
      p.hands[0]!.addCard(this.shoe.draw());
    }
    this.dealer.takeUpCard(this.shoe);
    for (const p of this.players) {
      p.hands[0]!.addCard(this.shoe.draw());
    }
    this.dealer.takeHoleCard(this.shoe);

    // Check dealer natural. If yes, short-circuit straight to settlement.
    if (this.dealer.hasBlackjack()) {
      this.dealer.revealHole(this.shoe);
      this.dealer.hand.hasStood = true;
      this.settleAll();
      return;
    }

    this.phase = 'playerAction';
    this.activeIndex = 0;
    this.skipFinishedHands();
  }

  /** ID and hand-index whose turn it currently is, or null. */
  get currentTurn(): { playerId: string; seat: number; handIndex: number } | null {
    if (this.phase !== 'playerAction') return null;
    const p = this.players[this.activeIndex];
    if (!p) return null;
    return { playerId: p.id, seat: p.seat, handIndex: p.currentHandIndex };
  }

  hit(playerId: string): void {
    const { player, hand } = this.requireTurn(playerId);
    if (!hand.canHit()) throw new Error('Round.hit: not allowed on this hand');
    hand.addCard(this.shoe.draw());
    if (hand.isBust() || hand.total().value === 21) {
      this.advance();
    }
  }

  stand(playerId: string): void {
    const { hand } = this.requireTurn(playerId);
    hand.hasStood = true;
    this.advance();
  }

  double(playerId: string): void {
    const { player, hand } = this.requireTurn(playerId);
    if (!hand.canDouble()) throw new Error('Round.double: not allowed on this hand');
    if (player.chips < hand.bet) throw new Error('Round.double: insufficient chips');
    player.chips -= hand.bet;
    hand.bet *= 2;
    hand.addCard(this.shoe.draw());
    hand.hasDoubled = true;
    this.advance();
  }

  surrender(playerId: string): void {
    const { hand } = this.requireTurn(playerId);
    if (!hand.canSurrender()) throw new Error('Round.surrender: not allowed on this hand');
    hand.hasSurrendered = true;
    this.advance();
  }

  split(playerId: string): void {
    const { player, hand } = this.requireTurn(playerId);
    if (!hand.canSplit(player.splitCount)) {
      throw new Error('Round.split: not allowed on this hand');
    }
    if (player.chips < hand.bet) throw new Error('Round.split: insufficient chips');

    const isAces = hand.cards[0]!.rank === 'A';
    const secondCard = hand.cards.pop()!;

    const newHand = new Hand(hand.bet, {
      isFromSplit: true,
      isFromSplitAces: isAces,
    });
    newHand.addCard(secondCard);

    hand.isFromSplit = true;
    if (isAces) hand.isFromSplitAces = true;

    player.chips -= hand.bet;
    player.splitCount++;
    player.insertHandAfterCurrent(newHand);

    // Both hands receive one new card immediately.
    hand.addCard(this.shoe.draw());
    newHand.addCard(this.shoe.draw());

    // Split-aces hands stand automatically after the one card each.
    if (isAces) {
      hand.hasStood = true;
      newHand.hasStood = true;
      this.advance();
    } else if (hand.total().value === 21) {
      this.advance();
    }
  }

  /** Force-finish the current hand and move on. Mostly for tests / timeouts. */
  forceStand(): void {
    if (this.phase !== 'playerAction') return;
    const p = this.players[this.activeIndex];
    const h = p?.currentHand;
    if (h && !h.isTerminal()) h.hasStood = true;
    this.advance();
  }

  // ---------- internals ----------

  private requireTurn(playerId: string): { player: Player; hand: Hand } {
    if (this.phase !== 'playerAction') {
      throw new Error('Round: not in player-action phase');
    }
    const p = this.players[this.activeIndex];
    if (!p || p.id !== playerId) {
      throw new Error(`Round: not ${playerId}'s turn`);
    }
    const hand = p.currentHand;
    if (!hand) throw new Error(`Round: player ${playerId} has no active hand`);
    return { player: p, hand };
  }

  private advance(): void {
    const p = this.players[this.activeIndex];
    if (!p) return;
    p.advanceHand();
    this.skipFinishedHands();
  }

  /**
   * Walk forward until we land on a player with an unresolved, non-terminal
   * hand, OR exhaust all players (→ dealer turn).
   */
  private skipFinishedHands(): void {
    while (this.activeIndex < this.players.length) {
      const p = this.players[this.activeIndex]!;
      while (p.hasUnresolvedHands()) {
        const h = p.currentHand!;
        if (h.isTerminal()) {
          p.advanceHand();
          continue;
        }
        // BJ at this point can only happen for the first hand pre-action;
        // it's "terminal" for action purposes — treat like stand.
        if (h.isBlackjack()) {
          p.advanceHand();
          continue;
        }
        return; // active hand awaiting input
      }
      this.activeIndex++;
    }
    this.runDealer();
  }

  private runDealer(): void {
    this.phase = 'dealerTurn';
    this.dealer.revealHole(this.shoe);

    // If every player hand is bust / surrender, dealer still reveals but
    // doesn't need to hit (nothing to beat).
    const anyLive = this.players.some(p =>
      p.hands.some(h => !h.isBust() && !h.hasSurrendered),
    );
    if (anyLive) {
      this.dealer.playOut(this.shoe);
    } else {
      this.dealer.hand.hasStood = true;
    }

    this.settleAll();
  }

  private settleAll(): void {
    for (const p of this.players) {
      for (let i = 0; i < p.hands.length; i++) {
        const hand = p.hands[i]!;
        const res = settle(hand, this.dealer.hand);
        // Return original stake on non-losing outcomes.
        if (res.outcome === 'push') p.chips += hand.bet;
        else if (res.outcome === 'blackjack' || res.outcome === 'win') {
          p.chips += hand.bet + res.payout;
        } else if (res.outcome === 'surrender') {
          p.chips += hand.bet + res.payout; // returns half the stake
        }
        // 'lose' / 'bust' — stake stays with the house, no return.
        this.results.push({
          playerId: p.id,
          seat: p.seat,
          handIndex: i,
          result: res,
          chipsAfter: p.chips,
        });
      }
    }
    this.phase = 'settled';
  }

  private findPlayer(playerId: string): Player {
    const p = this.players.find(x => x.id === playerId);
    if (!p) throw new Error(`Round: unknown player ${playerId}`);
    return p;
  }
}
