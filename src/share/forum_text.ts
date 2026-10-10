// A hand as the plain text people paste into TwoPlusTwo / Reddit hand
// discussions — the layout of the classic 2+2 hand converter: a stack list
// by position, one line per street with the pot at the start of it, folds
// collapsed ("3 folds"), and a result block. Cards use letters (Ah Kd) so the
// text survives every forum's formatting. Pure, unit-tested.

import { Card, Hand, Player } from '../model';
import { walkHand, HandWalk, WalkedAction, WalkedStreet, usd2, usdShort } from './hand_walk';
import { describeBest } from './hand_rank';

export interface ForumTextOptions {
  // Append "captured with WebPokerHud" as the last line (default true).
  footer?: boolean;
  // Render suits as ♠♥♦♣ instead of s/h/d/c (default letters).
  suitSymbols?: boolean;
}

export const FORUM_FOOTER = 'captured with WebPokerHud (webpokerhud.com)';

const STREET_LABEL = { preflop: 'Pre Flop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;
const SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

function cardText(cards: readonly Card[], symbols: boolean): string {
  return cards.map(c => (symbols ? c[0] + SYMBOL[c[1]!] : c)).join(' ');
}

// "Hero" for the hero; the position otherwise; "Seat N" when unknown.
function nameOf(walk: HandWalk, p: Player): string {
  if (p.isHero) return 'Hero';
  return walk.positions.get(p.seat) ?? `Seat ${p.seat}`;
}

function actionText(walk: HandWalk, w: WalkedAction): string {
  const name = nameOf(walk, w.player);
  const allIn = w.allIn ? ' (all-in)' : '';
  switch (w.kind) {
    case 'post':  return `${name} posts ${usdShort(w.amount)}`;
    case 'fold':  return `${name} folds`;
    case 'check': return `${name} checks`;
    case 'call':  return `${name} calls ${usdShort(w.amount)}${allIn}`;
    case 'bet':   return `${name} bets ${usdShort(w.amount)}${allIn}`;
    case 'raise': return `${name} raises to ${usdShort(w.amount)}${allIn}`;
    case 'show':  return `${name} shows`;
    case 'muck':  return `${name} mucks`;
  }
}

// Join a street's actions, collapsing runs of folds by non-hero players.
function actionLine(walk: HandWalk, actions: WalkedAction[]): string {
  const parts: string[] = [];
  let folds = 0;
  const flush = () => {
    if (folds === 0) return;
    parts.push(folds === 1 ? parts.pop()! : `${folds} folds`);
    folds = 0;
  };
  for (const w of actions) {
    if (w.kind === 'show' || w.kind === 'muck') continue;   // rendered in the result block
    if (w.kind === 'fold' && !w.player.isHero) {
      folds++;
      if (folds === 1) parts.push(actionText(walk, w));     // kept if it stays a single fold
      else if (folds === 2) parts.pop();
      continue;
    }
    flush();
    parts.push(actionText(walk, w));
  }
  flush();
  return parts.join(', ');
}

function streetBlock(walk: HandWalk, s: WalkedStreet, symbols: boolean): string[] {
  const lines: string[] = [];
  const n = s.players.length;
  if (s.street === 'preflop') {
    const hero = walk.hero;
    const heroPart = hero && hero.cards?.length
      ? ` Hero is ${walk.positions.get(hero.seat) ?? `Seat ${hero.seat}`} with ${cardText(hero.cards, symbols)}`
      : '';
    lines.push(`${STREET_LABEL.preflop}: (${usdShort(s.potBefore)})${heroPart}`);
  } else {
    const shown = s.street === 'flop' ? s.board : s.board.slice(-1);
    const allIn = s.actions.length === 0 && n >= 2 ? ' - all in' : '';
    lines.push(`${STREET_LABEL[s.street]}: (${usdShort(s.potBefore)}) ${cardText(shown, symbols)} (${n} player${n === 1 ? '' : 's'}${allIn})`);
  }
  // Blind posts beyond the SB/BB (a joining player's post) lead the preflop line.
  const extra = s.street === 'preflop'
    ? walk.blinds.slice(2).map(b => actionText(walk, b)) : [];
  const acts = actionLine(walk, s.actions);
  const line = [...extra, acts].filter(Boolean).join(', ');
  if (line) lines.push(line);
  return lines;
}

export function forumHandText(hand: Hand, opts: ForumTextOptions = {}): string {
  const symbols = opts.suitSymbols ?? false;
  const walk = walkHand(hand);
  const out: string[] = [];

  const game = hand.gameType === 'plo' ? 'Pot Limit Omaha' : "No Limit Hold'em";
  out.push(`Bovada $${(hand.stakes.sb / 100).toFixed(2)}/$${(hand.stakes.bb / 100).toFixed(2)} ${game} - ${walk.players.length} players`);
  out.push('');
  for (const p of walk.players) {
    const pos = walk.positions.get(p.seat);
    const label = p.isHero ? `Hero${pos ? ` (${pos})` : ''}` : (pos ?? `Seat ${p.seat}`);
    out.push(`${label}: ${usd2(p.startStack)}`);
  }

  for (const s of walk.streets) {
    out.push('');
    out.push(...streetBlock(walk, s, symbols));
  }

  out.push('');
  out.push(`Final Pot: ${usd2(hand.totalPot)}`);
  if (walk.showdown) {
    const last = walk.streets[walk.streets.length - 1];
    const alive = last ? last.players.filter(p => !foldedOn(walk, last, p)) : [];
    for (const p of alive) {
      if (p.cards && p.cards.length > 0) {
        const desc = describeBest([...p.cards, ...hand.board]);
        out.push(`${nameOf(walk, p)} shows ${cardText(p.cards, symbols)}${desc ? ` (${desc})` : ''}`);
      } else {
        out.push(`${nameOf(walk, p)} mucks`);
      }
    }
  }
  for (const w of walk.winners) out.push(`${nameOf(walk, w.player)} wins ${usd2(w.amount)}`);
  if (hand.rake > 0) out.push(`(Rake: ${usd2(hand.rake)})`);

  if (opts.footer ?? true) {
    out.push('');
    out.push(FORUM_FOOTER);
  }
  return out.join('\n') + '\n';
}

function foldedOn(walk: HandWalk, s: WalkedStreet, p: Player): boolean {
  return s.actions.some(w => w.kind === 'fold' && w.player.playerId === p.playerId)
    || walk.hand.actions.some(a => a.type === 'fold' && a.playerId === p.playerId);
}
