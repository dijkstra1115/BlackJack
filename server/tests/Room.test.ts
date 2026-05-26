import { describe, expect, it } from 'vitest';
import { Room, RoomError } from '../src/net/Room.js';
import { mulberry32 } from '../src/game/rng.js';
import type { Card } from '@blackjack/shared';

function fixedShoeRoom(stack: string[], startingChips = 1000) {
  const created = Room.create({
    id: 'TEST01',
    hostName: 'Alice',
    startingChips,
    rng: mulberry32(1),
  });
  // Force a known deal order.
  const cards: Card[] = stack.map((r) => ({ rank: r as Card['rank'], suit: '♠' }));
  created.room.shoe.setStack(cards);
  return created;
}

describe('Room creation', () => {
  it('starts in lobby with host as the only member', () => {
    const { room, host } = fixedShoeRoom([]);
    expect(room.phase).toBe('lobby');
    expect(room.hostId).toBe(host.playerId);
    expect(room.members.size).toBe(1);
    expect(room.seats.every(s => s === null)).toBe(true);
  });
});

describe('Room.join / leave', () => {
  it('adds and removes spectators', () => {
    const { room } = fixedShoeRoom([]);
    const { member } = room.join('Bob');
    expect(room.members.size).toBe(2);
    expect(room.getState().spectators).toHaveLength(2); // host is also a spectator (no seat)
    room.leave(member.playerId);
    expect(room.members.size).toBe(1);
  });

  it('host leaving promotes another member', () => {
    const { room, host } = fixedShoeRoom([]);
    const { member: bob } = room.join('Bob');
    room.leave(host.playerId);
    expect(room.hostId).toBe(bob.playerId);
  });
});

describe('Room.takeSeat', () => {
  it('rejects seat numbers outside 1..7', () => {
    const { room, host } = fixedShoeRoom([]);
    expect(() => room.takeSeat(host.playerId, 0)).toThrow(RoomError);
    expect(() => room.takeSeat(host.playerId, 8)).toThrow(RoomError);
  });

  it('rejects taking a seat that is already taken', () => {
    const { room, host } = fixedShoeRoom([]);
    const { member: bob } = room.join('Bob');
    room.takeSeat(host.playerId, 3);
    expect(() => room.takeSeat(bob.playerId, 3)).toThrow(/seat_taken/);
  });

  it('rejects taking a second seat without standing up', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 3);
    expect(() => room.takeSeat(host.playerId, 4)).toThrow(/already_seated/);
  });

  it('moves to betting phase when first player sits', () => {
    const { room, host } = fixedShoeRoom([]);
    expect(room.phase).toBe('lobby');
    room.takeSeat(host.playerId, 1);
    expect(room.phase).toBe('betting');
  });

  it('returns to lobby when all players stand up', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 1);
    room.standUp(host.playerId);
    expect(room.phase).toBe('lobby');
  });
});

describe('Room.placeBet', () => {
  it('rejects negative or zero bets', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 1);
    expect(() => room.placeBet(host.playerId, 0)).toThrow(/bet_invalid/);
    expect(() => room.placeBet(host.playerId, -10)).toThrow(/bet_invalid/);
  });

  it('rejects bets larger than chip stack', () => {
    const { room, host } = fixedShoeRoom([], 100);
    room.takeSeat(host.playerId, 1);
    expect(() => room.placeBet(host.playerId, 101)).toThrow(/bet_too_large/);
  });

  it('rejects bets from a spectator', () => {
    const { room, host } = fixedShoeRoom([]);
    expect(() => room.placeBet(host.playerId, 10)).toThrow(/phase_wrong/);
  });

  it('lets a player re-bet before the round starts', () => {
    const { room, host } = fixedShoeRoom([], 1000);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.placeBet(host.playerId, 100); // replace
    const m = room.members.get(host.playerId)!;
    expect(m.player!.chips).toBe(900);
    expect(m.player!.hands[0]!.bet).toBe(100);
  });
});

describe('Room.startRound', () => {
  it('only the host can start', () => {
    const { room, host } = fixedShoeRoom(['10','10','7','9','9']);
    const { member: bob } = room.join('Bob');
    room.takeSeat(host.playerId, 1);
    room.takeSeat(bob.playerId, 2);
    room.placeBet(host.playerId, 50);
    room.placeBet(bob.playerId, 50);
    expect(() => room.startRound(bob.playerId)).toThrow(/not_host/);
  });

  it('refuses to start if no one has bet', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 1);
    expect(() => room.startRound(host.playerId)).toThrow(/no_bets/);
  });

  it('enters playing phase after dealing', () => {
    // P1=10,9=19. Dealer=10,7=17. No BJ.
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId);
    expect(room.phase).toBe('playing');
    expect(room.round?.currentTurn?.playerId).toBe(host.playerId);
  });
});

