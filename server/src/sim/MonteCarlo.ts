import type { BetSizing } from './betSizing.js';
import { Simulator, type WongOutConfig } from './Simulator.js';
import type { Strategy } from './strategy.js';

export interface TrialResult {
  seed: number;
  /** True if the trial ended early because chips < baseUnit. */
  bust: boolean;
  /** How many hands actually played (= requested unless bust). */
  handsPlayed: number;
  startingBankroll: number;
  finalBankroll: number;
  /** Lowest bankroll snapshot during the trial (approx — sampled every K hands). */
  minBankroll: number;
  /** Highest bankroll snapshot during the trial. */
  maxBankroll: number;
  totalWagered: number;
  netResult: number;
  wongOuts: number;
}

export interface MonteCarloOptions {
  trials: number;
  handsPerTrial: number;
  seedBase: number;
  strategy: Strategy;
  betSizing: BetSizing;
  baseUnit: number;
  startingBankroll: number;
  wongOut?: WongOutConfig;
}

export type ProgressCallback = (done: number, total: number) => void;

/**
 * Runs the Simulator N times with distinct seeds and collects per-trial
 * outcomes. Each trial is independent (its own shoe, its own RNG stream).
 *
 * Pure-CPU, ~700k hands/sec single-threaded; 1k trials × 10k hands ≈ 15s.
 */
export class MonteCarloRunner {
  constructor(private readonly opts: MonteCarloOptions) {}

  run(onProgress?: ProgressCallback): TrialResult[] {
    const out: TrialResult[] = [];
    for (let i = 0; i < this.opts.trials; i++) {
      const seed = this.opts.seedBase + i;
      const sim = new Simulator({
        hands: this.opts.handsPerTrial,
        seed,
        strategy: this.opts.strategy,
        betSizing: this.opts.betSizing,
        baseUnit: this.opts.baseUnit,
        startingBankroll: this.opts.startingBankroll,
        wongOut: this.opts.wongOut,
      });
      const r = sim.run();
      const ext = r.stats.bankrollExtremes();
      // A trial is "bust" if we left the table because chips fell below table-min.
      // Wong-out-skipped hands don't count toward played hands, so we use
      // played + wong-skipped vs target to decide.
      const totalAttempted = r.handsPlayed + r.wongOutHandsSkipped;
      const bust = totalAttempted < this.opts.handsPerTrial;
      out.push({
        seed,
        bust,
        handsPlayed: r.handsPlayed,
        startingBankroll: this.opts.startingBankroll,
        finalBankroll: ext.final,
        minBankroll: ext.min,
        maxBankroll: ext.max,
        totalWagered: r.stats.totalWagered,
        netResult: r.stats.totalNet,
        wongOuts: r.wongOuts,
      });
      if (onProgress && ((i + 1) % 25 === 0 || i + 1 === this.opts.trials)) {
        onProgress(i + 1, this.opts.trials);
      }
    }
    return out;
  }
}

// ---------- aggregation helpers ----------

export interface MonteCarloSummary {
  trials: number;
  bustCount: number;
  bustRate: number;
  bustHandsMedian: number | null;
  survivorFinalPercentiles: Record<string, number>;
  survivorMeanFinal: number;
  survivorMeanProfit: number;
  worstFinalAcrossAll: number;
  bestFinalAcrossAll: number;
  /** Median max-drawdown across all trials (starting - minBankroll). */
  medianMaxDrawdown: number;
  worstMaxDrawdown: number;
  /** Avg dollar-weighted return across all trials. */
  avgReturnPct: number;
}

export function summarize(results: TrialResult[]): MonteCarloSummary {
  const trials = results.length;
  const busts = results.filter(r => r.bust);
  const survivors = results.filter(r => !r.bust);

  const bustHands = busts.map(r => r.handsPlayed).sort((a, b) => a - b);
  const bustHandsMedian = bustHands.length === 0
    ? null
    : bustHands[Math.floor(bustHands.length / 2)] ?? null;

  const survFinals = survivors.map(r => r.finalBankroll).sort((a, b) => a - b);
  const pct = (p: number): number => {
    if (survFinals.length === 0) return 0;
    const idx = Math.min(survFinals.length - 1, Math.max(0, Math.floor((p / 100) * survFinals.length)));
    return survFinals[idx]!;
  };

  const drawdowns = results.map(r => r.startingBankroll - r.minBankroll).sort((a, b) => a - b);
  const median = (arr: number[]) =>
    arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)]!;

  const allFinals = results.map(r => r.finalBankroll);
  const allWagered = results.reduce((s, r) => s + r.totalWagered, 0);
  const allNet = results.reduce((s, r) => s + r.netResult, 0);

  return {
    trials,
    bustCount: busts.length,
    bustRate: busts.length / trials,
    bustHandsMedian,
    survivorFinalPercentiles: {
      p1: pct(1), p5: pct(5), p10: pct(10),
      p25: pct(25), p50: pct(50), p75: pct(75),
      p90: pct(90), p95: pct(95), p99: pct(99),
    },
    survivorMeanFinal: survivors.length === 0
      ? 0
      : survivors.reduce((s, r) => s + r.finalBankroll, 0) / survivors.length,
    survivorMeanProfit: survivors.length === 0
      ? 0
      : survivors.reduce((s, r) => s + (r.finalBankroll - r.startingBankroll), 0) / survivors.length,
    worstFinalAcrossAll: Math.min(...allFinals),
    bestFinalAcrossAll: Math.max(...allFinals),
    medianMaxDrawdown: median(drawdowns),
    worstMaxDrawdown: Math.max(...drawdowns),
    avgReturnPct: allWagered === 0 ? 0 : (allNet / allWagered) * 100,
  };
}
