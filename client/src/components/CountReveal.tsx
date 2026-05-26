import type { CountReveal as CountRevealValue } from '@blackjack/shared';
import { useEffect } from 'react';

interface Props {
  reveal: CountRevealValue | null;
  onRequest: () => void;
}

/**
 * Card-counting validation widget. Idle = a small unobtrusive button. When
 * the player wants to check their mental count they click (or press 'c'),
 * the server replies, and the values flash for a few seconds before auto-
 * hiding so the screen returns to its blind-training state.
 */
export function CountReveal({ reveal, onRequest }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.toLowerCase() === 'c') onRequest();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onRequest]);

  return (
    <div className="fixed bottom-4 right-4 z-20">
      {reveal ? (
        <div className="bg-felt-900 border-2 border-chip-gold rounded-lg shadow-xl p-4 font-mono animate-pulse">
          <div className="text-xs text-emerald-300 uppercase tracking-widest mb-1">
            Hi-Lo validation
          </div>
          <div className="text-2xl">
            <span className="text-emerald-200">RC</span>{' '}
            <span className={reveal.runningCount > 0 ? 'text-emerald-300' : reveal.runningCount < 0 ? 'text-red-400' : 'text-white'}>
              {reveal.runningCount > 0 ? '+' : ''}{reveal.runningCount}
            </span>
          </div>
          <div className="text-2xl mt-1">
            <span className="text-emerald-200">TC</span>{' '}
            <span className={reveal.trueCount >= 1 ? 'text-emerald-300' : reveal.trueCount <= -1 ? 'text-red-400' : 'text-white'}>
              {reveal.trueCount > 0 ? '+' : ''}{reveal.trueCount.toFixed(1)}
            </span>
            <span className="text-xs text-emerald-500 ml-2">
              ({reveal.remainingDecks.toFixed(1)} decks)
            </span>
          </div>
          <div className="text-xs text-emerald-500 mt-2">5 秒後自動隱藏</div>
        </div>
      ) : (
        <button
          className="btn-secondary opacity-50 hover:opacity-100 transition-opacity"
          onClick={onRequest}
          title="驗證算牌 (C)"
        >
          驗證 <span className="text-xs opacity-70">[C]</span>
        </button>
      )}
    </div>
  );
}