describe('Room.performAction', () => {
  it('walks through actions and moves to between when settled', () => {
    // P1=10,9=19. Dealer up=10, hole=7 → 17 S17 stops.
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId);
    room.performAction(host.playerId, 'stand');
    expect(room.phase).toBe('between');
    expect(room.lastResults).toHaveLength(1);
    expect(room.lastResults[0]!.result.outcome).toBe('win');
  });

  it('rejects out-of-turn actions', () => {
    // P1=10,9 P2=8,8 Dealer=7,10 = 17 S17.
    const { room, host } = fixedShoeRoom(['10','8','7','9','8','10']);
    const { member: bob } = room.join('Bob');
    room.takeSeat(host.playerId, 1);
    room.takeSeat(bob.playerId, 2);
    room.placeBet(host.playerId, 50);
    room.placeBet(bob.playerId, 50);
    room.startRound(host.playerId);
    expect(() => room.performAction(bob.playerId, 'stand')).toThrow(/not_your_turn/);
  });

  it('rejects actions when not in playing phase', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 1);
    expect(() => room.performAction(host.playerId, 'stand')).toThrow(/phase_wrong/);
  });
});

describe('Room.nextHand', () => {
  it('returns to betting and clears hasBet', () => {
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId);
    room.performAction(host.playerId, 'stand');
    expect(room.phase).toBe('between');
    room.nextHand();
    expect(room.phase).toBe('betting');
    expect(room.members.get(host.playerId)!.hasBet).toBe(false);
  });

  it('throws if no completed hand', () => {
    const { room, host } = fixedShoeRoom([]);
    room.takeSeat(host.playerId, 1);
    expect(() => room.nextHand()).toThrow(/phase_wrong/);
  });
});

describe('Room.revealCount', () => {
  it('does not appear in getState by default', () => {
    const { room, host } = fixedShoeRoom(['5','5','5','5']);
    room.takeSeat(host.playerId, 1);
    expect(room.getState().counts).toBeUndefined();
  });

  it('returns running and true count on demand', () => {
    const { room, host } = fixedShoeRoom(['5','5','5','5']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId); // deals 4 cards: 5,5,5,(hole)5
    // Up-card 5 has been revealed; the other player card 5 and hole 5 — hole hidden, others revealed.
    // Three 5s revealed → +3.
    const reveal = room.revealCount();
    expect(reveal.runningCount).toBe(3);
    expect(reveal.trueCount).toBeGreaterThan(0);
  });
});

describe('Room view: dealer hole card hidden', () => {
  it('only up-card visible in dealer view before reveal', () => {
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId);
    const state = room.getState();
    expect(state.dealer!.holeCardRevealed).toBe(false);
    expect(state.dealer!.cards).toHaveLength(1);
    expect(state.dealer!.cards[0]!.rank).toBe('10');
  });

  it('full dealer hand visible after settlement', () => {
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    room.placeBet(host.playerId, 50);
    room.startRound(host.playerId);
    room.performAction(host.playerId, 'stand');
    const state = room.getState();
    expect(state.dealer!.holeCardRevealed).toBe(true);
    expect(state.dealer!.cards).toHaveLength(2);
  });
});

describe('Room reshuffle between hands', () => {
  it('reshuffles the shoe at the start of a new round when penetration crossed', () => {
    const { room, host } = fixedShoeRoom(['10','10','9','7']);
    room.takeSeat(host.playerId, 1);
    // Reshuffle to a full shoe (we replaced the stack in fixedShoeRoom),
    // then burn past the 75% penetration cut.
    room.shoe.shuffle();
    const cut = Math.ceil(room.shoe.totalCards * 0.75);
    for (let i = 0; i < cut + 4; i++) room.shoe.draw();
    expect(room.shoe.needsReshuffle()).toBe(true);
    const dealtBefore = room.shoe.dealtCount;
    room.placeBet(host.playerId, 10);
    room.startRound(host.playerId);
    // After reshuffle, dealtCount restarts then grows by the deal (4 cards for 1 player).
    expect(room.shoe.dealtCount).toBeLessThan(dealtBefore);
  });
});
