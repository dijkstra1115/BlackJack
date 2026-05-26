import { trueCount as computeTrueCount } from '../game/CountingSystem.js';
import { Player } from '../game/Player.js';
import { Round } from '../game/Round.js';
import { mulberry32 } from '../game/rng.js';
import { Shoe } from '../game/Shoe.js';
import type { BetSizing } from './betSizing.js';
import type { Strategy } from './strategy.js';
import {
  StatsCollector,
  dealerUpKey,
  initialHandSignature,
  tcBucket,
  type HandRecord,
} from './stats.js';

/**
 * Wong-out: walk away from the table mid-shoe when the count has gone south
 * and there isn't enough deck left for a recovery. Modelled as a forced
 * reshuffle (= "go find a different table").
 */
export interface WongOutConfig {
  /** Walk if trueCount ≤ this. Default -1. */
  tcThreshold: number;
  /** Walk only if remaining decks ≤ this (so we don't bail too early). Default 2. */
  remainingDecksThreshold: number;
}

export interface SimulatorOptions {
  hands: number;
  seed: number;
  strategy: Strategy;
  betSizing: BetSizing;
  baseUnit?: number;
  startingBankroll?: number;
  /** Sample bankroll every K hands (for trajectory plotting). */
  bankrollSampleStride?: number;
  /** If set, the sim Wong-outs (force-reshuffle) when the condition holds. */
  wongOut?: WongOutConfig;
}

export interface SimulationResult {
  stats: StatsCollector;
  /** Hands actually played. May be less than requested if bankroll busts. */
  handsPlayed: number;
  /** Number of shoes consumed (includes forced reshuffles from Wong-out). */
  shoesUsed: number;
  /** Times the sim walked away from a shoe early. */
  wongOuts: number;
  /** Hands skipped due to Wong-out (these don't count toward `handsPlayed`). */
  wongOutHandsSkipped: number;
}

/**
 * Drives a single-seat blackjack table via the domain layer, applying the
 * given strategy and bet sizing on every hand. Records per-hand stats so a
 * caller can produce a report afterwards.
 *
 * Performance: pure JS, no I/O. ~100k hands in a few seconds on modern
 * hardware. We avoid logging in the inner loop on purpose.
 */
export class Simulator {
  private readonly opts: Required<Omit<SimulatorOptions, 'wongOut'>> & { wongOut: WongOutConfig | null };
  private readonly stats = new StatsCollector();
  private readonly shoe: Shoe;
  private readonly player: Player;
  private readonly playerId = 'sim-player';

  private shoeCount = 1;
  private wongOuts = 0;
  private wongOutHandsSkipped = 0;

  constructor(opts: SimulatorOptions) {
    this.opts = {
      hands: opts.hands,
      seed: opts.seed,
      strategy: opts.strategy,
      betSizing: opts.betSizing,
      baseUnit: opts.baseUnit ?? 25,
      startingBankroll: opts.startingBankroll ?? 1_000_000,
      bankrollSampleStride: opts.bankrollSampleStride ?? Math.max(1, Math.floor(opts.hands / 200)),
      wongOut: opts.wongOut ?? null,
    };
    this.shoe = new Shoe({ rng: mulberry32(this.opts.seed) });
    this.player = new Player(this.playerId, 1, this.opts.startingBankroll);
  }

