// Hands in the PokerStars hand-history text format, the lingua franca every
// tracker imports (PokerTracker 4, Hand2Note, Holdem Manager, Flopzilla,
// GTO trainers). Bovada's own histories arrive a day late in a format few
// tools read; this turns the locally captured hands into files those tools
// take as-is. The hero is "Hero", opponents "Player<seat>" (Bovada tables are
// anonymous, so a seat is all the identity there is). Pure, unit-tested.
//
// Reference shape (cash game):
//   PokerStars Hand #123:  Hold'em No Limit ($0.05/$0.10 USD) - 2026/07/17 21:32:37 ET [2026/07/17 21:32:37 ET]
//   Table 'Bovada 37417367' 9-max Seat #4 is the button
//   Seat 4: Player4 ($12.97 in chips)
//   …
//   *** HOLE CARDS ***
//   Dealt to Hero [2h 6h]
//   …
//   *** SUMMARY ***
//   Total pot $0.40 | Rake $0.02

import { Card, Hand, Player } from '../model';
import { walkHand, HandWalk, WalkedAction, WalkedStreet, BETTING_ORDER, usd2, formatStamp } from './hand_walk';
import { describeBest } from './hand_rank';

export interface PokerStarsOptions {
  // IANA zone for the header timestamp; the label after it says which.
  // PokerStars histories are in ET, which is what importers default to.
  timeZone?: string;
  tzLabel?:  string;
}

const cards = (cs: readonly Card[]) => `[${cs.join(' ')}]`;

function nameOf(p: Player): string {
  return p.isHero ? 'Hero' : `Player${p.seat}`;
}

function blindLine(walk: HandWalk, w: WalkedAction, idx: number): string {
  const { sb, bb } = walk.hand.stakes;
  const name = nameOf(w.player);
  if (idx === 0 && w.action.type === 'post_sb') return `${name}: posts small blind ${usd2(w.amount)}`;
  if (w.action.type === 'post_bb' || w.amount === bb) return `${name}: posts big blind ${usd2(w.amount)}`;
  if (w.amount === sb) return `${name}: posts small blind ${usd2(w.amount)}`;
  return `${name}: posts small & big blinds ${usd2(w.amount)}`;
}

function actionLine(w: WalkedAction): string | null {
  const name = nameOf(w.player);
  const allIn = w.allIn ? ' and is all-in' : '';
  switch (w.kind) {
    case 'fold':  return `${name}: folds`;
    case 'check': return `${name}: checks`;
    case 'call':  return `${name}: calls ${usd2(w.amount)}${allIn}`;
    case 'bet':   return `${name}: bets ${usd2(w.amount)}${allIn}`;
    case 'raise': return `${name}: raises ${usd2(w.raiseBy)} to ${usd2(w.amount)}${allIn}`;
    default:      return null;   // posts/shows/mucks are emitted elsewhere
  }
}

function streetHeader(s: WalkedStreet, board: Card[]): string | null {
  switch (s.street) {
    case 'flop':  return `*** FLOP *** ${cards(board.slice(0, 3))}`;
    case 'turn':  return `*** TURN *** ${cards(board.slice(0, 3))} ${cards(board.slice(3, 4))}`;
    case 'river': return `*** RIVER *** ${cards(board.slice(0, 4))} ${cards(board.slice(4, 5))}`;
    default:      return null;
  }
}

