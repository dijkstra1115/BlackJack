import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createServer, type ServerHandles } from '../src/net/server.js';
import {
  EVENTS,
  type Card,
  type ClientToServerEvents,
  type CountReveal,
  type RoomErrorPayload,
  type RoomJoinedPayload,
  type RoomState,
  type ServerToClientEvents,
} from '@blackjack/shared';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const cardsOf = (ranks: string[]): Card[] =>
  ranks.map((r) => ({ rank: r as Card['rank'], suit: '♠' }));

function openClient(port: number): Client {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

/**
 * Wait for the next event of `event` on this socket. Resolves the payload.
 * Single-shot listener — attach BEFORE the emit that triggers it.
 */
function once<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    // Cast through unknown so the typed socket accepts the string literal at runtime.
    (socket as unknown as { once: (e: string, cb: (p: unknown) => void) => void })
      .once(event, (payload: unknown) => resolve(payload as never));
  });
}

/**
 * Wait until a RoomState arrives that matches `predicate`. State broadcasts
 * fire on every action so a plain "next state" can race with the previous
 * action's broadcast — predicate matching avoids the race.
 */
function awaitState(
  socket: Client,
  predicate: (s: RoomState) => boolean,
  timeoutMs = 3000,
): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(EVENTS.RoomState as 'room:state', handler);
      reject(new Error('awaitState: timed out waiting for matching state'));
    }, timeoutMs);
    const handler = (state: RoomState) => {
      if (predicate(state)) {
        clearTimeout(t);
        socket.off(EVENTS.RoomState as 'room:state', handler);
        resolve(state);
      }
    };
    socket.on(EVENTS.RoomState as 'room:state', handler);
  });
}

let handles: ServerHandles;
let port: number;

beforeEach(async () => {
  handles = createServer();
  const { port: bound } = await handles.listen(0); // ephemeral port
  port = bound;
});

afterEach(async () => {
  await handles.close();
});

