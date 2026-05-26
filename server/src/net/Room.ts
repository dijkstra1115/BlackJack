import {
  RULES,
  type CountReveal,
  type DealerView,
  type HandResultView,
  type HandView,
  type PlayerAction,
  type PlayerView,
  type RoomPhase,
  type RoomState,
  type SpectatorView,
} from '@blackjack/shared';
import { Player } from '../game/Player.js';
import { Round, type PlayerHandResult } from '../game/Round.js';
import { Shoe } from '../game/Shoe.js';
import { snapshot as countSnapshot } from '../game/CountingSystem.js';
import type { Rng } from '../game/rng.js';
import { playerId as newPlayerId, sessionToken as newSessionToken } from './ids.js';
import { RoomMember } from './RoomMember.js';

export interface RoomOptions {
  id: string;
  hostName: string;
  startingChips?: number;
  /** Optional seeded RNG — used by tests for deterministic shoes. */
  rng?: Rng;
}

export interface JoinResult {
  member: RoomMember;
  sessionToken: string;
}

const SEATS = RULES.MAX_SEATS;

export class RoomError extends Error {
  readonly code: string;
  readonly userMessage: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.userMessage = message;
  }
}

/**
 * One blackjack table. Owns its shoe (persistent across hands) and current
 * Round. Wraps the domain layer with phase/seat/permission checks so that
 * the Socket.io layer can be a thin event router.
 */
export class Room {
  readonly id: string;
  readonly startingChips: number;
  hostId: string;
  phase: RoomPhase = 'lobby';
  readonly shoe: Shoe;
  readonly members = new Map<string, RoomMember>();
  /** seats[0] = seat 1, seats[6] = seat 7. */
  readonly seats: (RoomMember | null)[] = Array(SEATS).fill(null);
  round: Round | null = null;
  lastResults: PlayerHandResult[] = [];

  private constructor(opts: RoomOptions, host: RoomMember) {
    this.id = opts.id;
    this.startingChips = opts.startingChips ?? 1000;
    this.hostId = host.playerId;
    this.shoe = new Shoe(opts.rng ? { rng: opts.rng } : {});
    this.members.set(host.playerId, host);
  }

  /** Factory — creates the room with the host already joined. */
  static create(opts: RoomOptions): { room: Room; host: RoomMember; sessionToken: string } {
    const token = newSessionToken();
    const host = new RoomMember(
      newPlayerId(),
      token,
      opts.hostName,
      opts.startingChips ?? 1000,
    );
    const room = new Room(opts, host);
    return { room, host, sessionToken: token };
  }

  // ---------- membership ----------

  join(name: string): JoinResult {
    const token = newSessionToken();
    const member = new RoomMember(newPlayerId(), token, name, this.startingChips);
    this.members.set(member.playerId, member);
    return { member, sessionToken: token };
  }

  leave(playerId: string): void {
    const m = this.members.get(playerId);
    if (!m) return;
    if (m.isSeated()) this.standUp(playerId);
    this.members.delete(playerId);
    // If host left, pick a new host (any remaining member).
    if (this.hostId === playerId) {
      const next = this.members.values().next().value as RoomMember | undefined;
      this.hostId = next?.playerId ?? '';
    }
  }

  // ---------- seating ----------

  takeSeat(playerId: string, seat: number): void {
    if (seat < 1 || seat > SEATS) {
      throw new RoomError('seat_invalid', `seat must be 1..${SEATS}`);
    }
    const m = this.requireMember(playerId);
    if (this.phase === 'playing') {
      throw new RoomError('phase_locked', 'cannot take a seat mid-hand');
    }
    if (this.seats[seat - 1] !== null) {
      throw new RoomError('seat_taken', `seat ${seat} is taken`);
    }
    if (m.isSeated()) {
      throw new RoomError('already_seated', 'leave your current seat first');
    }
    m.seat = seat;
    m.player = new Player(playerId, seat, m.chips);
    m.hasBet = false;
    this.seats[seat - 1] = m;
    if (this.phase === 'lobby') this.phase = 'betting';
  }

