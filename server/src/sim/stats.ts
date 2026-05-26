import type { Card, PlayerAction } from '@blackjack/shared';
import { cardValue } from '../game/Card.js';
import type { Hand } from '../game/Hand.js';

export interface HandRecord {
  /** True count snapshotted at the moment of the first decision. */
  trueCount: number;
  /** Bucketed TC ("-3", "-2", ..., "+5") for grouping. */
  tcBucket: string;
  /** Canonical signature of the player's initial 2-card hand. */
  playerSig: string;
  /** Dealer up-card rank. */
  dealerUp: string;
  /** First action the strategy took on this hand. */
  firstAction: PlayerAction | 'none';
  /** Stake placed at start of round (before any double / split additions). */
  originalBet: number;
  /** Net chip change across all hands derived from this initial hand. */
  netPayout: number;
  /** Per-unit EV = netPayout / originalBet. */
  unitEV: number;
}

/**
 * Canonical signature for an initial 2-card hand:
 *   Pair:  '5,5'  '10,10'  'A,A'
 *   Soft:  'A,7'  'A,2'
 *   Hard:  '12h'  '16h'  '21h'
 * Multi-card hands aren't expected as "initial" — first decision is on 2 cards.
 */
export function initialHandSignature(hand: Hand): string {
  if (hand.cards.length !== 2) return `${hand.total().value}h`;
  const [a, b] = hand.cards as [Card, Card];
  const va = cardValue(a.rank);
  const vb = cardValue(b.rank);
  if (va === vb) {
    if (a.rank === 'A') return 'A,A';
    const r = va === 10 ? '10' : String(va);
    return `${r},${r}`;
  }
  if (a.rank === 'A' || b.rank === 'A') {
    const otherVal = a.rank === 'A' ? vb : va;
    return `A,${otherVal}`;
  }
  return `${hand.total().value}h`;
}

export function dealerUpKey(card: Card): string {
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return '10';
  return card.rank;
}

/** Round TC to integer for bucketing; clamp into [-5, +5]. */
export function tcBucket(tc: number): string {
  const t = Math.max(-5, Math.min(5, Math.round(tc)));
  return t >= 0 ? `+${t}` : String(t);
}

interface AggSlot {
  hands: number;
  wagered: number;
  net: number;
  /** Sum of (unitEV) — payout / originalBet, weighted equally per hand. */
  unitEvSum: number;
  /** Sum of (unitEV ^ 2) — for std dev. */
  unitEvSqSum: number;
}

function newSlot(): AggSlot {
  return { hands: 0, wagered: 0, net: 0, unitEvSum: 0, unitEvSqSum: 0 };
}

function addToSlot(slot: AggSlot, rec: HandRecord): void {
  slot.hands++;
  slot.wagered += rec.originalBet;
  slot.net += rec.netPayout;
  slot.unitEvSum += rec.unitEV;
  slot.unitEvSqSum += rec.unitEV * rec.unitEV;
}

export class StatsCollector {
  totalHands = 0;
  totalWagered = 0;
  totalNet = 0;
  unitEvSum = 0;
  unitEvSqSum = 0;

  /** Bankroll snapshot every K hands; cheap memory if K=hands/200. */
  bankrollSamples: number[] = [];

  private byTc = new Map<string, AggSlot>();
  private byMatchup = new Map<string, AggSlot>();          // playerSig|dealerUp
  private byMatchupAction = new Map<string, AggSlot>();    // playerSig|dealerUp|action
  private actionCounts = new Map<PlayerAction | 'none', number>();

  record(rec: HandRecord): void {
    this.totalHands++;
    this.totalWagered += rec.originalBet;
    this.totalNet += rec.netPayout;
    this.unitEvSum += rec.unitEV;
    this.unitEvSqSum += rec.unitEV * rec.unitEV;

    const tcKey = rec.tcBucket;
    addToSlot(this.getOrCreate(this.byTc, tcKey), rec);

    const matchupKey = `${rec.playerSig}|${rec.dealerUp}`;
    addToSlot(this.getOrCreate(this.byMatchup, matchupKey), rec);

