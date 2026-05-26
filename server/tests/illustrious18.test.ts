import { describe, expect, it } from 'vitest';
import { Hand } from '../src/game/Hand.js';
import { findI18Deviation, illustrious18 } from '../src/sim/illustrious18.js';
import { basicStrategy, type DecisionContext } from '../src/sim/strategy.js';
import { c } from './helpers.js';

function makeContext(
  cards: ReturnType<typeof c>[],
  dealerUpRank: string,
  trueCount: number,
  flags: Partial<Pick<DecisionContext, 'canDouble' | 'canSplit' | 'canSurrender' | 'isFromSplit'>> = {},
): DecisionContext {
  const h = new Hand(25);
  for (const card of cards) h.addCard(card);
  return {
    hand: h,
    dealerUp: { rank: dealerUpRank as 'A' | '2', suit: '♠' } as never,
    trueCount,
    canDouble: flags.canDouble ?? true,
    canSplit: flags.canSplit ?? true,
    canSurrender: flags.canSurrender ?? true,
    isFromSplit: flags.isFromSplit ?? false,
  };
}

describe('Illustrious 18: positive deviations', () => {
  it('16 vs 10 → surrender at low TC (basic LS), stand at TC≥+4 (LS-aware deviation)', () => {
    // Classical I18 says "stand at TC ≥ 0" assuming no surrender. With LS in
    // play, basic = surrender (EV -0.5); stand only beats surrender ~TC ≥ +4.
    expect(illustrious18(makeContext([c('10'), c('6')], '10', -1))).toBe('surrender');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 0))).toBe('surrender');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 3))).toBe('surrender');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 4))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 6))).toBe('stand');
  });

  it('16 vs 10 with no surrender available → hit by basic, stand at TC≥+4', () => {
    expect(illustrious18(makeContext([c('10'), c('6')], '10', -1, { canSurrender: false })))
      .toBe('hit');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 3, { canSurrender: false })))
      .toBe('hit');
    expect(illustrious18(makeContext([c('10'), c('6')], '10', 4, { canSurrender: false })))
      .toBe('stand');
  });

  it('15 vs 10 → surrender at TC=3, stand at TC=4 (deviation fires)', () => {
    // At TC ≤ 3 we still follow basic, which prescribes Surrender for 15 vs 10.
    expect(illustrious18(makeContext([c('10'), c('5')], '10', 3))).toBe('surrender');
    expect(illustrious18(makeContext([c('10'), c('5')], '10', 4))).toBe('stand');
  });

  it('10,10 vs 6 → split at TC=4 (the spicy one)', () => {
    expect(illustrious18(makeContext([c('10'), c('10')], '6', 3))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('10')], '6', 4))).toBe('split');
  });

  it('10,10 vs 5 → split at TC=5', () => {
    expect(illustrious18(makeContext([c('10'), c('10')], '5', 4))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('10')], '5', 5))).toBe('split');
  });

  it('10 vs 10 → double at TC=4', () => {
    expect(illustrious18(makeContext([c('6'), c('4')], '10', 3))).toBe('hit');
    expect(illustrious18(makeContext([c('6'), c('4')], '10', 4))).toBe('double');
  });

  it('12 vs 3 → stand at TC=2', () => {
    expect(illustrious18(makeContext([c('10'), c('2')], '3', 1))).toBe('hit');
    expect(illustrious18(makeContext([c('10'), c('2')], '3', 2))).toBe('stand');
  });

  it('9 vs 2 → double at TC=1', () => {
    expect(illustrious18(makeContext([c('5'), c('4')], '2', 0))).toBe('hit');
    expect(illustrious18(makeContext([c('5'), c('4')], '2', 1))).toBe('double');
  });
});

describe('Illustrious 18: negative deviations (hit when basic says stand)', () => {
  it('13 vs 2 → hit at TC=-1', () => {
    expect(illustrious18(makeContext([c('10'), c('3')], '2', 0))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('3')], '2', -1))).toBe('hit');
  });

  it('12 vs 4 → hit at TC=0', () => {
    expect(illustrious18(makeContext([c('10'), c('2')], '4', 1))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('2')], '4', 0))).toBe('hit');
  });

  it('12 vs 6 → hit at TC=-1', () => {
    expect(illustrious18(makeContext([c('10'), c('2')], '6', 0))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('2')], '6', -1))).toBe('hit');
  });
});

describe('Illustrious 18: fallthroughs', () => {
  it('falls back to basic when no deviation matches', () => {
    // hard 18 vs 6: never an I18 entry — always stand by basic.
    expect(illustrious18(makeContext([c('10'), c('8')], '6', 0))).toBe('stand');
    expect(illustrious18(makeContext([c('10'), c('8')], '6', 5))).toBe('stand');
  });

  it('hard:N entries do not fire on a literal pair (pair table handles those)', () => {
    // 16h vs 10 = stand at TC ≥ 0, but 8,8 vs 10 is a pair — basic says split.
    const ctx = makeContext([c('8'), c('8')], '10', 3);
    expect(illustrious18(ctx)).toBe('split'); // pair rule wins
  });

  it('falls back to basic when override action is illegal in the moment', () => {
    // 10 vs A → double (TC ≥ 4) deviation — but if canDouble=false, fall back.
    const noDouble = makeContext([c('6'), c('4')], 'A', 5, { canDouble: false });
    expect(illustrious18(noDouble)).toBe(basicStrategy(noDouble));
  });
});

describe('findI18Deviation', () => {
  it('returns null when no deviation matches', () => {
    expect(findI18Deviation(makeContext([c('10'), c('9')], '10', 5))).toBeNull();
  });

  it('returns the matching deviation entry with label', () => {
    const dev = findI18Deviation(makeContext([c('10'), c('6')], '10', 4));
    expect(dev?.label).toContain('16 vs 10');
  });
});