  standUp(playerId: string): void {
    const m = this.requireMember(playerId);
    if (this.phase === 'playing') {
      throw new RoomError('phase_locked', 'cannot stand up mid-hand');
    }
    if (!m.isSeated()) return;
    m.syncChipsFromPlayer();
    this.seats[m.seat! - 1] = null;
    m.seat = null;
    m.player = null;
    m.hasBet = false;
    if (this.seatedMembers().length === 0) this.phase = 'lobby';
  }

  // ---------- betting / round ----------

  placeBet(playerId: string, amount: number): void {
    if (this.phase !== 'betting') {
      throw new RoomError('phase_wrong', 'not accepting bets right now');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RoomError('bet_invalid', 'bet must be a positive number');
    }
    const m = this.requireSeatedMember(playerId);
    if (amount > m.player!.chips) {
      throw new RoomError('bet_too_large', 'insufficient chips');
    }
    // Allow re-betting before round starts: undo prior bet on this member.
    if (m.hasBet) {
      const prior = m.player!.hands[0]?.bet ?? 0;
      m.player!.chips += prior;
      m.player!.clearHands();
    }
    m.player!.placeBet(amount);
    m.hasBet = true;
  }

  startRound(playerId: string): void {
    if (playerId !== this.hostId) {
      throw new RoomError('not_host', 'only the host can start the round');
    }
    if (this.phase !== 'betting') {
      throw new RoomError('phase_wrong', 'cannot start a round now');
    }
    const seated = this.seatedMembers();
    if (seated.length === 0) {
      throw new RoomError('no_players', 'no one is seated');
    }
    const haveBet = seated.filter(m => m.hasBet);
    if (haveBet.length === 0) {
      throw new RoomError('no_bets', 'at least one player must place a bet');
    }
    // Reshuffle BEFORE the new hand if penetration was crossed.
    if (this.shoe.needsReshuffle()) this.shoe.shuffle();

    // Only members who actually placed a bet participate this round.
    this.round = new Round({
      shoe: this.shoe,
      players: haveBet.map(m => m.player!),
    });
    for (const m of haveBet) m.hasBet = false; // consumed by deal
    this.lastResults = [];
    this.phase = 'playing';
    this.round.startDeal();
    this.handleRoundCompletion();
  }

  // ---------- player action ----------

  performAction(playerId: string, action: PlayerAction): void {
    if (this.phase !== 'playing' || !this.round) {
      throw new RoomError('phase_wrong', 'no round in progress');
    }
    const turn = this.round.currentTurn;
    if (!turn || turn.playerId !== playerId) {
      throw new RoomError('not_your_turn', `it is not ${playerId}'s turn`);
    }
    switch (action) {
      case 'hit':       this.round.hit(playerId); break;
      case 'stand':     this.round.stand(playerId); break;
      case 'double':    this.round.double(playerId); break;
      case 'split':     this.round.split(playerId); break;
      case 'surrender': this.round.surrender(playerId); break;
      default:
        throw new RoomError('action_unknown', `unknown action: ${String(action)}`);
    }
    this.handleRoundCompletion();
  }

  /** Move to next hand (betting phase). Anyone can trigger between hands. */
  nextHand(): void {
    if (this.phase !== 'between') {
      throw new RoomError('phase_wrong', 'no completed hand to advance from');
    }
    this.round = null;
    for (const m of this.seatedMembers()) m.hasBet = false;
    this.phase = 'betting';
  }

  // ---------- counts ----------

  /**
   * Snapshot of Hi-Lo running/true count. The Room does NOT include this in
   * the default state broadcast — clients must explicitly request it via
   * `count:request`. That mirrors the "blind training, then validate" loop.
   */
  revealCount(): CountReveal {
    const s = countSnapshot(this.shoe);
    return {
      runningCount: s.runningCount,
      trueCount: s.trueCount,
      remainingDecks: s.remainingDecks,
    };
  }

