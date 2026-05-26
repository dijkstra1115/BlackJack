import { trueCount as computeTrueCount } from '../game/CountingSystem.js';
import { Player } from '../game/Player.js';
import { Round } from '../game/Round.js';
import { mulberry32 } from '../game/rng.js';
import { Shoe } from '../game/Shoe.js';
import type { BetSizing } from './betSizing.js';
import {
  StatsCollector,
  dealerUpKey,
  initialHandSignature,
  tcBucket,
} from './stats.js';
import type { Strategy } from './strategy.js';

export interface PlayerConfig {
  strategy: Strategy;
  betSizing: BetSizing;
  baseUnit: number;
  startingBankroll: number;
}

export interface MultiPlayerOptions {
  hands: number;
  seed: number;
  /** Per-seat configs; length = number of players (≤ 7). Seat 1 is index 0. */
  players: PlayerConfig[];
}

export interface PlayerRunResult {
  seat: number;
  startingBankroll: number;
  finalBankroll: number;
  minBankroll: number;
  maxBankroll: number;
  totalWagered: number;
  netResult: number;
  handsPlayed: number;
  /** True if this seat dropped below table-min before the hand cap. */
  bust: boolean;
  stats: StatsCollector;
}

export interface MultiPlayerRunResult {
  perPlayer: PlayerRunResult[];
  /** Hands at the TABLE (one round = one hand for every seated player). */
  roundsPlayed: number;
  shoesUsed: number;
}

/**
 * Drives a multi-seat blackjack table off a single shared shoe.
 *
 * The whole point: all seats see the same shoe, so cards drawn by seat 2
 * naturally update the Hi-Lo count that seat 3's strategy reads on its turn.
 * The Shoe class already updates `runningCount` on every reveal — we just
 * have to pass the shared shoe into one Round per hand.
 *
 * If a seat busts (chips < their table minimum), the seat is skipped on
 * subsequent hands but the other seats keep playing — same as a real table.
 */
export class MultiPlayerSimulator {
  private readonly shoe: Shoe;
  private readonly opts: MultiPlayerOptions;
  private readonly seats: {
    player: Player;
    cfg: PlayerConfig;
    stats: StatsCollector;
    minSampleStride: number;
    busted: boolean;
    handsPlayed: number;
  }[];

  private shoeCount = 1;
  private roundsPlayed = 0;

  constructor(opts: MultiPlayerOptions) {
    if (opts.players.length === 0) throw new Error('need at least one player');
    if (opts.players.length > 7) throw new Error('table maxes out at 7 seats');
    this.opts = opts;
    this.shoe = new Shoe({ rng: mulberry32(opts.seed) });
    this.seats = opts.players.map((cfg, i) => ({
      player: new Player(`sim-p${i + 1}`, i + 1, cfg.startingBankroll),
      cfg,
      stats: new StatsCollector(),
      minSampleStride: Math.max(1, Math.floor(opts.hands / 200)),
      busted: false,
      handsPlayed: 0,
    }));
  }

