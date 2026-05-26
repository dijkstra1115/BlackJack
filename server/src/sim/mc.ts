import { writeFileSync } from 'node:fs';
import { BET_SIZINGS } from './betSizing.js';
import {
  MonteCarloRunner,
  summarize,
  type MonteCarloSummary,
  type TrialResult,
} from './MonteCarlo.js';
import { STRATEGIES } from './strategies.js';

interface Args {
  trials: number;
  hands: number;
  seed: number;
  strategy: keyof typeof STRATEGIES;
  bet: keyof typeof BET_SIZINGS;
  baseUnit: number;
  bankroll: number;
  wong: boolean;
  wongTc: number;
  wongDecks: number;
  outJson?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    trials: 1000,
    hands: 10_000,
    seed: 1000,
    strategy: 'basic',
    bet: 'spread',
    baseUnit: 25,
    bankroll: 10_000,
    wong: false,
    wongTc: -1,
    wongDecks: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? '';
    switch (a) {
      case '--trials':    out.trials = Number(next()); break;
      case '--hands':     out.hands = Number(next()); break;
      case '--seed':      out.seed = Number(next()); break;
      case '--strategy':  out.strategy = next() as Args['strategy']; break;
      case '--bet':       out.bet = next() as Args['bet']; break;
      case '--unit':      out.baseUnit = Number(next()); break;
      case '--bankroll':  out.bankroll = Number(next()); break;
      case '--wong':      out.wong = true; break;
      case '--wong-tc':   out.wongTc = Number(next()); out.wong = true; break;
      case '--wong-decks':out.wongDecks = Number(next()); out.wong = true; break;
      case '--json':      out.outJson = next(); break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown flag: ${a}`);
        printHelp();
        process.exit(1);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
Monte Carlo bankroll simulator — runs N independent trials with distinct
seeds and reports how often the player goes broke before hitting the
target hand count.

Usage:
  npm run mc -- [flags]

Flags:
  --trials N       number of independent trials (default 1000)
  --hands N        hands per trial (default 10000)
  --bankroll N     starting bankroll (default 10000)
  --unit N         base bet unit / table minimum (default 25)
  --strategy NAME  ${Object.keys(STRATEGIES).join(' | ')}   (default basic)
  --bet NAME       ${Object.keys(BET_SIZINGS).join(' | ')}   (default spread)
  --seed N         base seed; trial i uses seed+i (default 1000)
  --wong           enable Wong-out (walk away mid-shoe when count goes south)
  --wong-tc N      Wong-out trigger TC threshold (default -1; implies --wong)
  --wong-decks N   only Wong-out when ≤ this many decks remain (default 2)
  --json PATH      write all trial-level results as JSON

Examples:
  npm run mc
  npm run mc -- --bet spread15 --wong
  npm run mc -- --bet spread15 --wong --wong-tc 0 --wong-decks 3
  npm run mc -- --strategy i18 --bet spread --bankroll 20000
`);
}

function fmtMoney(n: number, decimals = 0): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtPct(n: number, decimals = 2): string {
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%';
}

function pad(s: string, w: number, align: 'l' | 'r' = 'l'): string {
  if (s.length >= w) return s;
  const fill = ' '.repeat(w - s.length);
  return align === 'l' ? s + fill : fill + s;
}

/**
 * Quick ASCII histogram of final bankroll across all trials. 12 buckets
 * spanning min..max, bars scaled to the bucket with the most trials.
 */
function histogram(results: TrialResult[], buckets = 12): string {
  if (results.length === 0) return '';
  const finals = results.map(r => r.finalBankroll);
  const min = Math.min(...finals);
  const max = Math.max(...finals);
  const range = Math.max(1, max - min);
  const step = range / buckets;
  const counts = new Array(buckets).fill(0) as number[];
  for (const v of finals) {
    let i = Math.floor((v - min) / step);
    if (i >= buckets) i = buckets - 1;
    counts[i]!++;
  }
  const maxCount = Math.max(...counts);
  const lines: string[] = [];
  for (let i = 0; i < buckets; i++) {
    const lo = min + step * i;
    const hi = min + step * (i + 1);
    const barLen = Math.round((counts[i]! / maxCount) * 40);
    const bar = '█'.repeat(barLen);
    lines.push(
      `  ${pad(fmtMoney(lo), 10, 'r')} → ${pad(fmtMoney(hi), 10, 'r')}  ` +
      `${pad(bar, 40)} ${counts[i]}`,
    );
  }
  return lines.join('\n');
}