    const matchupActionKey = `${matchupKey}|${rec.firstAction}`;
    addToSlot(this.getOrCreate(this.byMatchupAction, matchupActionKey), rec);

    this.actionCounts.set(rec.firstAction, (this.actionCounts.get(rec.firstAction) ?? 0) + 1);
  }

  sampleBankroll(value: number): void {
    this.bankrollSamples.push(value);
  }

  private getOrCreate<K>(map: Map<K, AggSlot>, key: K): AggSlot {
    let s = map.get(key);
    if (!s) { s = newSlot(); map.set(key, s); }
    return s;
  }

  // ---- accessors used by the report formatter ----

  get returnPct(): number {
    if (this.totalWagered === 0) return 0;
    return (this.totalNet / this.totalWagered) * 100;
  }

  get unitEvMean(): number {
    return this.totalHands === 0 ? 0 : this.unitEvSum / this.totalHands;
  }

  /** Std dev of unit EV per hand — variance of the bet curve. */
  get unitEvStdDev(): number {
    if (this.totalHands === 0) return 0;
    const mean = this.unitEvMean;
    const variance = this.unitEvSqSum / this.totalHands - mean * mean;
    return Math.sqrt(Math.max(0, variance));
  }

  get actionMix(): Record<string, { count: number; pct: number }> {
    const out: Record<string, { count: number; pct: number }> = {};
    for (const [k, v] of this.actionCounts) {
      out[String(k)] = { count: v, pct: (v / this.totalHands) * 100 };
    }
    return out;
  }

  tcTable(): Array<{ tc: string; hands: number; wagered: number; net: number; unitEv: number }> {
    const order = ['-5','-4','-3','-2','-1','+0','+1','+2','+3','+4','+5'];
    const rows: Array<{ tc: string; hands: number; wagered: number; net: number; unitEv: number }> = [];
    for (const tc of order) {
      const s = this.byTc.get(tc);
      if (!s || s.hands === 0) continue;
      rows.push({
        tc,
        hands: s.hands,
        wagered: s.wagered,
        net: s.net,
        unitEv: s.hands === 0 ? 0 : s.unitEvSum / s.hands,
      });
    }
    return rows;
  }

  /**
   * Top N matchup+action combos by unit EV. `minHands` filters noise.
   * "none" rows (no decision needed — dealer/player BJ short-circuits) are
   * excluded by default since they're outcomes, not decisions.
   */
  topActions(
    n: number,
    direction: 'best' | 'worst',
    minHands = 100,
    includeNone = false,
  ): Array<{ key: string; hands: number; unitEv: number; net: number }> {
    const rows = [...this.byMatchupAction.entries()]
      .filter(([k, s]) => s.hands >= minHands && (includeNone || !k.endsWith('|none')))
      .map(([key, s]) => ({ key, hands: s.hands, unitEv: s.unitEvSum / s.hands, net: s.net }));
    rows.sort((a, b) => direction === 'best' ? b.unitEv - a.unitEv : a.unitEv - b.unitEv);
    return rows.slice(0, n);
  }

  /** Top N matchups (ignoring action) by unit EV. */
  topMatchups(
    n: number,
    direction: 'best' | 'worst',
    minHands = 100,
  ): Array<{ key: string; hands: number; unitEv: number; net: number }> {
    const rows = [...this.byMatchup.entries()]
      .filter(([, s]) => s.hands >= minHands)
      .map(([key, s]) => ({ key, hands: s.hands, unitEv: s.unitEvSum / s.hands, net: s.net }));
    rows.sort((a, b) => direction === 'best' ? b.unitEv - a.unitEv : a.unitEv - b.unitEv);
    return rows.slice(0, n);
  }

  bankrollExtremes(): { min: number; max: number; final: number } {
    if (this.bankrollSamples.length === 0) return { min: 0, max: 0, final: 0 };
    let min = Infinity, max = -Infinity;
    for (const v of this.bankrollSamples) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max, final: this.bankrollSamples[this.bankrollSamples.length - 1]! };
  }
}
