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
import type { Server, Socket } from 'socket.io';
import { Room, RoomError } from './Room.js';
import { RoomManager } from './RoomManager.js';

interface SocketData {
  playerId?: string;
  roomId?: string;
  sessionToken?: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

/**
 * Register all blackjack event handlers on a freshly-connected socket.
 *
 * Design notes:
 *  - The socket itself carries `data.playerId` + `data.roomId` so handlers
 *    don't need a separate session store. Lose the connection → lose the seat.
 *  - Every state-changing handler wraps domain calls in `safe()` so RoomError
 *    is reported to the offending socket instead of crashing the server.
 *  - After any state change we broadcast the new room state to every socket
 *    in that room. The count is NEVER part of the broadcast — only sent in
 *    response to an explicit `count:request` to the requester.
 */
export function registerHandlers(io: IO, socket: Sock, manager: RoomManager): void {
  socket.on(EVENTS.RoomCreate, (payload: RoomCreatePayload) => {
    safe(socket, () => {
      const { room, host, sessionToken } = manager.create({
        hostName: payload.hostName,
        startingChips: payload.startingChips,
      });
      attachSocketToRoom(socket, room, host.playerId, sessionToken);
      socket.emit(EVENTS.RoomJoined, {
        roomId: room.id,
        playerId: host.playerId,
        sessionToken,
      });
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.RoomJoin, (payload: RoomJoinPayload) => {
    safe(socket, () => {
      const room = manager.require(payload.roomId);
      const { member, sessionToken } = room.join(payload.playerName);
      attachSocketToRoom(socket, room, member.playerId, sessionToken);
      socket.emit(EVENTS.RoomJoined, {
        roomId: room.id,
        playerId: member.playerId,
        sessionToken,
      });
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.RoomLeave, () => {
    safe(socket, () => {
      const room = roomFor(socket, manager);
      if (!room) return;
      const playerId = socket.data.playerId!;
      room.leave(playerId);
      socket.leave(room.id);
      socket.data.roomId = undefined;
      socket.data.playerId = undefined;
      broadcastState(io, room);
      manager.cleanupIfEmpty(room.id);
    });
  });

  socket.on(EVENTS.SeatTake, (payload: SeatTakePayload) => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.takeSeat(socket.data.playerId!, payload.seat);
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.SeatLeave, () => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.standUp(socket.data.playerId!);
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.BetPlace, (payload: BetPlacePayload) => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.placeBet(socket.data.playerId!, payload.amount);
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.RoundStart, () => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.startRound(socket.data.playerId!);
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.Action, (payload: ActionPayload) => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.performAction(socket.data.playerId!, payload.action);
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.NextHand, () => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      room.nextHand();
      broadcastState(io, room);
    });
  });

  socket.on(EVENTS.CountRequest, () => {
    safe(socket, () => {
      const room = requireSocketRoom(socket, manager);
      socket.emit(EVENTS.CountReveal, room.revealCount());
    });
  });

  socket.on('disconnect', () => {
    const room = roomFor(socket, manager);
    if (!room) return;
    const playerId = socket.data.playerId;
    if (playerId) {
      try { room.leave(playerId); } catch { /* room may already be gone */ }
    }
    broadcastState(io, room);
    manager.cleanupIfEmpty(room.id);
  });
}

function attachSocketToRoom(socket: Sock, room: Room, playerId: string, token: string) {
  socket.data.playerId = playerId;
  socket.data.roomId = room.id;
  socket.data.sessionToken = token;
  socket.join(room.id);
}

function roomFor(socket: Sock, manager: RoomManager): Room | undefined {
  const id = socket.data.roomId;
  return id ? manager.get(id) : undefined;
}

function requireSocketRoom(socket: Sock, manager: RoomManager): Room {
  const r = roomFor(socket, manager);
  if (!r) throw new RoomError('not_in_room', 'this socket is not joined to a room');
  return r;
}

function broadcastState(io: IO, room: Room): void {
  io.to(room.id).emit(EVENTS.RoomState, room.getState());
}

/** Run a handler; on RoomError emit to the offending socket, else rethrow. */
function safe(socket: Sock, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof RoomError) {
      socket.emit(EVENTS.RoomError, { code: err.code, message: err.userMessage });
      return;
    }
    if (err instanceof Error) {
      // Manager.require throws plain Error('Room not found'). Surface as room_not_found.
      if (err.message.startsWith('Room not found')) {
        socket.emit(EVENTS.RoomError, { code: 'room_not_found', message: err.message });
        return;
      }
      socket.emit(EVENTS.RoomError, { code: 'internal', message: err.message });
      return;
    }
    throw err;
  }
}
