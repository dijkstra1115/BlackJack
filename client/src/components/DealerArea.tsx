import type { DealerView } from '@blackjack/shared';
import { CardBack, CardView } from './CardView.js';

interface Props {
  dealer: DealerView | null;
}

export function DealerArea({ dealer }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="text-sm uppercase tracking-widest text-emerald-300">Dealer</div>
      <div className="flex gap-2 min-h-[6rem] items-center">
        {!dealer || dealer.cards.length === 0 ? (
          <div className="text-emerald-700 italic">等待開局…</div>
        ) : (
          <>
            {dealer.cards.map((c, i) => (
              <CardView key={i} card={c} size="lg" />
            ))}
            {!dealer.holeCardRevealed && dealer.cards.length === 1 && <CardBack size="lg" />}
          </>
        )}
      </div>
      {dealer && dealer.cards.length > 0 && (
        <div className="text-lg font-mono">
          {dealer.holeCardRevealed ? (
            <>
              <span className="text-emerald-200">總點：</span>
              <span className={dealer.isBust ? 'text-red-400' : 'text-white'}>
                {dealer.visibleTotal}
              </span>
              {dealer.isBust && <span className="ml-2 text-red-400">BUST</span>}
              {dealer.hasBlackjack && <span className="ml-2 text-chip-gold">BJ</span>}
            </>
          ) : (
            <span className="text-emerald-400">明牌：{dealer.visibleTotal}</span>
          )}
        </div>
      )}
    </div>
  );
}
