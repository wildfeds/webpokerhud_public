// Print hero stats from exported JSONL hands.
// Usage: npx vite-node scripts/print_stats.ts [dir]
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hand } from '../src/model';
import { computeHeroStats } from '../src/analysis';

const dir = process.argv[2]
  ?? join(dirname(fileURLToPath(import.meta.url)), '../examples/hands_jsonl_objs');

const hands: Hand[] = readdirSync(dir)
  .filter(f => f.endsWith('.jsonl'))
  .flatMap(f => readFileSync(join(dir, f), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l) as Hand));

const heroId = hands.flatMap(h => h.players).find(p => p.isHero)?.playerId;
if (!heroId) throw new Error('no hero found in exported hands');

const s = computeHeroStats(hands, heroId);
const r = (x: number) => Math.round(x * 10) / 10;
const bb = hands[0]!.stakes.bb;

console.log(`hero          : ${heroId}`);
console.log(`hands played  : ${s.handsPlayed} (of ${hands.length} recorded)`);
console.log(`VPIP          : ${r(s.vpip)}%`);
console.log(`PFR           : ${r(s.pfr)}%`);
console.log(`3-bet         : ${r(s.threeBet)}%`);
console.log(`fold to 3-bet : ${r(s.foldTo3Bet)}%`);
console.log(`AF            : ${r(s.af)}  (pre ${r(s.afByStreet.preflop)} / flop ${r(s.afByStreet.flop)} / turn ${r(s.afByStreet.turn)} / river ${r(s.afByStreet.river)})`);
console.log(`WTSD          : ${r(s.wtsd)}%`);
console.log(`W$SD          : ${r(s.wsd)}%`);
console.log(`win rate      : ${r(s.winRate)} chips/hand  (${r((s.winRate / bb) * 100)} bb/100 at sb/bb ${hands[0]!.stakes.sb}/${bb})`);