const STREET_NAME = { preflop: 'Flop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;

function foldStreet(walk: HandWalk, p: Player): WalkedStreet | null {
  for (const s of walk.streets) {
    if (s.actions.some(w => w.kind === 'fold' && w.player.playerId === p.playerId)) return s;
  }
  return null;
}

function seatTags(walk: HandWalk, p: Player): string {
  const tags: string[] = [];
  if (p.seat === walk.hand.dealerSeat) tags.push('(button)');
  const sb = walk.blinds[0];
  const bb = walk.blinds[1];
  if (sb && sb.action.type === 'post_sb' && sb.player.playerId === p.playerId) tags.push('(small blind)');
  if (bb && bb.action.type === 'post_bb' && bb.player.playerId === p.playerId) tags.push('(big blind)');
  return tags.length ? ' ' + tags.join(' ') : '';
}

// One hand. Null when the record has no dealt-in players (nothing to say).
export function pokerStarsHandText(hand: Hand, opts: PokerStarsOptions = {}): string | null {
  if (hand.players.length === 0) return null;
  const tz = opts.timeZone ?? 'America/New_York';
  const label = opts.tzLabel ?? 'ET';
  const walk = walkHand(hand);
  const out: string[] = [];
  const { sb, bb } = hand.stakes;

  const game = hand.gameType === 'plo' ? 'Omaha Pot Limit' : "Hold'em No Limit";
  const id = hand.handId.replace(/\D/g, '') || hand.handId;
  // PokerStars writes the time twice — local, then ET in brackets — and the
  // strict parsers key on the bracketed form. Both are ET here.
  const stamp = `${formatStamp(hand.timestamp, tz)} ${label}`;
  out.push(`PokerStars Hand #${id}:  ${game} ($${(sb / 100).toFixed(2)}/$${(bb / 100).toFixed(2)} USD) - ${stamp} [${stamp}]`);
  out.push(`Table 'Bovada ${hand.tableId}' ${hand.maxSeats}-max Seat #${hand.dealerSeat} is the button`);
  for (const p of walk.players) out.push(`Seat ${p.seat}: ${nameOf(p)} (${usd2(p.startStack)} in chips)`);
  walk.blinds.forEach((b, i) => out.push(blindLine(walk, b, i)));

  out.push('*** HOLE CARDS ***');
  if (walk.hero?.cards?.length) out.push(`Dealt to Hero ${cards(walk.hero.cards)}`);

  for (const s of walk.streets) {
    const header = streetHeader(s, hand.board);
    if (header) out.push(header);
    for (const w of s.actions) {
      const line = actionLine(w);
      if (line) out.push(line);
    }
    // The refund is announced the moment betting ends, before any run-out.
    if (walk.uncalled && s.street === walk.lastBetting) {
      out.push(`Uncalled bet (${usd2(walk.uncalled.amount)}) returned to ${nameOf(walk.uncalled.player)}`);
    }
  }

  const last = walk.streets[walk.streets.length - 1];
  const folded = (p: Player) => foldStreet(walk, p) !== null;
  const alive = walk.players.filter(p => !folded(p));
  const descOf = (p: Player) => (p.cards?.length ? describeBest([...p.cards, ...hand.board]) : null);

  if (walk.showdown && last) {
    out.push('*** SHOW DOWN ***');
    for (const p of alive) {
      if (p.cards?.length) {
        const d = descOf(p);
        out.push(`${nameOf(p)}: shows ${cards(p.cards)}${d ? ` (${d})` : ''}`);
      } else {
        out.push(`${nameOf(p)}: mucks hand`);
      }
    }
    for (const w of walk.winners) out.push(`${nameOf(w.player)} collected ${usd2(w.amount)} from pot`);
  } else {
    for (const w of walk.winners) {
      out.push(`${nameOf(w.player)} collected ${usd2(w.amount)} from pot`);
      out.push(`${nameOf(w.player)}: doesn't show hand`);
    }
  }

  out.push('*** SUMMARY ***');
  out.push(`Total pot ${usd2(hand.totalPot)} | Rake ${usd2(hand.rake)}`);
  if (hand.board.length > 0) out.push(`Board ${cards(hand.board)}`);
  const won = new Map(walk.winners.map(w => [w.player.playerId, w.amount]));
  for (const p of walk.players) {
    const head = `Seat ${p.seat}: ${nameOf(p)}${seatTags(walk, p)}`;
    const fs = foldStreet(walk, p);
    if (fs) {
      const idx = BETTING_ORDER.indexOf(fs.street);
      const invested = hand.actions.some(a => a.playerId === p.playerId && a.amount > 0);
      out.push(idx === 0
        ? `${head} folded before Flop${invested ? '' : " (didn't bet)"}`
        : `${head} folded on the ${STREET_NAME[fs.street]}`);
      continue;
    }
    const amount = won.get(p.playerId);
    if (walk.showdown) {
      if (p.cards?.length) {
        const d = descOf(p);
        out.push(amount !== undefined
          ? `${head} showed ${cards(p.cards)} and won (${usd2(amount)})${d ? ` with ${d}` : ''}`
          : `${head} showed ${cards(p.cards)} and lost${d ? ` with ${d}` : ''}`);
      } else {
        out.push(amount !== undefined ? `${head} collected (${usd2(amount)})` : `${head} mucked`);
      }
    } else {
      out.push(amount !== undefined ? `${head} collected (${usd2(amount)})` : `${head} folded before Flop (didn't bet)`);
    }
  }
  return out.join('\n') + '\n';
}

// Many hands → one importable file (hands separated by blank lines, the way
// PokerStars writes them). Hands with no dealt-in players are skipped.
export function pokerStarsFileText(hands: Hand[], opts: PokerStarsOptions = {}): string {
  const texts: string[] = [];
  for (const h of hands) {
    const t = pokerStarsHandText(h, opts);
    if (t) texts.push(t);
  }
  return texts.join('\n\n');
}
