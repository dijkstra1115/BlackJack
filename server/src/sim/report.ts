import type { SimulationResult } from './Simulator.js';

const fmtMoney = (n: number, decimals = 0): string => {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

const fmtPct = (n: number, decimals = 3): string => {
  const s = n.toFixed(decimals);
  return (n >= 0 ? '+' : '') + s + '%';
};

const fmtSignedNum = (n: number, decimals = 4): string => {
  const s = n.toFixed(decimals);
  return n >= 0 ? '+' + s : s;
};

const pad = (s: string, w: number, align: 'l' | 'r' = 'l'): string => {
  if (s.length >= w) return s;
  const fill = ' '.repeat(w - s.length);
  return align === 'l' ? s + fill : fill + s;
};

export interface ReportContext {
  strategyName: string;
  betSizingName: string;
  baseUnit: number;
  seed: number;
  startingBankroll: number;
}

export function formatReport(res: SimulationResult, ctx: ReportContext): string {
  const s = res.stats;
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                     BLACKJACK SIMULATION REPORT');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push(`  Strategy:        ${ctx.strategyName}`);
  lines.push(`  Bet sizing:      ${ctx.betSizingName}  (unit = ${fmtMoney(ctx.baseUnit)})`);
  lines.push(`  Seed:            ${ctx.seed}`);
  lines.push(`  Hands played:    ${s.totalHands.toLocaleString('en-US')}`);
  lines.push(`  Shoes used:      ${res.shoesUsed.toLocaleString('en-US')}`);
  lines.push(`  Avg hands/shoe:  ${(s.totalHands / res.shoesUsed).toFixed(1)}`);
  lines.push('');
  lines.push('── Headline ──────────────────────────────────────────────────');
  lines.push(`  Total wagered:   ${pad(fmtMoney(s.totalWagered), 16, 'r')}`);
  lines.push(`  Net result:      ${pad(fmtMoney(s.totalNet), 16, 'r')}`);
  lines.push(`  Return on wager: ${pad(fmtPct(s.returnPct), 16, 'r')}  (dollar-weighted)`);
  lines.push(`  Avg per-hand EV: ${pad(fmtPct(s.unitEvMean * 100), 16, 'r')}  ` +
             `(unweighted, % of own bet)`);
  lines.push(`  Std-dev/hand:    ${pad(s.unitEvStdDev.toFixed(3), 16, 'r')}  units of own bet`);
  const ev = s.bankrollExtremes();
  lines.push(`  Bankroll min:    ${pad(fmtMoney(ev.min), 16, 'r')}`);
  lines.push(`  Bankroll max:    ${pad(fmtMoney(ev.max), 16, 'r')}`);
  lines.push(`  Bankroll final:  ${pad(fmtMoney(ev.final), 16, 'r')}`);

  // ── Action mix ─────────────────────────────────────────────────────
  lines.push('');
  lines.push('── Initial-action mix ────────────────────────────────────────');
  const mix = s.actionMix;
  const actionOrder = ['hit', 'stand', 'double', 'split', 'surrender', 'none'];
  for (const k of actionOrder) {
    const v = mix[k];
    if (!v) continue;
    lines.push(`  ${pad(k, 11)} ${pad(v.count.toLocaleString('en-US'), 8, 'r')}   ` +
               `${pad(v.pct.toFixed(2) + '%', 7, 'r')}`);
  }

  // ── By true count ──────────────────────────────────────────────────
  lines.push('');
  lines.push('── EV by true count (decision-time) ──────────────────────────');
  lines.push('  TC   |     hands |       wagered |          net |    EV/unit');
  lines.push('  -----+-----------+---------------+--------------+-----------');
  for (const row of s.tcTable()) {
    lines.push(
      `  ${pad(row.tc, 4)} | ` +
      `${pad(row.hands.toLocaleString('en-US'), 9, 'r')} | ` +
      `${pad(fmtMoney(row.wagered), 13, 'r')} | ` +
      `${pad(fmtMoney(row.net), 12, 'r')} | ` +
      `${pad(fmtSignedNum(row.unitEv, 4), 9, 'r')}`,
    );
  }

  // ── Worst matchups ─────────────────────────────────────────────────
  lines.push('');
  lines.push('── Toughest initial matchups (you play correctly and still bleed) ──');
  lines.push('  player  | dealer |   hands |  EV/unit |       net');
  lines.push('  --------+--------+---------+----------+-----------');
  for (const row of s.topMatchups(10, 'worst', 200)) {
    const [player, dealer] = row.key.split('|');
    lines.push(
      `  ${pad(player!, 8)}|${pad(' ' + dealer!, 8)}|` +
      `${pad(row.hands.toLocaleString('en-US'), 9, 'r')}|` +
      `${pad(fmtSignedNum(row.unitEv, 4), 10, 'r')}|` +
      `${pad(fmtMoney(row.net), 11, 'r')}`,
    );
  }

  // ── Best matchups (excluding natural BJ which is always +1.5) ─────
  lines.push('');
  lines.push('── Best initial matchups, excluding natural BJ ───────────────');
  lines.push('  player  | dealer |   hands |  EV/unit |       net');
  lines.push('  --------+--------+---------+----------+-----------');
  const allBest = s.topMatchups(40, 'best', 200).filter(r => !r.key.startsWith('A,10|'));
  for (const row of allBest.slice(0, 10)) {
    const [player, dealer] = row.key.split('|');
    lines.push(
      `  ${pad(player!, 8)}|${pad(' ' + dealer!, 8)}|` +
      `${pad(row.hands.toLocaleString('en-US'), 9, 'r')}|` +
      `${pad(fmtSignedNum(row.unitEv, 4), 10, 'r')}|` +
      `${pad(fmtMoney(row.net), 11, 'r')}`,
    );
  }

  // ── Best decisions ─────────────────────────────────────────────────
  lines.push('');
  lines.push('── Highest-EV first decisions (matchup × action, decisions only) ──');
  lines.push('  player  | dealer | action     |   hands |  EV/unit');
  lines.push('  --------+--------+------------+---------+----------');
  for (const row of s.topActions(12, 'best', 150, false)) {
    const [player, dealer, action] = row.key.split('|');
    lines.push(
      `  ${pad(player!, 8)}|${pad(' ' + dealer!, 8)}| ` +
      `${pad(action!, 10)} |` +
      `${pad(row.hands.toLocaleString('en-US'), 9, 'r')}|` +
      `${pad(fmtSignedNum(row.unitEv, 4), 10, 'r')}`,
    );
  }

  lines.push('');
  lines.push('── Lowest-EV first decisions (decisions only) ────────────────');
  lines.push('  player  | dealer | action     |   hands |  EV/unit');
  lines.push('  --------+--------+------------+---------+----------');
  for (const row of s.topActions(12, 'worst', 150, false)) {
    const [player, dealer, action] = row.key.split('|');
    lines.push(
      `  ${pad(player!, 8)}|${pad(' ' + dealer!, 8)}| ` +
      `${pad(action!, 10)} |` +
      `${pad(row.hands.toLocaleString('en-US'), 9, 'r')}|` +
      `${pad(fmtSignedNum(row.unitEv, 4), 10, 'r')}`,
    );
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

/** Slim JSON export — for further analysis in a notebook or spreadsheet. */
export function toJSON(res: SimulationResult, ctx: ReportContext): string {
  const s = res.stats;
  return JSON.stringify({
    context: ctx,
    summary: {
      hands: s.totalHands,
      shoesUsed: res.shoesUsed,
      totalWagered: s.totalWagered,
      totalNet: s.totalNet,
      returnPct: s.returnPct,
      unitEvMean: s.unitEvMean,
      unitEvStdDev: s.unitEvStdDev,
      bankroll: s.bankrollExtremes(),
    },
    actionMix: s.actionMix,
    byTrueCount: s.tcTable(),
    worstMatchups: s.topMatchups(20, 'worst', 100),
    bestMatchups: s.topMatchups(20, 'best', 100),
    worstActions: s.topActions(30, 'worst', 100),
    bestActions: s.topActions(30, 'best', 100),
    bankrollSamples: s.bankrollSamples,
  }, null, 2);
}
