import {
  EVENTS,
  type CountReveal,
  type PlayerAction,
  type RoomErrorPayload,
  type RoomJoinedPayload,
  type RoomState,
} from '@blackjack/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, getSocket, type GameSocket } from '../net/socket.js';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface UseRoom {
  socket: GameSocket;
  status: ConnectionStatus;
  playerId: string | null;
  roomState: RoomState | null;
  errorMessage: string | null;
  revealedCount: CountReveal | null;

  createRoom: (hostName: string, startingChips?: number) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  takeSeat: (seat: number) => void;
  standUp: () => void;
  placeBet: (amount: number) => void;
  startRound: () => void;
  doAction: (action: PlayerAction) => void;
  nextHand: () => void;
  requestCount: () => void;
  clearReveal: () => void;
  clearError: () => void;
}

/**
 * Single React hook that wires the typed Socket.io client to React state.
 * Returns both the current room snapshot AND action callbacks bound to the
 * live socket — components don't need to touch the socket directly.
 */
export function useRoom(): UseRoom {
  const socket = getSocket();
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState<CountReveal | null>(null);

  // Auto-hide the count reveal after a few seconds so the screen stays
  // "blind" by default — players are training, not reading the count.
  const revealTimer = useRef<number | null>(null);

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onJoined = (p: RoomJoinedPayload) => setPlayerId(p.playerId);
    const onState = (s: RoomState) => setRoomState(s);
    const onError = (e: RoomErrorPayload) => setErrorMessage(`${e.code}: ${e.message}`);
    const onReveal = (c: CountReveal) => {
      setRevealedCount(c);
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => setRevealedCount(null), 5000);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.RoomJoined, onJoined);
    socket.on(EVENTS.RoomState, onState);
    socket.on(EVENTS.RoomError, onError);
    socket.on(EVENTS.CountReveal, onReveal);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.RoomJoined, onJoined);
      socket.off(EVENTS.RoomState, onState);
      socket.off(EVENTS.RoomError, onError);
      socket.off(EVENTS.CountReveal, onReveal);
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
    };
  }, [socket]);

  const createRoom = useCallback(
    (hostName: string, startingChips?: number) =>
      emit.roomCreate(socket, { hostName, startingChips }),
    [socket],
  );
  const joinRoom = useCallback(
    (roomId: string, playerName: string) =>
      emit.roomJoin(socket, { roomId, playerName }),
    [socket],
  );
  const takeSeat = useCallback((seat: number) => emit.seatTake(socket, { seat }), [socket]);
  const standUp = useCallback(() => emit.seatLeave(socket), [socket]);
  const placeBet = useCallback((amount: number) => emit.betPlace(socket, { amount }), [socket]);
  const startRound = useCallback(() => emit.roundStart(socket), [socket]);
  const doAction = useCallback(
    (action: PlayerAction) => emit.action(socket, { action }),
    [socket],
  );
  const nextHand = useCallback(() => emit.nextHand(socket), [socket]);
  const requestCount = useCallback(() => emit.countRequest(socket), [socket]);
  const clearReveal = useCallback(() => setRevealedCount(null), []);
  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
    socket,
    status,
    playerId,
    roomState,
    errorMessage,
    revealedCount,
    createRoom,
    joinRoom,
    takeSeat,
    standUp,
    placeBet,
    startRound,
    doAction,
    nextHand,
    requestCount,
    clearReveal,
    clearError,
  };
}