describe('socket.io integration', () => {
  it('creates a room and lets a second client join + sit + bet + play', async () => {
    const alice = openClient(port);
    const bob = openClient(port);

    // Alice creates a room
    const aliceJoined = once(alice, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    alice.emit(EVENTS.RoomCreate as 'room:create', { hostName: 'Alice', startingChips: 1000 });
    const { roomId, playerId: aliceId } = await aliceJoined;

    // Stack the room's shoe for deterministic deal.
    // Deal order: P1c1, P2c1, Du, P1c2, P2c2, Dh
    // P1=10,9=19; P2=8,8; Dealer=10,7=17 S17.
    const room = handles.manager.require(roomId);
    room.shoe.setStack(cardsOf(['10', '8', '10', '9', '8', '7']));

    // Bob joins
    const bobJoined = once(bob, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    bob.emit(EVENTS.RoomJoin as 'room:join', { roomId, playerName: 'Bob' });
    const { playerId: bobId } = await bobJoined;

    // Alice sits at seat 1
    const aliceSat = awaitState(alice, (s) => s.seats[0]?.playerId === aliceId);
    alice.emit(EVENTS.SeatTake as 'seat:take', { seat: 1 });
    let state = await aliceSat;
    expect(state.phase).toBe('betting');

    // Bob sits at seat 2
    const bobSat = awaitState(bob, (s) => s.seats[1]?.playerId === bobId);
    bob.emit(EVENTS.SeatTake as 'seat:take', { seat: 2 });
    state = await bobSat;
    expect(state.seats[1]?.playerId).toBe(bobId);

    // Alice bets 100, Bob bets 50
    const aliceBetSeen = awaitState(bob, (s) => s.seats[0]?.hasBet === true);
    alice.emit(EVENTS.BetPlace as 'bet:place', { amount: 100 });
    await aliceBetSeen;

    const bothBet = awaitState(alice, (s) => !!s.seats[0]?.hasBet && !!s.seats[1]?.hasBet);
    bob.emit(EVENTS.BetPlace as 'bet:place', { amount: 50 });
    state = await bothBet;
    expect(state.seats[0]?.hasBet).toBe(true);
    expect(state.seats[1]?.hasBet).toBe(true);

    // Host starts round
    const dealt = awaitState(bob, (s) => s.phase === 'playing');
    alice.emit(EVENTS.RoundStart as 'round:start');
    state = await dealt;
    expect(state.currentTurn?.playerId).toBe(aliceId);
    expect(state.dealer?.holeCardRevealed).toBe(false);
    expect(state.dealer?.cards.length).toBe(1);

    // Alice stands → Bob's turn
    const bobsTurn = awaitState(bob, (s) => s.currentTurn?.playerId === bobId);
    alice.emit(EVENTS.Action as 'action', { action: 'stand' });
    state = await bobsTurn;
    expect(state.currentTurn?.playerId).toBe(bobId);

    // Bob stands → settled / between
    const settled = awaitState(alice, (s) => s.phase === 'between');
    bob.emit(EVENTS.Action as 'action', { action: 'stand' });
    state = await settled;
    expect(state.dealer?.holeCardRevealed).toBe(true);
    expect(state.lastResults).toHaveLength(2);
    const aliceResult = state.lastResults.find(r => r.playerId === aliceId)!;
    const bobResult = state.lastResults.find(r => r.playerId === bobId)!;
    expect(aliceResult.outcome).toBe('win');
    expect(bobResult.outcome).toBe('lose');

    alice.disconnect();
    bob.disconnect();
  }, 10_000);

  it('count is hidden in state, but reveal returns running + true count on request', async () => {
    const alice = openClient(port);
    const aliceJoined = once(alice, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    alice.emit(EVENTS.RoomCreate as 'room:create', { hostName: 'Alice' });
    const { roomId } = await aliceJoined;

    handles.manager.require(roomId).shoe.setStack(cardsOf(['5', '5', '5', '5']));

    const sat = awaitState(alice, (s) => s.seats[0] !== null);
    alice.emit(EVENTS.SeatTake as 'seat:take', { seat: 1 });
    await sat;

    const bet = awaitState(alice, (s) => s.seats[0]?.hasBet === true);
    alice.emit(EVENTS.BetPlace as 'bet:place', { amount: 25 });
    const afterBet = await bet;
    expect(afterBet.counts).toBeUndefined();

    const played = awaitState(alice, (s) => s.phase === 'playing');
    alice.emit(EVENTS.RoundStart as 'round:start');
    const afterDeal = await played;
    expect(afterDeal.counts).toBeUndefined();

    const revealPromise = once(alice, EVENTS.CountReveal as 'count:reveal') as Promise<CountReveal>;
    alice.emit(EVENTS.CountRequest as 'count:request');
    const reveal = await revealPromise;
    // Three 5s revealed (P1's two cards + up-card), hole hidden → +3.
    expect(reveal.runningCount).toBe(3);
    expect(reveal.trueCount).toBeGreaterThan(0);

    alice.disconnect();
  }, 10_000);

  it('reports RoomError when a spectator tries to bet', async () => {
    const alice = openClient(port);
    const bob = openClient(port);

    const aliceJoined = once(alice, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    alice.emit(EVENTS.RoomCreate as 'room:create', { hostName: 'Alice' });
    const { roomId } = await aliceJoined;

    const bobJoined = once(bob, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    bob.emit(EVENTS.RoomJoin as 'room:join', { roomId, playerName: 'Bob' });
    await bobJoined;

    // Alice sits — room goes into betting phase. Bob remains a spectator.
    const aliceSat = awaitState(alice, (s) => s.phase === 'betting');
    alice.emit(EVENTS.SeatTake as 'seat:take', { seat: 1 });
    await aliceSat;

    // Bob (spectator) tries to bet → should get 'not_seated' (phase is now 'betting')
    const errPromise = once(bob, EVENTS.RoomError as 'room:error') as Promise<RoomErrorPayload>;
    bob.emit(EVENTS.BetPlace as 'bet:place', { amount: 50 });
    const err = await errPromise;
    expect(err.code).toBe('not_seated');

    alice.disconnect();
    bob.disconnect();
  }, 10_000);

  it('rejects joining a non-existent room', async () => {
    const bob = openClient(port);
    const errPromise = once(bob, EVENTS.RoomError as 'room:error') as Promise<RoomErrorPayload>;
    bob.emit(EVENTS.RoomJoin as 'room:join', { roomId: 'NOPE99', playerName: 'Bob' });
    const err = await errPromise;
    expect(err.code).toBe('room_not_found');
    bob.disconnect();
  }, 10_000);

  it('disconnect removes the player and cleans up empty room', async () => {
    const alice = openClient(port);
    const aliceJoined = once(alice, EVENTS.RoomJoined as 'room:joined') as Promise<RoomJoinedPayload>;
    alice.emit(EVENTS.RoomCreate as 'room:create', { hostName: 'Alice' });
    const { roomId } = await aliceJoined;

    expect(handles.manager.get(roomId)).toBeDefined();
    alice.disconnect();
    // Give the disconnect handler a tick to fire.
    await new Promise((r) => setTimeout(r, 100));
    expect(handles.manager.get(roomId)).toBeUndefined();
  }, 10_000);
});
