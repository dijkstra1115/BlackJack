import { describe, expect, it } from 'vitest';
import { Hand } from '../src/game/Hand.js';
import { settle } from '../src/game/settlement.js';
import { c } from './helpers.js';

const handOf = (bet: number, ...cards: ReturnType<typeof c>[]) => {
  const h = new Hand(bet);
  for (const card of cards) h.addCard(card);
  return h;
};

describe('settle', () => {
  it('player blackjack vs dealer non-BJ → 3:2 payout', () => {
    const player = handOf(100, c('A'), c('K'));
    const dealer = handOf(0, c('10'), c('7'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('blackjack');
    expect(res.payout).toBe(150);
  });

  it('player BJ vs dealer BJ → push', () => {
    const player = handOf(100, c('A'), c('K'));
    const dealer = handOf(0, c('A'), c('Q'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('push');
    expect(res.payout).toBe(0);
  });

  it('dealer BJ vs non-BJ player → lose', () => {
    const player = handOf(100, c('10'), c('9'));
    const dealer = handOf(0, c('A'), c('K'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('lose');
    expect(res.payout).toBe(-100);
  });

  it('player busts → -bet', () => {
    const player = handOf(50, c('10'), c('10'), c('5'));
    const dealer = handOf(0, c('10'), c('7'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('bust');
    expect(res.payout).toBe(-50);
  });

  it('dealer busts, player stands → win', () => {
    const player = handOf(25, c('10'), c('8'));
    const dealer = handOf(0, c('10'), c('6'), c('10'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('win');
    expect(res.payout).toBe(25);
  });

  it('higher total wins', () => {
    const player = handOf(40, c('10'), c('9'));
    const dealer = handOf(0, c('10'), c('7'));
    expect(settle(player, dealer)).toEqual({ outcome: 'win', payout: 40 });
  });

  it('lower total loses', () => {
    const player = handOf(40, c('10'), c('5'));
    const dealer = handOf(0, c('10'), c('8'));
    expect(settle(player, dealer)).toEqual({ outcome: 'lose', payout: -40 });
  });

  it('equal non-BJ totals push', () => {
    const player = handOf(30, c('10'), c('8'));
    const dealer = handOf(0, c('10'), c('8'));
    expect(settle(player, dealer)).toEqual({ outcome: 'push', payout: 0 });
  });

  it('surrender returns half the bet as loss', () => {
    const player = handOf(60, c('10'), c('6'));
    player.hasSurrendered = true;
    const dealer = handOf(0, c('10'), c('9'));
    expect(settle(player, dealer)).toEqual({ outcome: 'surrender', payout: -30 });
  });

  it('doubled bet pays out at the doubled amount', () => {
    const player = handOf(50, c('5'), c('5'));
    player.bet = 100; // simulating double
    player.hasDoubled = true;
    player.addCard(c('10')); // 20 total
    const dealer = handOf(0, c('10'), c('7'));
    const res = settle(player, dealer);
    expect(res.outcome).toBe('win');
    expect(res.payout).toBe(100);
  });
});
