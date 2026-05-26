import type { PlayerView, RoomState } from '@blackjack/shared';
import { CardView } from './CardView.js';

interface Props {
  seatNumber: number;
  player: PlayerView | null;
  isMe: boolean;
  isMyTurnSeat: boolean;
  canSit: boolean;
  onSit: () => void;
  /** Hand-level result info from lastResults, keyed per hand index. */
  resultsByHandIndex?: Map<number, { outcome: string; payout: number }>;
}

export function Seat({
  seatNumber,
  player,
  isMe,
  isMyTurnSeat,
  canSit,
  onSit,
  resultsByHandIndex,
}: Props) {
  if (!player) {
    return (
      <div className="flex flex-col items-center">
        <div className="text-xs text-emerald-400 mb-1">座位 {seatNumber}</div>
        <button
          className="btn-secondary w-32 h-32 flex items-center justify-center text-emerald-300"
          disabled={!canSit}
          onClick={onSit}
        >
          {canSit ? '坐這' : '— 空位 —'}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center rounded-lg p-2 transition-shadow ${
        isMyTurnSeat ? 'ring-2 ring-chip-gold shadow-lg shadow-chip-gold/30' : ''
      } ${isMe ? 'bg-emerald-950/70' : 'bg-felt-800/40'}`}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs text-emerald-400">座位 {seatNumber}</span>
        <span className={`text-sm font-semibold ${isMe ? 'text-chip-gold' : 'text-white'}`}>
          {player.name}
          {isMe && <span className="ml-1 text-xs text-emerald-300">(你)</span>}
        </span>
      </div>
      <div className="text-sm font-mono text-emerald-200">
        ${player.chips}
        {player.hasBet && player.hands[0] && (
          <span className="ml-2 text-chip-gold">下注 ${player.hands[0].bet}</span>
        )}
      </div>
      {player.hands.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 items-center">
          {player.hands.map((h, idx) => {
            const isActive = idx === player.currentHandIndex;
            const result = resultsByHandIndex?.get(idx);
            return (
              <div
                key={idx}
                className={`flex flex-col items-center px-1.5 py-1 rounded ${
                  isActive && isMyTurnSeat ? 'bg-chip-gold/10' : ''
                }`}
              >
                <div className="flex gap-1">
                  {h.cards.map((c, i) => (
                    <CardView key={i} card={c} size="sm" />
                  ))}
                </div>
                <div className="text-xs font-mono mt-1">
                  <span className={h.isBust ? 'text-red-400' : 'text-white'}>
                    {h.isSoft ? `${h.total - 10}/${h.total}` : h.total}
                  </span>
                  {h.isBlackjack && <span className="ml-1 text-chip-gold">BJ</span>}
                  {h.isBust && <span className="ml-1 text-red-400">BUST</span>}
                  {h.hasDoubled && <span className="ml-1 text-amber-300">×2</span>}
                  {h.hasSurrendered && <span className="ml-1 text-stone-400">投降</span>}
                </div>
                {result && (
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      result.payout > 0
                        ? 'text-emerald-300'
                        : result.payout < 0
                          ? 'text-red-400'
                          : 'text-stone-300'
                    }`}
                  >
                    {result.outcome.toUpperCase()} {result.payout > 0 ? '+' : ''}
                    {result.payout}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function buildResultsLookup(state: RoomState): Map<string, Map<number, { outcome: string; payout: number }>> {
  const out = new Map<string, Map<number, { outcome: string; payout: number }>>();
  for (const r of state.lastResults) {
    let m = out.get(r.playerId);
    if (!m) {
      m = new Map();
      out.set(r.playerId, m);
    }
    m.set(r.handIndex, { outcome: r.outcome, payout: r.payout });
  }
  return out;
}
