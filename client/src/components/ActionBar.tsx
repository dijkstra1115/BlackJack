import type { HandView, PlayerAction, RoomState } from '@blackjack/shared';
import { useEffect } from 'react';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  currentHand: HandView | null;
  onAction: (a: PlayerAction) => void;
}

/**
 * Action buttons (Hit/Stand/Double/Split/Surrender). Only enabled when it's
 * actually this player's turn — disabled states still render so the layout
 * doesn't jump around between turns.
 *
 * Keyboard shortcuts:  h=hit  s=stand  d=double  p=split  r=surrender
 */
export function ActionBar({ roomState, myPlayerId, currentHand, onAction }: Props) {
  const isMyTurn = roomState.currentTurn?.playerId === myPlayerId;
  const enabled = isMyTurn && currentHand !== null;

  const canHit = enabled && !currentHand!.isBust && currentHand!.total !== 21 && !currentHand!.hasStood;
  const canStand = enabled && !currentHand!.hasStood && !currentHand!.isBust;
  // The server is the authority — we approximate availability for UX hints.
  const canDouble =
    enabled && currentHand!.cards.length === 2 && !currentHand!.hasDoubled && !currentHand!.isFromSplitAces;
  const isPair =
    currentHand?.cards.length === 2 &&
    currentHand.cards[0]!.rank === currentHand.cards[1]!.rank;
  const canSplit = enabled && isPair === true;
  const canSurrender =
    enabled && currentHand!.cards.length === 2 && !currentHand!.isFromSplit && !currentHand!.hasDoubled;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'h': if (canHit) onAction('hit'); break;
        case 's': if (canStand) onAction('stand'); break;
        case 'd': if (canDouble) onAction('double'); break;
        case 'p': if (canSplit) onAction('split'); break;
        case 'r': if (canSurrender) onAction('surrender'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, canHit, canStand, canDouble, canSplit, canSurrender, onAction]);

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <ActionBtn label="Hit" hint="H" enabled={canHit} onClick={() => onAction('hit')} variant="primary" />
      <ActionBtn label="Stand" hint="S" enabled={canStand} onClick={() => onAction('stand')} variant="primary" />
      <ActionBtn label="Double" hint="D" enabled={canDouble} onClick={() => onAction('double')} variant="secondary" />
      <ActionBtn label="Split" hint="P" enabled={canSplit} onClick={() => onAction('split')} variant="secondary" />
      <ActionBtn label="Surrender" hint="R" enabled={canSurrender} onClick={() => onAction('surrender')} variant="danger" />
    </div>
  );
}

function ActionBtn({
  label,
  hint,
  enabled,
  onClick,
  variant,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onClick: () => void;
  variant: 'primary' | 'secondary' | 'danger';
}) {
  const cls =
    variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : 'btn-danger';
  return (
    <button className={`${cls} min-w-[6.5rem]`} disabled={!enabled} onClick={onClick}>
      <span>{label}</span>
      <span className="ml-2 text-xs opacity-70">[{hint}]</span>
    </button>
  );
}
