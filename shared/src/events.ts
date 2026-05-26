import type { Card, PlayerAction, RoundPhase } from './types.js';

// ---------- shared shapes used in payloads ----------

export type RoomPhase =
  | 'lobby'      // 房間剛建立，沒人坐下或還在等開局
  | 'betting'    // 等所有就座玩家下注
  | 'playing'    // Round 進行中（dealing → playerAction → dealerTurn → settled）
  | 'between';   // 上一手剛結算完，準備下一手

export interface HandView {
  cards: Card[];
  total: number;
  isSoft: boolean;
  bet: number;
  isBlackjack: boolean;
  isBust: boolean;
  isFromSplit: boolean;
  isFromSplitAces: boolean;
  hasStood: boolean;
  hasDoubled: boolean;
  hasSurrendered: boolean;
}

export interface PlayerView {
  playerId: string;
  name: string;
  seat: number;
  chips: number;
  hands: HandView[];
  currentHandIndex: number;
  /** True if the player has placed their bet for the current betting round. */
  hasBet: boolean;
}

export interface SpectatorView {
  playerId: string;
  name: string;
}

export interface DealerView {
  /** Cards visible to the table. The hole card is omitted until revealed. */
  cards: Card[];
  /** Total of the visible cards only. */
  visibleTotal: number;
  holeCardRevealed: boolean;
  isBust: boolean;
  hasBlackjack: boolean;
}

export interface HandResultView {
  playerId: string;
  seat: number;
  handIndex: number;
  outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';
  payout: number;
  chipsAfter: number;
}

/**
 * Snapshot of one room. Sent on join and after any state change. By default
 * the Hi-Lo count fields are omitted — the client must explicitly request
 * them via `count:request` to "validate" their mental count.
 */
export interface RoomState {
  roomId: string;
  hostId: string;
  phase: RoomPhase;
  roundPhase: RoundPhase | null;
  /** Seats 1..7. null means empty. */
  seats: (PlayerView | null)[];
  spectators: SpectatorView[];
  dealer: DealerView | null;
  /** Whose turn it is right now (during playerAction). */
  currentTurn: { playerId: string; seat: number; handIndex: number } | null;
  /** Results for the most recent hand, if any. */
  lastResults: HandResultView[];
  /** Cards already dealt out of the shoe (penetration indicator). */
  dealtCount: number;
  totalCards: number;
  /** Always omitted by default — server only fills these on explicit reveal. */
  counts?: CountReveal;
}

export interface CountReveal {
  runningCount: number;
  trueCount: number;
  remainingDecks: number;
}

// ---------- event names ----------

export const EVENTS = {
  // client → server
  RoomCreate: 'room:create',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  SeatTake: 'seat:take',
  SeatLeave: 'seat:leave',
  BetPlace: 'bet:place',
  RoundStart: 'round:start',
  Action: 'action',
  CountRequest: 'count:request',
  NextHand: 'next-hand',

  // server → client
  RoomJoined: 'room:joined',
  RoomState: 'room:state',
  RoomError: 'room:error',
  CountReveal: 'count:reveal',
} as const;

// ---------- client → server payloads ----------

export interface RoomCreatePayload {
  hostName: string;
  /** Optional starting chips per player; defaults to 1000 server-side. */
  startingChips?: number;
}

export interface RoomJoinPayload {
  roomId: string;
  playerName: string;
}

export interface SeatTakePayload {
  seat: number; // 1..7
}

export interface BetPlacePayload {
  amount: number;
}

export interface ActionPayload {
  action: PlayerAction;
}

// ---------- server → client payloads ----------

export interface RoomJoinedPayload {
  roomId: string;
  playerId: string;
  /** Player's own session token — opaque to the client, sent back on reconnect. */
  sessionToken: string;
}

export interface RoomErrorPayload {
  code: string;
  message: string;
}

// ---------- typed event maps for Socket.io ----------

export interface ClientToServerEvents {
  [EVENTS.RoomCreate]: (p: RoomCreatePayload) => void;
  [EVENTS.RoomJoin]: (p: RoomJoinPayload) => void;
  [EVENTS.RoomLeave]: () => void;
  [EVENTS.SeatTake]: (p: SeatTakePayload) => void;
  [EVENTS.SeatLeave]: () => void;
  [EVENTS.BetPlace]: (p: BetPlacePayload) => void;
  [EVENTS.RoundStart]: () => void;
  [EVENTS.Action]: (p: ActionPayload) => void;
  [EVENTS.CountRequest]: () => void;
  [EVENTS.NextHand]: () => void;
}

export interface ServerToClientEvents {
  [EVENTS.RoomJoined]: (p: RoomJoinedPayload) => void;
  [EVENTS.RoomState]: (p: RoomState) => void;
  [EVENTS.RoomError]: (p: RoomErrorPayload) => void;
  [EVENTS.CountReveal]: (p: CountReveal) => void;
}