  run(): MultiPlayerRunResult {
    for (let h = 1; h <= this.opts.hands; h++) {
      if (this.shoe.needsReshuffle()) {
        this.shoe.shuffle();
        this.shoeCount++;
      }

      // Each seat decides its bet using the SAME pre-deal true count.
      const preTc = computeTrueCount(this.shoe);
      const active: typeof this.seats[number][] = [];
      const bets: number[] = [];
      for (const seat of this.seats) {
        if (seat.busted) continue;
        if (seat.player.chips < seat.cfg.baseUnit) {
          seat.busted = true;
          continue;
        }
        let bet = Math.round(
          seat.cfg.betSizing({
            trueCount: preTc,
            baseUnit: seat.cfg.baseUnit,
            bankroll: seat.player.chips,
          }),
        );
        if (bet <= 0) bet = seat.cfg.baseUnit;
        if (bet > seat.player.chips) bet = seat.player.chips;
        active.push(seat);
        bets.push(bet);
      }
      if (active.length === 0) break;

      const round = new Round({
        shoe: this.shoe,
        players: active.map(s => s.player),
      });
      for (let i = 0; i < active.length; i++) {
        round.placeBet(active[i]!.player.id, bets[i]!);
      }
      round.startDeal();

      // Per-seat snapshot for stats — captured AFTER deal so dealerUp and the
      // initial hand are populated. The decision-time TC for stats is taken
      // from the shoe NOW (right before each seat acts).
      const initial = new Map<string, {
        sig: string;
        dealerUp: string;
        tc: number;
        bet: number;
        firstAction: 'none' | 'hit' | 'stand' | 'double' | 'split' | 'surrender';
      }>();
      for (let i = 0; i < active.length; i++) {
        const seat = active[i]!;
        const hand = seat.player.hands[0];
        if (!hand) continue;
        initial.set(seat.player.id, {
          sig: initialHandSignature(hand),
          dealerUp: dealerUpKey(round.dealer.upCard!),
          tc: computeTrueCount(this.shoe),
          bet: bets[i]!,
          firstAction: 'none',
        });
      }

      // Drive each player's actions. The TC visible to each strategy reflects
      // every card revealed in the shoe up to that moment — including hits by
      // earlier seats in this same round.
      while (round.phase === 'playerAction') {
        const turn = round.currentTurn;
        if (!turn) break;
        const seat = active.find(s => s.player.id === turn.playerId);
        if (!seat) break;
        const hand = seat.player.hands[turn.handIndex];
        if (!hand) { round.forceStand(); continue; }
        const action = seat.cfg.strategy({
          hand,
          dealerUp: round.dealer.upCard!,
          trueCount: computeTrueCount(this.shoe),
          canDouble: hand.canDouble() && seat.player.chips >= hand.bet,
          canSplit:
            hand.canSplit(seat.player.splitCount) && seat.player.chips >= hand.bet,
          canSurrender: hand.canSurrender(),
          isFromSplit: hand.isFromSplit,
        });

        const snap = initial.get(seat.player.id);
        if (snap && snap.firstAction === 'none') snap.firstAction = action;

        try {
          this.invoke(round, seat.player.id, this.coerce(seat, hand, action));
        } catch {
          if (round.phase === 'playerAction') round.forceStand();
        }
      }

      // Round settled — record per-seat outcomes.
      for (let i = 0; i < active.length; i++) {
        const seat = active[i]!;
        const snap = initial.get(seat.player.id);
        let net = 0;
        for (const r of round.results) {
          if (r.playerId === seat.player.id) net += r.result.payout;
        }
        if (snap) {
          const bet = snap.bet;
          seat.stats.record({
            trueCount: Math.round(snap.tc * 10) / 10,
            tcBucket: tcBucket(snap.tc),
            playerSig: snap.sig,
            dealerUp: snap.dealerUp,
            firstAction: snap.firstAction,
            originalBet: bet,
            netPayout: net,
            unitEV: bet === 0 ? 0 : net / bet,
          });
        }
        seat.handsPlayed++;
        if (h % seat.minSampleStride === 0) seat.stats.sampleBankroll(seat.player.chips);
        seat.player.clearHands();
      }
      this.roundsPlayed++;
    }

    // Final bankroll sample for every seat.
    for (const seat of this.seats) seat.stats.sampleBankroll(seat.player.chips);

    return {
      perPlayer: this.seats.map(seat => {
        const ext = seat.stats.bankrollExtremes();
        return {
          seat: seat.player.seat,
          startingBankroll: seat.cfg.startingBankroll,
          finalBankroll: ext.final,
          minBankroll: ext.min,
          maxBankroll: ext.max,
          totalWagered: seat.stats.totalWagered,
          netResult: seat.stats.totalNet,
          handsPlayed: seat.handsPlayed,
          bust: seat.busted || seat.player.chips < seat.cfg.baseUnit,
          stats: seat.stats,
        };
      }),
      roundsPlayed: this.roundsPlayed,
      shoesUsed: this.shoeCount,
    };
  }

  private invoke(round: Round, pid: string, action: ReturnType<Strategy>): void {
    switch (action) {
      case 'hit':       round.hit(pid); break;
      case 'stand':     round.stand(pid); break;
      case 'double':    round.double(pid); break;
      case 'split':     round.split(pid); break;
      case 'surrender': round.surrender(pid); break;
    }
  }

  private coerce(
    seat: typeof this.seats[number],
    hand: import('../game/Hand.js').Hand,
    action: ReturnType<Strategy>,
  ): ReturnType<Strategy> {
    switch (action) {
      case 'double':
        if (!hand.canDouble() || seat.player.chips < hand.bet) return 'hit';
        return 'double';
      case 'split':
        if (!hand.canSplit(seat.player.splitCount) || seat.player.chips < hand.bet) {
          return 'hit';
        }
        return 'split';
      case 'surrender':
        if (!hand.canSurrender()) return 'hit';
        return 'surrender';
      default:
        return action;
    }
  }
}
