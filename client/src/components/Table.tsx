import type { RoomState } from '@blackjack/shared';
import type { UseRoom } from '../state/useRoom.js';
import { ActionBar } from './ActionBar.js';
import { BetControls } from './BetControls.js';
import { CountReveal } from './CountReveal.js';
import { DealerArea } from './DealerArea.js';
import { Seat, buildResultsLookup } from './Seat.js';

interface Props {
  room: UseRoom;
  roomState: RoomState;
}

export function Table({ room, roomState }: Props) {
  const me = roomState.seats.find((s) => s?.playerId === room.playerId) ?? null;
  const isHost = roomState.hostId === room.playerId;
  const turn = roomState.currentTurn;
  const currentHand =
    me && turn && turn.playerId === me.playerId ? me.hands[turn.handIndex] ?? null : null;

  const results = buildResultsLookup(roomState);

  const canStart =
    roomState.phase === 'betting' &&
    roomState.seats.some((s) => s?.hasBet);

  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-felt-900/80 border-b border-emerald-800">
        <div className="flex items-baseline gap-3">
          <span className="text-emerald-300 text-sm uppercase tracking-widest">Room</span>
          <span className="font-mono text-xl text-chip-gold">{roomState.roomId}</span>
          <span className="text-xs text-emerald-500">
            {roomState.dealtCount} / {roomState.totalCards} dealt
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-300">
            phase: <span className="text-white font-semibold">{phaseLabel(roomState)}</span>
          </span>
          {me && (
            <span className="text-emerald-300">
              chips: <span className="text-chip-gold font-mono">${me.chips}</span>
            </span>
          )}
          {me && (
            <button
              className="btn-secondary text-xs"
              onClick={room.standUp}
              disabled={roomState.phase === 'playing'}
              title={roomState.phase === 'playing' ? '牌局中無法離桌' : ''}
            >
              離桌
            </button>
          )}
        </div>
      </header>

      {/* Felt */}
      <main className="flex-1 px-4 py-4 flex flex-col gap-6">
        <DealerArea dealer={roomState.dealer} />

        {/* Seats — 7 across */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => {
            const seatNum = i + 1;
            const seatPlayer = roomState.seats[i] ?? null;
            const isMe = seatPlayer?.playerId === room.playerId;
            const isMyTurnSeat =
              turn?.seat === seatNum && turn?.playerId === seatPlayer?.playerId;
            const meIsSeated = !!me;
            const canSit =
              !seatPlayer && !meIsSeated && (roomState.phase === 'lobby' || roomState.phase === 'betting' || roomState.phase === 'between');
            return (
              <Seat
                key={seatNum}
                seatNumber={seatNum}
                player={seatPlayer}
                isMe={isMe}
                isMyTurnSeat={isMyTurnSeat}
                canSit={canSit}
                onSit={() => room.takeSeat(seatNum)}
                resultsByHandIndex={
                  seatPlayer ? results.get(seatPlayer.playerId) : undefined
                }
              />
            );
          })}
        </div>

        {/* Phase-specific controls */}
        <div className="mt-auto flex flex-col items-center gap-3">
          {roomState.phase === 'betting' && (
            <BetControls
              me={me}
              isHost={isHost}
              canStart={canStart}
              onPlaceBet={room.placeBet}
              onStartRound={room.startRound}
            />
          )}

          {roomState.phase === 'playing' && me && (
            <>
              <TurnBanner roomState={roomState} myId={room.playerId} />
              <ActionBar
                roomState={roomState}
                myPlayerId={room.playerId!}
                currentHand={currentHand}
                onAction={room.doAction}
              />
            </>
          )}

          {roomState.phase === 'between' && (
            <div className="flex flex-col items-center gap-2">
              <div className="text-emerald-300 text-sm">本手結算完成</div>
              <button className="btn-primary" onClick={room.nextHand}>
                下一手
              </button>
            </div>
          )}

          {roomState.phase === 'lobby' && (
            <div className="text-emerald-300 text-sm italic">
              還沒有人入座 — 點上方任一空位坐下
            </div>
          )}
        </div>

        {/* Spectators list */}
        {roomState.spectators.length > 0 && (
          <div className="text-xs text-emerald-500 text-center">
            旁觀：{roomState.spectators.map((s) => s.name).join('、')}
          </div>
        )}
      </main>

      <CountReveal reveal={room.revealedCount} onRequest={room.requestCount} />
    </div>
  );
}

function TurnBanner({ roomState, myId }: { roomState: RoomState; myId: string | null }) {
  const turn = roomState.currentTurn;
  if (!turn) return null;
  const seated = roomState.seats[turn.seat - 1];
  const isMe = turn.playerId === myId;
  return (
    <div
      className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
        isMe ? 'bg-chip-gold text-felt-900 animate-pulse' : 'bg-felt-700 text-emerald-200'
      }`}
    >
      {isMe ? '輪到你了' : `等待 ${seated?.name ?? '?'} 操作`}
    </div>
  );
}

function phaseLabel(state: RoomState): string {
  switch (state.phase) {
    case 'lobby': return '等待玩家';
    case 'betting': return '下注中';
    case 'playing':
      if (state.roundPhase === 'dealerTurn') return '莊家操作';
      if (state.roundPhase === 'settled') return '結算';
      return '進行中';
    case 'between': return '回合結算完';
  }
}