  // ---------- views ----------

  /** Serialize the current state for broadcast. Counts are NOT included. */
  getState(): RoomState {
    return {
      roomId: this.id,
      hostId: this.hostId,
      phase: this.phase,
      roundPhase: this.round?.phase ?? null,
      seats: this.seats.map(m => (m ? this.viewSeatedMember(m) : null)),
      spectators: this.spectatorViews(),
      dealer: this.dealerView(),
      currentTurn: this.round?.currentTurn ?? null,
      lastResults: this.lastResults.map(r => this.viewResult(r)),
      dealtCount: this.shoe.dealtCount,
      totalCards: this.shoe.totalCards,
    };
  }

  // ---------- internals ----------

  private handleRoundCompletion(): void {
    if (this.round && this.round.phase === 'settled') {
      this.lastResults = this.round.results;
      // Persist chip balances back into the member records.
      for (const m of this.seatedMembers()) m.syncChipsFromPlayer();
      this.phase = 'between';
    }
  }

  private seatedMembers(): RoomMember[] {
    return this.seats.filter((m): m is RoomMember => m !== null);
  }

  private spectatorViews(): SpectatorView[] {
    const out: SpectatorView[] = [];
    for (const m of this.members.values()) {
      if (!m.isSeated()) out.push({ playerId: m.playerId, name: m.name });
    }
    return out;
  }

  private viewSeatedMember(m: RoomMember): PlayerView {
    const p = m.player!;
    return {
      playerId: m.playerId,
      name: m.name,
      seat: m.seat!,
      chips: p.chips,
      hands: p.hands.map(h => this.viewHand(h)),
      currentHandIndex: p.currentHandIndex,
      hasBet: m.hasBet,
    };
  }

  private viewHand(h: import('../game/Hand.js').Hand): HandView {
    const total = h.total();
    return {
      cards: [...h.cards],
      total: total.value,
      isSoft: total.isSoft,
      bet: h.bet,
      isBlackjack: h.isBlackjack(),
      isBust: h.isBust(),
      isFromSplit: h.isFromSplit,
      isFromSplitAces: h.isFromSplitAces,
      hasStood: h.hasStood,
      hasDoubled: h.hasDoubled,
      hasSurrendered: h.hasSurrendered,
    };
  }

  private dealerView(): DealerView | null {
    if (!this.round) return null;
    const d = this.round.dealer;
    if (d.hand.cards.length === 0) return null;
    if (d.holeCardRevealed) {
      return {
        cards: [...d.hand.cards],
        visibleTotal: d.hand.total().value,
        holeCardRevealed: true,
        isBust: d.hand.isBust(),
        hasBlackjack: d.hand.isBlackjack(),
      };
    }
    // Hole card hidden — only show the up-card.
    const up = d.upCard;
    return {
      cards: up ? [up] : [],
      visibleTotal: up ? (up.rank === 'A' ? 11 : up.rank === 'J' || up.rank === 'Q' || up.rank === 'K' ? 10 : Number(up.rank)) : 0,
      holeCardRevealed: false,
      isBust: false,
      hasBlackjack: false,
    };
  }

  private viewResult(r: PlayerHandResult): HandResultView {
    return {
      playerId: r.playerId,
      seat: r.seat,
      handIndex: r.handIndex,
      outcome: r.result.outcome,
      payout: r.result.payout,
      chipsAfter: r.chipsAfter,
    };
  }

  private requireMember(playerId: string): RoomMember {
    const m = this.members.get(playerId);
    if (!m) throw new RoomError('not_in_room', 'player is not in this room');
    return m;
  }

  private requireSeatedMember(playerId: string): RoomMember {
    const m = this.requireMember(playerId);
    if (!m.isSeated()) throw new RoomError('not_seated', 'you must be seated');
    return m;
  }
}