  run(): SimulationResult {
    let played = 0;
    for (let h = 1; h <= this.opts.hands; h++) {
      if (this.shoe.needsReshuffle()) {
        this.shoe.shuffle();
        this.shoeCount++;
      }

      // Realistic "ruin" condition — if we can't even cover the table
      // minimum we have to leave the table.
      if (this.player.chips < this.opts.baseUnit) break;

      const preTc = computeTrueCount(this.shoe);

      // Wong-out: if the count has soured and there isn't enough deck left
      // for it to recover, walk away from this shoe (= force-reshuffle).
      if (this.opts.wongOut) {
        const w = this.opts.wongOut;
        if (preTc <= w.tcThreshold && this.shoe.remainingDecks <= w.remainingDecksThreshold) {
          this.shoe.shuffle();
          this.shoeCount++;
          this.wongOuts++;
          this.wongOutHandsSkipped++;
          continue;
        }
      }

      let bet = Math.round(
        this.opts.betSizing({
          trueCount: preTc,
          baseUnit: this.opts.baseUnit,
          bankroll: this.player.chips,
        }),
      );
      if (bet <= 0) bet = this.opts.baseUnit;
      if (bet > this.player.chips) bet = this.player.chips;

      const round = new Round({ shoe: this.shoe, players: [this.player] });
      round.placeBet(this.playerId, bet);
      round.startDeal();

      // Snapshot context at the moment of the first decision (the initial hand
      // is round.players[0].hands[0] right after startDeal). True count here
      // reflects all REVEALED cards from the deal — exactly what a player at
      // the live table would see.
      const initialHand = this.player.hands[0]!;
      const initialSig = initialHandSignature(initialHand);
      const dealerUp = round.dealer.upCard!;
      const decisionTc = computeTrueCount(this.shoe);

      let firstAction: HandRecord['firstAction'] = 'none';

      // Drive actions until the round leaves the playerAction phase.
      while (round.phase === 'playerAction') {
        const turn = round.currentTurn;
        if (!turn || turn.playerId !== this.playerId) break;
        const hand = this.player.hands[turn.handIndex]!;
        const action = this.opts.strategy({
          hand,
          dealerUp,
          trueCount: computeTrueCount(this.shoe),
          canDouble: hand.canDouble() && this.player.chips >= hand.bet,
          canSplit: hand.canSplit(this.player.splitCount) && this.player.chips >= hand.bet,
          canSurrender: hand.canSurrender(),
          isFromSplit: hand.isFromSplit,
        });

        if (firstAction === 'none') firstAction = action;

        // Some strategies may suggest unavailable actions (e.g. split when not
        // a pair). Coerce to a legal fallback so the round doesn't throw.
        const safe = this.coerceAction(round, action);
        try {
          this.invoke(round, safe);
        } catch {
          // Last-ditch fallback if any check missed — stand.
          if (round.phase === 'playerAction') round.forceStand();
        }
      }

      // Round is settled. Sum payouts for the player (covers split hands).
      let netPayout = 0;
      for (const r of round.results) {
        if (r.playerId !== this.playerId) continue;
        netPayout += r.result.payout;
      }
      const unitEV = bet === 0 ? 0 : netPayout / bet;
      this.stats.record({
        trueCount: Math.round(decisionTc * 10) / 10,
        tcBucket: tcBucket(decisionTc),
        playerSig: initialSig,
        dealerUp: dealerUpKey(dealerUp),
        firstAction,
        originalBet: bet,
        netPayout,
        unitEV,
      });

      played++;
      if (h % this.opts.bankrollSampleStride === 0) {
        this.stats.sampleBankroll(this.player.chips);
      }
      // Clear player's hands so the next Round.placeBet() starts cleanly.
      // (Round.placeBet re-uses Player.placeBet which already clears, but
      // explicit reset costs nothing.)
      this.player.clearHands();
    }

    if (this.stats.bankrollSamples.length === 0) {
      this.stats.sampleBankroll(this.player.chips);
    } else {
      this.stats.sampleBankroll(this.player.chips); // final point
    }

    return {
      stats: this.stats,
      handsPlayed: played,
      shoesUsed: this.shoeCount,
      wongOuts: this.wongOuts,
      wongOutHandsSkipped: this.wongOutHandsSkipped,
    };
  }

  /** Map strategy output to a domain-legal action given current state. */
  private coerceAction(round: Round, action: ReturnType<Strategy>): ReturnType<Strategy> {
    const turn = round.currentTurn;
    if (!turn) return 'stand';
    const hand = this.player.hands[turn.handIndex]!;
    switch (action) {
      case 'double':
        if (!hand.canDouble() || this.player.chips < hand.bet) return 'hit';
        return 'double';
      case 'split':
        if (!hand.canSplit(this.player.splitCount) || this.player.chips < hand.bet) {
          // Pair the strategy wanted to split but can't — fall back to chart
          // for the same hand minus the split option. Cheap heuristic: hit.
          return 'hit';
        }
        return 'split';
      case 'surrender':
        if (!hand.canSurrender()) return 'hit';
        return 'surrender';
      case 'hit':
      case 'stand':
      default:
        return action;
    }
  }

  private invoke(round: Round, action: ReturnType<Strategy>): void {
    switch (action) {
      case 'hit':       round.hit(this.playerId); break;
      case 'stand':     round.stand(this.playerId); break;
      case 'double':    round.double(this.playerId); break;
      case 'split':     round.split(this.playerId); break;
      case 'surrender': round.surrender(this.playerId); break;
    }
  }
}

