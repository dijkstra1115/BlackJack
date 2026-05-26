import { Room, type RoomOptions } from './Room.js';
import { roomId as newRoomId } from './ids.js';
import type { Rng } from '../game/rng.js';

export interface CreateRoomArgs {
  hostName: string;
  startingChips?: number;
  rng?: Rng;
}

/**
 * In-memory registry of active rooms. The socket layer asks the manager to
 * create rooms or look them up by id; nothing here knows about Socket.io.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  create(args: CreateRoomArgs): ReturnType<typeof Room.create> {
    // Avoid collision — extremely unlikely but cheap to check.
    let id: string;
    do { id = newRoomId(); } while (this.rooms.has(id));
    const opts: RoomOptions = {
      id,
      hostName: args.hostName,
      startingChips: args.startingChips,
      rng: args.rng,
    };
    const created = Room.create(opts);
    this.rooms.set(id, created.room);
    return created;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  require(roomId: string): Room {
    const r = this.rooms.get(roomId);
    if (!r) throw new Error(`Room not found: ${roomId}`);
    return r;
  }

  /** Drop the room if it has no members. Returns true if removed. */
  cleanupIfEmpty(roomId: string): boolean {
    const r = this.rooms.get(roomId);
    if (!r) return false;
    if (r.members.size === 0) {
      this.rooms.delete(roomId);
      return true;
    }
    return false;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }
}
