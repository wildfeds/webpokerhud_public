// Shadow-DOM HUD panel injected into the poker game frame.
// Rendering only — data arrives via setStats / setSeatStats / setLive.
import { HeroStats, SeatSessionStats } from '../analysis';
import { Card, GameState } from '../model';
import {
  statLines, sessionLine, liveInfo, isHandLive, cardLabel, cardColor,
  formatChips, formatUsd, potOdds,
} from './format';
import { StallState, stallMessage } from './stall';

const PANEL_CSS = `
  :host { all: initial; }
  .panel {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    min-width: 210px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(26, 26, 46, 0.92);
    color: #e0e0e0;
    font: 12px/1.5 system-ui, sans-serif;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    user-select: none;
  }
  .title { font-weight: 600; color: #fff; margin-bottom: 4px; }
  .section { border-top: 1px solid rgba(255, 255, 255, 0.15); margin-top: 6px; padding-top: 6px; }
  .label { color: #8a8aa8; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .muted { color: #aaa; }
  .cards span { font-weight: 600; margin-right: 4px; }
  .pot { color: #ffd479; }
  .odds { color: #f0a860; }
  .stall {
    margin: 0 0 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255, 107, 107, 0.18);
    border: 1px solid rgba(255, 107, 107, 0.6);
    color: #ffd0d0;
    font-weight: 600;
    line-height: 1.35;
  }
  .stall.idle { background: rgba(240, 168, 96, 0.16); border-color: rgba(240, 168, 96, 0.6); color: #ffe2bf; }
  .stall .hint { display: block; font-weight: 400; color: #e0e0e0; margin-top: 2px; }
`;

export class HudPanel {
  private host: HTMLElement;
  private statsEl: HTMLElement;
  private sessionEl: HTMLElement;
  private seatsEl: HTMLElement;
  private liveEl: HTMLElement;
  private stallEl: HTMLElement;

  constructor(doc: Document) {
    this.host = doc.createElement('div');
    const root = this.host.attachShadow({ mode: 'closed' });

    const style = doc.createElement('style');
    style.textContent = PANEL_CSS;
    root.appendChild(style);

    const panel = el(doc, 'div', 'panel');
    panel.appendChild(el(doc, 'div', 'title', 'WebPokerHud'));
    this.stallEl   = panel.appendChild(el(doc, 'div', 'stall'));
    this.stallEl.hidden = true;
    this.statsEl   = panel.appendChild(el(doc, 'div'));
    this.sessionEl = panel.appendChild(el(doc, 'div', 'section'));
    this.seatsEl   = panel.appendChild(el(doc, 'div', 'section'));
    this.seatsEl.hidden = true;
    this.liveEl    = panel.appendChild(el(doc, 'div', 'section'));
    root.appendChild(panel);

    this.setStats(null, null);
    (doc.body ?? doc.documentElement).appendChild(this.host);
  }

  setStats(lifetime: HeroStats | null, session: HeroStats | null): void {
    clear(this.statsEl);
    if (lifetime && lifetime.handsPlayed > 0) {
      for (const line of statLines(lifetime)) {
        this.statsEl.appendChild(el(document, 'div', undefined, line));
      }
    } else {
      this.statsEl.appendChild(el(document, 'div', 'muted', 'no hands recorded yet'));
    }

    clear(this.sessionEl);
    this.sessionEl.appendChild(el(document, 'div', 'label', 'session'));
    this.sessionEl.appendChild(el(document, 'div', undefined, sessionLine(session)));
  }

  // Session-scoped per-seat reads (43); hidden until any opponent seat has data.
  setSeatStats(rows: SeatSessionStats[]): void {
    clear(this.seatsEl);
    this.seatsEl.hidden = rows.length === 0;
    if (rows.length === 0) return;
    this.seatsEl.appendChild(el(document, 'div', 'label', 'seats · vpip/pfr · af (hands)'));
    const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
    for (const r of rows) {
      this.seatsEl.appendChild(el(document, 'div', undefined,
        `S${r.seat} · ${r1(r.vpip)}/${r1(r.pfr)} · ${r1(r.af)} (${r.hands})`));
    }
  }

  setLive(gs: GameState): void {
    clear(this.liveEl);
    this.liveEl.appendChild(el(document, 'div', 'label', 'live'));
    if (!isHandLive(gs)) {
      this.liveEl.appendChild(el(document, 'div', 'muted', 'waiting for a hand'));
      return;
    }

    const info = liveInfo(gs);
    const header = el(document, 'div');
    header.append(`${info.street} · pot `);
    header.appendChild(el(document, 'span', 'pot', formatChips(info.pot).replace('+', '')));
    this.liveEl.appendChild(header);

    if (info.board.length > 0) this.liveEl.appendChild(cardRow(info.board));
    if (info.heroCards.length > 0) {
      const row = el(document, 'div', 'cards');
      row.append('you: ');
      appendCards(row, info.heroCards);
      this.liveEl.appendChild(row);
    }

    // Pot odds when facing a bet (37).
    const odds = potOdds(gs);
    if (odds) {
      this.liveEl.appendChild(el(document, 'div', 'odds',
        `call ${formatUsd(odds.toCall)} into ${formatUsd(odds.pot)} → ${Math.round(odds.equityPct)}% needed`));
    }
  }

  // Capture-stall strip (BF-009): visible while the feed looks dead, with
  // the one remedy that works — reloading the table tab. Null clears it.
  setStall(state: StallState | null): void {
    if (!state) {
      this.stallEl.hidden = true;
      return;
    }
    clear(this.stallEl);
    this.stallEl.className = `stall ${state.kind}`;
    this.stallEl.append(`⚠ ${state.kind === 'mid_hand' ? 'Capture stalled' : 'Table quiet'}`);
    this.stallEl.appendChild(el(document, 'span', 'hint', stallMessage(state)));
    this.stallEl.hidden = false;
  }

  setVisible(visible: boolean): void {
    this.host.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    this.host.remove();
  }
}

function el(doc: Document, tag: string, className?: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node: HTMLElement): void {
  while (node.firstChild) node.firstChild.remove();
}

function cardRow(cards: Card[]): HTMLElement {
  const row = el(document, 'div', 'cards');
  appendCards(row, cards);
  return row;
}

function appendCards(row: HTMLElement, cards: Card[]): void {
  for (const card of cards) {
    const span = el(document, 'span', undefined, cardLabel(card));
    span.style.color = cardColor(card);
    row.appendChild(span);
  }
}
