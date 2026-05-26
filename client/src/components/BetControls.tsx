import type { PlayerView } from '@blackjack/shared';
import { useState } from 'react';

interface Props {
  me: PlayerView | null;
  isHost: boolean;
  canStart: boolean;
  onPlaceBet: (amount: number) => void;
  onStartRound: () => void;
}

const QUICK_BETS = [10, 25, 50, 100, 250];

/**
 * Bet input + quick-select chips. Shown during the betting phase. The bet
 * amount stays in local state so re-betting (overwriting an earlier bet
 * before the round starts) feels snappy.
 */
export function BetControls({ me, isHost, canStart, onPlaceBet, onStartRound }: Props) {
  const [amount, setAmount] = useState(25);

  if (!me) return null;
  const max = me.chips + (me.hasBet ? (me.hands[0]?.bet ?? 0) : 0);

  return (
    <div className="bg-felt-800/70 border border-emerald-700 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-emerald-200 text-sm">下注：</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
          min={1}
          max={max}
          step={5}
          className="bg-felt-900 border border-emerald-700 rounded px-3 py-1.5 w-28 font-mono text-right
            focus:outline-none focus:border-chip-gold"
        />
        <button
          className="btn-primary"
          disabled={amount <= 0 || amount > max}
          onClick={() => onPlaceBet(amount)}
        >
          {me.hasBet ? '更改下注' : '下注'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_BETS.map((b) => (
          <button
            key={b}
            className="px-2.5 py-1 rounded bg-felt-900 border border-emerald-700 text-sm
              hover:bg-felt-700 disabled:opacity-30"
            disabled={b > max}
            onClick={() => setAmount(b)}
          >
            +{b}
          </button>
        ))}
        <button
          className="px-2.5 py-1 rounded bg-felt-900 border border-emerald-700 text-sm hover:bg-felt-700"
          onClick={() => setAmount(Math.min(max, Math.floor(max / 2)))}
        >
          ½
        </button>
        <button
          className="px-2.5 py-1 rounded bg-felt-900 border border-emerald-700 text-sm hover:bg-felt-700"
          onClick={() => setAmount(max)}
        >
          MAX
        </button>
      </div>
      {isHost && (
        <button
          className="btn-primary mt-2 disabled:opacity-50"
          disabled={!canStart}
          onClick={onStartRound}
        >
          開始發牌
        </button>
      )}
      {!isHost && (
        <div className="text-xs text-emerald-300 italic">
          {me.hasBet ? '已下注 — 等待房主開局' : '尚未下注'}
        </div>
      )}
    </div>
  );
}
