import type { Card } from '@blackjack/shared';

interface Props {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-9 h-12 text-sm',
  md: 'w-12 h-16 text-lg',
  lg: 'w-16 h-24 text-2xl',
};

export function CardView({ card, size = 'md' }: Props) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  return (
    <div
      className={`card-face ${sizeClass[size]} ${isRed ? 'text-red-600' : 'text-stone-900'}`}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className="font-bold">{card.rank}</span>
      <span className="ml-0.5">{card.suit}</span>
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: Props['size'] }) {
  return <div className={`card-back ${sizeClass[size ?? 'md']}`} aria-label="hidden card" />;
}
