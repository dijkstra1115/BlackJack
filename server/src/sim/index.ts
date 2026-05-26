import { writeFileSync } from 'node:fs';
import { BET_SIZINGS } from './betSizing.js';
import { formatReport, toJSON } from './report.js';
import { Simulator } from './Simulator.js';
import { STRATEGIES } from './strategies.js';

interface Args {
  hands: number;
  seed: number;
  strategy: keyof typeof STRATEGIES;
  bet: keyof typeof BET_SIZINGS;
  baseUnit: number;
  startingBankroll: number;
  outJson?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    hands: 100_000,
    seed: 20260526,
    strategy: 'basic',
    bet: 'flat',
    baseUnit: 25,
    startingBankroll: 1_000_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? '';
    switch (a) {
      case '--hands':            out.hands = Number(next()); break;
      case '--seed':             out.seed = Number(next()); break;
      case '--strategy':         out.strategy = next() as Args['strategy']; break;
      case '--bet':              out.bet = next() as Args['bet']; break;
      case '--unit':             out.baseUnit = Number(next()); break;
      case '--bankroll':         out.startingBankroll = Number(next()); break;
      case '--json':             out.outJson = next(); break;
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
  if (!STRATEGIES[out.strategy]) {
    console.error(`Unknown strategy "${out.strategy}". Choices: ${Object.keys(STRATEGIES).join(', ')}`);
    process.exit(1);
  }
  if (!BET_SIZINGS[out.bet]) {
    console.error(`Unknown bet sizing "${out.bet}". Choices: ${Object.keys(BET_SIZINGS).join(', ')}`);
    process.exit(1);
  }
  return out;
}

function printHelp(): void {
  console.log(`
Blackjack simulator — drives the pure domain layer at full speed.

Usage:
  npm run sim -- [flags]

Flags:
  --hands N           number of hands to play (default 100000)
  --seed N            RNG seed (default 20260526) — same seed → same shoe
  --strategy NAME     ${Object.keys(STRATEGIES).join(' | ')}   (default basic)
  --bet NAME          ${Object.keys(BET_SIZINGS).join(' | ')}   (default flat)
  --unit N            base bet unit (default 25)
  --bankroll N        starting bankroll (default 1000000)
  --json PATH         also write full stats as JSON to PATH

Examples:
  npm run sim
  npm run sim -- --hands 200000 --strategy basic --bet spread
  npm run sim -- --strategy mimic --json out.json
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ctx = {
    strategyName: args.strategy,
    betSizingName: args.bet,
    baseUnit: args.baseUnit,
    seed: args.seed,
    startingBankroll: args.startingBankroll,
  };
  const started = Date.now();
  const sim = new Simulator({
    hands: args.hands,
    seed: args.seed,
    strategy: STRATEGIES[args.strategy]!,
    betSizing: BET_SIZINGS[args.bet]!,
    baseUnit: args.baseUnit,
    startingBankroll: args.startingBankroll,
  });
  const res = sim.run();
  const elapsed = Date.now() - started;

  console.log(formatReport(res, ctx));
  console.log(`\n  (simulation took ${elapsed} ms, ` +
              `${(res.handsPlayed / (elapsed / 1000)).toFixed(0)} hands/sec)`);

  if (args.outJson) {
    writeFileSync(args.outJson, toJSON(res, ctx));
    console.log(`\n  Full stats written to ${args.outJson}`);
  }
}

main();
