import { describe, expect, it } from 'vitest';
import { Player } from '../src/game/Player.js';
import { Round } from '../src/game/Round.js';
import { stackedShoe } from './helpers.js';
import type { Card } from '@blackjack/shared';

const stack = (ranks: string[]): Card[] =>
  ranks.map((r) => ({ rank: r as Card['rank'], suit: '♠' }));

function setupRound(seats: number[], cardOrder: string[], chips = 1000) {
  const shoe = stackedShoe(stack(cardOrder));
  const players = seats.map((s, i) => new Player(`p${i + 1}`, s, chips));
  const round = new Round({ shoe, players });
  return { shoe, players, round };
}

describe('Round deal order', () => {
  it('deals P1, P2, Dealer-up, P1, P2, Dealer-hole in that order', () => {
    const { round, players } = setupRound(
      [1, 2],
      // P1c1, P2c1, Du, P1c2, P2c2, Dh
      ['2', '3', '4', '5', '6', '7'],
    );
    round.placeBet('p1', 10);
    round.placeBet('p2', 10);
    round.startDeal();
    expect(players[0]!.hands[0]!.cards.map(c => c.rank)).toEqual(['2', '5']);
    expect(players[1]!.hands[0]!.cards.map(c => c.rank)).toEqual(['3', '6']);
    expect(round.dealer.upCard?.rank).toBe('4');
    // Hole card is in the hand but not yet revealed
    expect(round.dealer.hand.cards[1]?.rank).toBe('7');
  });
});

describe('Round dealer blackjack short-circuit', () => {
  it('player BJ vs dealer BJ → push', () => {
    const { round, players } = setupRound(
      [1],
      ['A', 'A', '10', 'K'], // P1: A,10 BJ. Dealer: A,K BJ
    );
    round.placeBet('p1', 100);
    round.startDeal();
    expect(round.phase).toBe('settled');
    expect(round.results).toHaveLength(1);
    expect(round.results[0]!.result.outcome).toBe('push');
    expect(players[0]!.chips).toBe(1000); // stake returned
  });

  it('dealer BJ vs non-BJ → loss for all non-BJ players', () => {
    const { round, players } = setupRound(
      [1],
      ['10', 'A', '5', 'K'], // P1: 10,5. Dealer: A,K BJ
    );
    round.placeBet('p1', 100);
    round.startDeal();
    expect(round.phase).toBe('settled');
    expect(round.results[0]!.result.outcome).toBe('lose');
    expect(players[0]!.chips).toBe(900); // -100
  });
});

describe('Round basic play', () => {
  it('player BJ wins 3:2 when dealer is not BJ', () => {
    const { round, players } = setupRound(
      [1],
      ['A', '10', '10', '7'], // P1: A,10 BJ. Dealer: 10,7 = 17
    );
    round.placeBet('p1', 100);
    round.startDeal();
    expect(round.phase).toBe('settled');
    expect(round.results[0]!.result.outcome).toBe('blackjack');
    expect(players[0]!.chips).toBe(1150); // 1000 - 100 + (100 + 150)
  });

  it('player hits and busts → loss, no further input', () => {
    const { round, players } = setupRound(
      [1],
      // P1: 10,6 = 16. Dealer: 9,7 = 16 (will hit). P1 hits 10 → 26 bust
      ['10', '9', '6', '7', '10'],
    );
    round.placeBet('p1', 50);
    round.startDeal();
    round.hit('p1');
    expect(round.phase).toBe('settled');
    expect(round.results[0]!.result.outcome).toBe('bust');
    expect(players[0]!.chips).toBe(950);
  });

  it('player stands → dealer plays out, higher wins', () => {
    const { round, players } = setupRound(
      [1],
      // P1: 10,9 = 19. Dealer: 10,7 = 17, S17 stops.
      ['10', '10', '9', '7'],
    );
    round.placeBet('p1', 20);
    round.startDeal();
    round.stand('p1');
    expect(round.phase).toBe('settled');
    expect(round.results[0]!.result.outcome).toBe('win');
    expect(players[0]!.chips).toBe(1020);
  });
});

