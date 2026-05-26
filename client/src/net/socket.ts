import {
  EVENTS,
  type ActionPayload,
  type BetPlacePayload,
  type ClientToServerEvents,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type SeatTakePayload,
  type ServerToClientEvents,
} from '@blackjack/shared';
import { io, type Socket } from 'socket.io-client';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Resolution order:
//   1. Explicit VITE_SERVER_URL (set at build time for unusual deployments)
//   2. Production build → same origin (server serves both static + socket.io)
//   3. Dev → localhost:3001 (Vite dev server on 5173, server on 3001)
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

let singleton: GameSocket | null = null;

/** Lazy-created Socket.io connection. One per browser tab. */
export function getSocket(): GameSocket {
  if (!singleton) {
    singleton = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
  }
  return singleton;
}

// ---- Strongly-typed emitter wrappers ----
// Socket.io's typed-event signatures get unwieldy at call sites; these
// wrappers keep IDE help and avoid stringly-typed event names elsewhere.

export const emit = {
  roomCreate: (s: GameSocket, p: RoomCreatePayload) => s.emit(EVENTS.RoomCreate, p),
  roomJoin: (s: GameSocket, p: RoomJoinPayload) => s.emit(EVENTS.RoomJoin, p),
  roomLeave: (s: GameSocket) => s.emit(EVENTS.RoomLeave),
  seatTake: (s: GameSocket, p: SeatTakePayload) => s.emit(EVENTS.SeatTake, p),
  seatLeave: (s: GameSocket) => s.emit(EVENTS.SeatLeave),
  betPlace: (s: GameSocket, p: BetPlacePayload) => s.emit(EVENTS.BetPlace, p),
  roundStart: (s: GameSocket) => s.emit(EVENTS.RoundStart),
  action: (s: GameSocket, p: ActionPayload) => s.emit(EVENTS.Action, p),
  nextHand: (s: GameSocket) => s.emit(EVENTS.NextHand),
  countRequest: (s: GameSocket) => s.emit(EVENTS.CountRequest),
};
