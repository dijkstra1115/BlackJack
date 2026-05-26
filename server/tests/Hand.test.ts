import { describe, expect, it } from 'vitest';
import { Hand } from '../src/game/Hand.js';
import { c } from './helpers.js';

const handOf = (...cards: ReturnType<typeof c>[]) => {
  const h = new Hand(10);
  for (const card of cards) h.addCard(card);
  return h;
};

describe('Hand.total', () => {
  it('[A, 6] is soft 17', () => {
    const h = handOf(c('A'), c('6'));
    expect(h.total()).toEqual({ value: 17, isSoft: true });
  });

  it('[A, 6, 10] demotes the ace → hard 17', () => {
    const h = handOf(c('A'), c('6'), c('10'));
    expect(h.total()).toEqual({ value: 17, isSoft: false });
  });

  it('[A, A] is soft 12 (one ace stays 11)', () => {
    const h = handOf(c('A'), c('A'));
    expect(h.total()).toEqual({ value: 12, isSoft: true });
  });

  it('[A, A, 9] = 21 with one ace still soft', () => {
    const h = handOf(c('A'), c('A'), c('9'));
    expect(h.total()).toEqual({ value: 21, isSoft: true });
  });

  it('[A, A, 9, 10] both aces demoted → hard 21', () => {
    const h = handOf(c('A'), c('A'), c('9'), c('10'));
    expect(h.total()).toEqual({ value: 21, isSoft: false });
  });

  it('[10, 10, 2] = 22, bust', () => {
    const h = handOf(c('10'), c('10'), c('2'));
    expect(h.isBust()).toBe(true);
    expect(h.total().value).toBe(22);
  });
});

describe('Hand.isBlackjack', () => {
  it('[A, 10] is a natural blackjack', () => {
    expect(handOf(c('A'), c('10')).isBlackjack()).toBe(true);
    expect(handOf(c('A'), c('K')).isBlackjack()).toBe(true);
  });

  it('[10, 6, 5] = 21 but is NOT blackjack (3 cards)', () => {
    expect(handOf(c('10'), c('6'), c('5')).isBlackjack()).toBe(false);
  });

  it('split A+10 is not blackjack', () => {
    const h = new Hand(10, { isFromSplit: true });
    h.addCard(c('A'));
    h.addCard(c('10'));
    expect(h.isBlackjack()).toBe(false);
  });
});

describe('Hand.canSplit', () => {
  it('matching pair of 5s can split', () => {
    expect(handOf(c('5'), c('5')).canSplit(0)).toBe(true);
  });

  it('10 and K count as the same value for splitting', () => {
    expect(handOf(c('10'), c('K')).canSplit(0)).toBe(true);
    expect(handOf(c('Q'), c('J')).canSplit(0)).toBe(true);
  });

  it('10 and 5 cannot split', () => {
    expect(handOf(c('10'), c('5')).canSplit(0)).toBe(false);
  });

  it('cannot split past MAX_SPLITS', () => {
    expect(handOf(c('8'), c('8')).canSplit(3)).toBe(false);
  });

  it('cannot split with more than two cards', () => {
    expect(handOf(c('8'), c('8'), c('3')).canSplit(0)).toBe(false);
  });
});

describe('Hand.canDouble', () => {
  it('initial two-card hand can double', () => {
    expect(handOf(c('5'), c('5')).canDouble()).toBe(true);
  });

  it('cannot double after hitting', () => {
    expect(handOf(c('5'), c('5'), c('3')).canDouble()).toBe(false);
  });

  it('split-aces hand cannot double (one card only rule)', () => {
    const h = new Hand(10, { isFromSplit: true, isFromSplitAces: true });
    h.addCard(c('A'));
    h.addCard(c('5'));
    expect(h.canDouble()).toBe(false);
  });

  it('DAS — non-ace split hand can double', () => {
    const h = new Hand(10, { isFromSplit: true });
    h.addCard(c('5'));
    h.addCard(c('5'));
    expect(h.canDouble()).toBe(true);
  });
});

describe('Hand.canSurrender', () => {
  it('two-card pre-action hand can surrender', () => {
    expect(handOf(c('10'), c('6')).canSurrender()).toBe(true);
  });

  it('cannot surrender after hit', () => {
    expect(handOf(c('10'), c('2'), c('3')).canSurrender()).toBe(false);
  });

  it('cannot surrender after split', () => {
    const h = new Hand(10, { isFromSplit: true });
    h.addCard(c('8'));
    h.addCard(c('5'));
    expect(h.canSurrender()).toBe(false);
  });
});

describe('Hand.canHit', () => {
  it('non-terminal hand can hit', () => {
    expect(handOf(c('5'), c('5')).canHit()).toBe(true);
  });

  it('busted hand cannot hit', () => {
    expect(handOf(c('10'), c('10'), c('5')).canHit()).toBe(false);
  });

  it('21 cannot hit', () => {
    expect(handOf(c('10'), c('A')).canHit()).toBe(false);
  });

  it('split-aces hand cannot hit after first card', () => {
    const h = new Hand(10, { isFromSplit: true, isFromSplitAces: true });
    h.addCard(c('A'));
    h.addCard(c('5'));
    expect(h.canHit()).toBe(false);
  });
});