describe('Round actions', () => {
  it('double down draws exactly one card and ends the hand', () => {
    const { round, players } = setupRound(
      [1],
      // P1: 5,6 = 11. Dealer: 10,7. Double → P1 gets 10 → 21. Dealer stays 17.
      ['5', '10', '6', '7', '10'],
    );
    round.placeBet('p1', 100);
    round.startDeal();
    round.double('p1');
    expect(round.phase).toBe('settled');
    expect(players[0]!.hands[0]!.cards.map(c => c.rank)).toEqual(['5', '6', '10']);
    expect(players[0]!.hands[0]!.bet).toBe(200);
    expect(round.results[0]!.result.outcome).toBe('win');
    expect(round.results[0]!.result.payout).toBe(200);
    expect(players[0]!.chips).toBe(1200);
  });

  it('surrender forfeits half the bet immediately', () => {
    const { round, players } = setupRound(
      [1],
      ['10', '10', '6', '7'], // P1: 10,6 vs Dealer A?? Just need any deal.
    );
    round.placeBet('p1', 100);
    round.startDeal();
    round.surrender('p1');
    expect(round.phase).toBe('settled');
    expect(round.results[0]!.result.outcome).toBe('surrender');
    expect(players[0]!.chips).toBe(950); // -50
  });

  it('split: creates two hands, each drawn one card', () => {
    const { round, players } = setupRound(
      [1],
      // P1: 8,8. Dealer: 10,9. Split → first 8 gets new card 5 → 13.
      // Stand on first hand. Second 8 gets new card 2 → 10. Stand.
      // Dealer plays out 10,9 = 19. P1 hand1 13 loses; hand2 10 loses.
      ['8', '10', '8', '9', '5', '2'],
    );
    round.placeBet('p1', 50);
    round.startDeal();
    round.split('p1');
    expect(players[0]!.hands).toHaveLength(2);
    expect(players[0]!.hands[0]!.cards.map(c => c.rank)).toEqual(['8', '5']);
    expect(players[0]!.hands[1]!.cards.map(c => c.rank)).toEqual(['8', '2']);
    round.stand('p1'); // first hand
    round.stand('p1'); // second hand
    expect(round.phase).toBe('settled');
    expect(round.results).toHaveLength(2);
    expect(round.results.every(r => r.result.outcome === 'lose')).toBe(true);
    // 1000 - 50 (initial bet) - 50 (split bet) = 900
    expect(players[0]!.chips).toBe(900);
  });

  it('split aces: one card each, auto-stand', () => {
    const { round, players } = setupRound(
      [1],
      // P1: A,A. Dealer: 10,7 = 17. Split: hand1 gets 5 → soft 16, auto-stand.
      // Hand2 gets 9 → soft 20, auto-stand. Dealer 17. P1 hand1 loses, hand2 wins.
      ['A', '10', 'A', '7', '5', '9'],
    );
    round.placeBet('p1', 100);
    round.startDeal();
    round.split('p1');
    // No further actions — auto-stand on aces should have advanced.
    expect(round.phase).toBe('settled');
    expect(round.results).toHaveLength(2);
    expect(round.results[0]!.result.outcome).toBe('lose');
    expect(round.results[1]!.result.outcome).toBe('win');
  });
});

describe('Round multi-player turn order', () => {
  it('walks seats in order, then plays dealer', () => {
    const { round, players } = setupRound(
      [1, 2, 3],
      // P1c1, P2c1, P3c1, Du, P1c2, P2c2, P3c2, Dh, …
      ['10', '10', '10', '7', '9', '9', '9', '10', /* dealer draws: */ '10'],
    );
    round.placeBet('p1', 10);
    round.placeBet('p2', 10);
    round.placeBet('p3', 10);
    round.startDeal();
    expect(round.currentTurn?.playerId).toBe('p1');
    round.stand('p1');
    expect(round.currentTurn?.playerId).toBe('p2');
    round.stand('p2');
    expect(round.currentTurn?.playerId).toBe('p3');
    round.stand('p3');
    // After p3 stands, dealer plays out.
    expect(round.phase).toBe('settled');
    expect(round.results).toHaveLength(3);
  });

  it('out-of-turn action throws', () => {
    const { round } = setupRound(
      [1, 2],
      ['10', '10', '5', '9', '9', '7'],
    );
    round.placeBet('p1', 10);
    round.placeBet('p2', 10);
    round.startDeal();
    expect(() => round.stand('p2')).toThrow();
  });
});

describe('Round all-bust scenarios', () => {
  it('all players bust → dealer reveals hole but does not need to draw beyond stand', () => {
    const { round, players } = setupRound(
      [1],
      // P1: 10,6 = 16. Dealer: 10,5 = 15. P1 hits 10 → bust 26.
      // All players bust, dealer should still reveal but not need to play out.
      ['10', '10', '6', '5', '10'],
    );
    round.placeBet('p1', 50);
    round.startDeal();
    round.hit('p1');
    expect(round.phase).toBe('settled');
    expect(round.dealer.holeCardRevealed).toBe(true);
    // Dealer should have stood without drawing extra
    expect(round.dealer.hand.cards).toHaveLength(2);
    expect(players[0]!.chips).toBe(950);
  });
});
