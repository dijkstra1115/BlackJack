/**
 * Demo script — exercises the pure domain layer end-to-end against a real
 * (seeded) 8-deck shoe. Prints per-hand outcomes plus the running and true
 * counts so the developer can sanity-check shuffle, dealing, S17, 3:2 BJ
 * payouts, and Hi-Lo math without spinning up a UI.
 *
 *   npm run demo
 */
import { cardLabel } from './game/Card.js';
import { snapshot } from './game/CountingSystem.js';
import { Player } from './game/Player.js';
import { Round } from './game/Round.js';
import { mulberry32 } from './game/rng.js';
import { Shoe } from './game/Shoe.js';

const SEED = 20260526;
const NUM_HANDS = 10;
const STARTING_CHIPS = 1000;
const FLAT_BET = 50;

const shoe = new Shoe({ rng: mulberry32(SEED) });
const players = [
  new Player('alice', 1, STARTING_CHIPS),
  new Player('bob', 3, STARTING_CHIPS),
  new Player('carol', 5, STARTING_CHIPS),
];

console.log('=== Blackjack training-sim demo ===');
console.log(`seed=${SEED}  hands=${NUM_HANDS}  starting chips=${STARTING_CHIPS}  bet=${FLAT_BET}`);
console.log();

for (let hand = 1; hand <= NUM_HANDS; hand++) {
  // Reshuffle between hands if needed
  if (shoe.needsReshuffle()) {
    console.log(`  ↻ Reshuffle triggered (dealt ${shoe.dealtCount}/${shoe.totalCards}, penetration met)`);
    shoe.shuffle();
  }

  const round = new Round({ shoe, players });
  for (const p of players) round.placeBet(p.id, FLAT_BET);
  round.startDeal();

  // Naive auto-play: every player stands. Good enough for sanity output.
  while (round.phase === 'playerAction') round.forceStand();

  const dealerCards = round.dealer.hand.cards.map(cardLabel).join(' ');
  const dealerTotal = round.dealer.hand.total().value;
  console.log(`Hand ${String(hand).padStart(2)}  dealer ${dealerCards} (${dealerTotal})`);
  for (const r of round.results) {
    const p = players.find(x => x.id === r.playerId)!;
    const hand = p.hands[r.handIndex]!;
    const cards = hand.cards.map(cardLabel).join(' ');
    const total = hand.total().value;
    const sign = r.result.payout >= 0 ? '+' : '';
    console.log(
      `  ${p.id.padEnd(6)} seat${p.seat}  ${cards.padEnd(14)} (${String(total).padStart(2)})  ` +
      `${r.result.outcome.padEnd(10)}  ${sign}${r.result.payout}  chips=${r.chipsAfter}`,
    );
  }
  const snap = snapshot(shoe);
  console.log(
    `  shoe: dealt ${shoe.dealtCount}/${shoe.totalCards}  ` +
    `RC=${snap.runningCount}  TC=${snap.trueCount}  ` +
    `decks≈${snap.remainingDecks}`,
  );
  console.log();
}

console.log('Final chips:');
for (const p of players) console.log(`  ${p.id.padEnd(6)} ${p.chips}`);