function formatSummary(s: MonteCarloSummary, args: Args, results: TrialResult[]): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('              MONTE CARLO BANKROLL / RUIN SIMULATION');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push(`  Strategy:           ${args.strategy} + ${args.bet}` +
             (args.wong ? `  +Wong-out(TC≤${args.wongTc}, decks≤${args.wongDecks})` : ''));
  lines.push(`  Bet unit (table min): ${fmtMoney(args.baseUnit)}`);
  lines.push(`  Starting bankroll:    ${fmtMoney(args.bankroll)}  ` +
             `(${(args.bankroll / args.baseUnit).toFixed(0)} units)`);
  lines.push(`  Hands per trial:      ${args.hands.toLocaleString('en-US')}`);
  lines.push(`  Trials:               ${args.trials.toLocaleString('en-US')}`);
  if (args.wong) {
    const totalWongs = results.reduce((s, r) => s + r.wongOuts, 0);
    lines.push(`  Avg Wong-outs/trial:  ${(totalWongs / results.length).toFixed(1)}`);
  }
  lines.push('');
  lines.push('── Bankruptcy ──────────────────────────────────────────');
  lines.push(`  Went broke:           ${pad(`${s.bustCount} / ${s.trials}`, 12, 'r')}  ` +
             `(${(s.bustRate * 100).toFixed(2)}%)`);
  if (s.bustHandsMedian !== null) {
    lines.push(`  Median hands until bust: ${s.bustHandsMedian.toLocaleString('en-US')}`);
  }
  lines.push('');
  lines.push('── Final bankroll across all trials ───────────────────');
  lines.push(`  Worst:                ${pad(fmtMoney(s.worstFinalAcrossAll), 12, 'r')}`);
  lines.push(`  Best:                 ${pad(fmtMoney(s.bestFinalAcrossAll), 12, 'r')}`);
  lines.push(`  Avg return:           ${pad(fmtPct(s.avgReturnPct, 3), 12, 'r')}  (dollar-weighted)`);
  lines.push('');
  lines.push('── Survivors only — final bankroll percentiles ─────────');
  const p = s.survivorFinalPercentiles;
  lines.push(`  p1   ${pad(fmtMoney(p.p1!), 10, 'r')}     p50 (median) ${pad(fmtMoney(p.p50!), 10, 'r')}`);
  lines.push(`  p5   ${pad(fmtMoney(p.p5!), 10, 'r')}     p75          ${pad(fmtMoney(p.p75!), 10, 'r')}`);
  lines.push(`  p10  ${pad(fmtMoney(p.p10!), 10, 'r')}     p90          ${pad(fmtMoney(p.p90!), 10, 'r')}`);
  lines.push(`  p25  ${pad(fmtMoney(p.p25!), 10, 'r')}     p99          ${pad(fmtMoney(p.p99!), 10, 'r')}`);
  lines.push(`  Mean final:           ${pad(fmtMoney(s.survivorMeanFinal), 12, 'r')}`);
  lines.push(`  Mean profit:          ${pad(fmtMoney(s.survivorMeanProfit), 12, 'r')}`);
  lines.push('');
  lines.push('── Drawdown ────────────────────────────────────────────');
  lines.push(`  Median max DD:        ${pad(fmtMoney(s.medianMaxDrawdown), 12, 'r')}`);
  lines.push(`  Worst max DD:         ${pad(fmtMoney(s.worstMaxDrawdown), 12, 'r')}`);
  lines.push('');
  lines.push('── Final-bankroll distribution ─────────────────────────');
  lines.push(histogram(results));
  lines.push('═══════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const strat = STRATEGIES[args.strategy];
  const bet = BET_SIZINGS[args.bet];
  if (!strat || !bet) {
    console.error('Unknown strategy or bet sizing.');
    process.exit(1);
  }
  const runner = new MonteCarloRunner({
    trials: args.trials,
    handsPerTrial: args.hands,
    seedBase: args.seed,
    strategy: strat,
    betSizing: bet,
    baseUnit: args.baseUnit,
    startingBankroll: args.bankroll,
    wongOut: args.wong
      ? { tcThreshold: args.wongTc, remainingDecksThreshold: args.wongDecks }
      : undefined,
  });

  const started = Date.now();
  let lastPrinted = 0;
  const results = runner.run((done, total) => {
    const now = Date.now();
    if (now - lastPrinted > 500 || done === total) {
      const pct = ((done / total) * 100).toFixed(0);
      process.stderr.write(`\r  running … ${done}/${total} (${pct}%)`);
      lastPrinted = now;
    }
  });
  const elapsed = Date.now() - started;
  process.stderr.write('\r' + ' '.repeat(50) + '\r'); // clear progress line

  const summary = summarize(results);
  console.log(formatSummary(summary, args, results));
  console.log(`\n  (${(elapsed / 1000).toFixed(1)}s, ` +
              `${((args.trials * args.hands) / (elapsed / 1000) / 1000).toFixed(0)}k hands/sec)`);

  if (args.outJson) {
    writeFileSync(args.outJson, JSON.stringify({ summary, results }, null, 2));
    console.log(`\n  Per-trial results written to ${args.outJson}`);
  }
}

main();
