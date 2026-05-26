import type { Player } from '../game/Player.js';

/**
 * One connected participant. Carries identity + persistent chip stack.
 *
 * A member without `player`/`seat` is a spectator. When they sit down, the
 * Room instantiates a domain Player and points `player` at it. Chips live in
 * the Player while seated; on standing up we copy them back so the member
 * keeps their balance.
 */
export class RoomMember {
  readonly playerId: string;
  readonly sessionToken: string;
  name: string;
  /** Persistent chip stack. Authoritative while the member is a spectator. */
  chips: number;
  seat: number | null = null;
  player: Player | null = null;
  /** True once the member has placed a bet for the current betting phase. */
  hasBet = false;

  constructor(
    playerId: string,
    sessionToken: string,
    name: string,
    startingChips: number,
  ) {
    this.playerId = playerId;
    this.sessionToken = sessionToken;
    this.name = name;
    this.chips = startingChips;
  }

  isSeated(): boolean {
    return this.player !== null;
  }

  /** Live chip count — pulled from the domain Player while seated. */
  currentChips(): number {
    return this.player?.chips ?? this.chips;
  }

  /** Persist the seated chips back into the member record. */
  syncChipsFromPlayer(): void {
    if (this.player) this.chips = this.player.chips;
  }
}
