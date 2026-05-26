import { writeFileSync } from 'node:fs';
import { BET_SIZINGS } from './betSizing.js';
import { type TrialResult, summarize } from './MonteCarlo.js';
import { MultiPlayerSimulator } from './MultiPlayerSimulator.js';
import { STRATEGIES } from './strategies.js';

interface Args {
  trials: number;
  hands: number;
  seed: number;
  players: number;
  strategy: keyof typeof STRATEGIES;
  bet: keyof typeof BET_SIZINGS;
  baseUnit: number;
  bankroll: number;
  outJson?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    trials: 1000,
    hands: 10_000,
    seed: 1000,
    players: 3,
    strategy: 'basic',
    bet: 'spread',
    baseUnit: 25,
    bankroll: 10_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? '';
    switch (a) {
      case '--trials':   out.trials = Number(next()); break;
      case '--hands':    out.hands = Number(next()); break;
      case '--seed':     out.seed = Number(next()); break;
      case '--players':  out.players = Number(next()); break;
      case '--strategy': out.strategy = next() as Args['strategy']; break;
      case '--bet':      out.bet = next() as Args['bet']; break;
      case '--unit':     out.baseUnit = Number(next()); break;
      case '--bankroll': out.bankroll = Number(next()); break;
      case '--json':     out.outJson = next(); break;
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
  if (out.players < 1 || out.players > 7) {
    console.error('--players must be 1..7');
    process.exit(1);
  }
  return out;
}

function printHelp(): void {
  console.log(`
Multi-player Monte Carlo — N seats share one shoe, every seat plays
basic strategy with the chosen bet sizing. Shows per-seat bust rates,
profit distributions and the EV-per-hand vs solo-table comparison.

Usage:
  npm run mc-mp -- [flags]

Flags:
  --players N      seats at the table (default 3, max 7)
  --trials N       independent trials, each a fresh shoe (default 1000)
  --hands N        ROUNDS per trial — every seat plays this many (default 10000)
  --bankroll N     starting bankroll per seat (default 10000)
  --unit N         table minimum per seat (default 25)
  --strategy NAME  ${Object.keys(STRATEGIES).join(' | ')}   (default basic)
  --bet NAME       ${Object.keys(BET_SIZINGS).join(' | ')}    (default spread)
  --seed N         base seed; trial i uses seed+i (default 1000)
  --json PATH      write all trial results to PATH

Example:
  npm run mc-mp -- --players 3
  npm run mc-mp -- --players 1   # solo baseline
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const strat = STRATEGIES[args.strategy];
  const bet = BET_SIZINGS[args.bet];
  if (!strat || !bet) {
    console.error('Unknown strategy or bet sizing.');
    process.exit(1);
  }

  // Collect TrialResult-per-seat: trialsBySeat[seatIdx] = TrialResult[]
  const trialsBySeat: TrialResult[][] = Array.from(
    { length: args.players },
    () => [],
  );
  let totalRoundsPlayed = 0;
  let totalShoesUsed = 0;

  const started = Date.now();
  let lastPrinted = 0;
  for (let i = 0; i < args.trials; i++) {
    const seed = args.seed + i;
    const sim = new MultiPlayerSimulator({
      hands: args.hands,
      seed,
      players: Array.from({ length: args.players }, () => ({
        strategy: strat,
        betSizing: bet,
        baseUnit: args.baseUnit,
        startingBankroll: args.bankroll,
      })),
    });
    const res = sim.run();
    totalRoundsPlayed += res.roundsPlayed;
    totalShoesUsed += res.shoesUsed;
    for (let s = 0; s < args.players; s++) {
      const r = res.perPlayer[s]!;
      trialsBySeat[s]!.push({
        seed,
        bust: r.bust,
        handsPlayed: r.handsPlayed,
        startingBankroll: r.startingBankroll,
        finalBankroll: r.finalBankroll,
        minBankroll: r.minBankroll,
        maxBankroll: r.maxBankroll,
        totalWagered: r.totalWagered,
        netResult: r.netResult,
        wongOuts: 0,
      });
    }
    const now = Date.now();
    if (now - lastPrinted > 500 || i + 1 === args.trials) {
      const pct = (((i + 1) / args.trials) * 100).toFixed(0);
      process.stderr.write(`\r  running … ${i + 1}/${args.trials} (${pct}%)`);
      lastPrinted = now;
    }
  }
  const elapsed = Date.now() - started;
  process.stderr.write('\r' + ' '.repeat(50) + '\r');

  const summaries = trialsBySeat.map(summarize);
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('              MULTI-PLAYER MONTE CARLO  (shared shoe)');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push(`  Seats at table:       ${args.players}`);
  lines.push(`  Strategy / bet:       ${args.strategy} + ${args.bet}`);
  lines.push(`  Bankroll per seat:    ${fmtMoney(args.bankroll)} (${(args.bankroll / args.baseUnit).toFixed(0)} units)`);
  lines.push(`  Rounds per trial:     ${args.hands.toLocaleString('en-US')}  (each seat plays them all)`);
  lines.push(`  Trials:               ${args.trials.toLocaleString('en-US')}`);
  lines.push(`  Avg shoes per trial:  ${(totalShoesUsed / args.trials).toFixed(1)}`);
  lines.push(`  Avg rounds per shoe:  ${(totalRoundsPlayed / totalShoesUsed).toFixed(1)}`);
  lines.push('');

  // Per-seat table.
  lines.push('── Per-seat outcomes ───────────────────────────────────────');
  lines.push('  seat | bust % | med final |   p10     |   p90     | avg ret %');
  lines.push('  -----+--------+-----------+-----------+-----------+----------');
  for (let s = 0; s < args.players; s++) {
    const sum = summaries[s]!;
    const p = sum.survivorFinalPercentiles;
    lines.push(
      `   ${pad(String(s + 1), 4)}| ` +
      `${pad((sum.bustRate * 100).toFixed(1) + '%', 7, 'r')}| ` +
      `${pad(fmtMoney(p.p50!), 10, 'r')}| ` +
      `${pad(fmtMoney(p.p10!), 10, 'r')}| ` +
      `${pad(fmtMoney(p.p90!), 10, 'r')}| ` +
      `${pad(fmtPct(sum.avgReturnPct, 3), 9, 'r')}`,
    );
  }

  // Aggregate over ALL seats (treat each seat-trial as one observation).
  const allTrials: TrialResult[] = trialsBySeat.flat();
  const aggregate = summarize(allTrials);
  lines.push('');
  lines.push('── Aggregate (all seats pooled) ────────────────────────────');
  lines.push(`  Total observations:   ${aggregate.trials.toLocaleString('en-US')} (seats × trials)`);
  lines.push(`  Combined bust rate:   ${(aggregate.bustRate * 100).toFixed(2)}%`);
  lines.push(`  Avg return:           ${fmtPct(aggregate.avgReturnPct, 3)}  (dollar-weighted)`);
  lines.push(`  Median final per seat:${pad(fmtMoney(aggregate.survivorFinalPercentiles.p50!), 12, 'r')}`);
  lines.push(`  Median max drawdown:  ${fmtMoney(aggregate.medianMaxDrawdown)}`);
  lines.push(`  Worst max drawdown:   ${fmtMoney(aggregate.worstMaxDrawdown)}`);

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════');
  console.log(lines.join('\n'));

  const totalHandsSimulated = totalRoundsPlayed * args.players;
  console.log(`\n  (${(elapsed / 1000).toFixed(1)}s, ` +
              `${(totalHandsSimulated / (elapsed / 1000) / 1000).toFixed(0)}k seat-hands/sec)`);

  if (args.outJson) {
    writeFileSync(args.outJson, JSON.stringify({
      args, perSeat: summaries, aggregate, totalRoundsPlayed, totalShoesUsed,
    }, null, 2));
    console.log(`\n  Summary written to ${args.outJson}`);
  }
}

main();
