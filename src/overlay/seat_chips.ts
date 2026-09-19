// Per-seat stat chips anchored to Bovada's table art (Enhancement P3a v2).
// Each occupied opponent seat gets a small chip below its avatar showing the
// session-scoped VPIP/PFR · AF (hands) from computeSeatSessionStats.
//
// Layout model (see design.md, "P3a v2"): each table runs in its own iframe,
// so every question reduces to this frame's viewport. The table scene keeps a
// fixed design aspect ratio inside the frame (letterboxed, centred); avatar
// positions are fractions of that content rect, measured from live
// screenshots; and Bovada always draws the hero at the south anchor, with
// seat numbers increasing clockwise and wrapping at maxSeats.
import { SeatSessionStats } from '../analysis';

// Scene model, calibrated across quarter-tile (844×547) and half-width
// full-height (1040×1035) layouts (BUGFIXES.md BF-004): the table scene
// scales uniformly by min(frameW/SCENE_W, frameH/SCENE_H), is anchored LEFT
// horizontally (the chat sidebar consumes the remaining width), and is
// centred VERTICALLY in any leftover height. Anchors below are avatar-pill
// centres in calibration pixels.
export const SCENE_W = 844;
export const SCENE_H = 547;

// Chip centre sits this many calibration px below the avatar-pill centre —
// far enough to clear the action banner (FOLD/BET/…) that Bovada renders
// directly under the pill (BF-005).
export const CHIP_Y_OFFSET_PX = 44;

// Avatar-pill centres (calibration px), listed by visual position clockwise
// from south (0 = hero). 9-max needs its own row measured before chips can
// show there — unknown sizes hide chips.
const ANCHOR_TABLES: Record<number, ReadonlyArray<{ x: number; y: number }>> = {
  6: [
    { x: 338, y: 366 },   // 0 — S (hero)
    { x: 83,  y: 318 },   // 1 — SW
    { x: 83,  y: 162 },   // 2 — NW
    { x: 338, y: 115 },   // 3 — N
    { x: 597, y: 162 },   // 4 — NE
    { x: 597, y: 318 },   // 5 — SE
  ],
};

export interface ChipPoint { x: number; y: number }

// Visual table size to lay chips out for. The protocol's maxSeat field reads
// 9 even on 6-max tables (it is the seat-array width, not the table size —
// the true signal is still being hunted; gameType2 is a candidate). Until
// decoded: use a measured layout when one exists for maxSeats, else fall back
// to the 6-max layout whenever the hero sits in its range — seats beyond the
// layout simply don't get a chip. null = no layout applies (chips hidden).
export function resolveLayoutSize(maxSeats: number, heroSeat: number): number | null {
  if (ANCHOR_TABLES[maxSeats]) return maxSeats;
  if (heroSeat >= 1 && heroSeat <= 6) return 6;
  return null;
}

// Uniform scene scale and vertical-centring offset for a frame.
export function sceneTransform(frameW: number, frameH: number): { scale: number; offsetY: number } {
  const scale = Math.min(frameW / SCENE_W, frameH / SCENE_H);
  return { scale, offsetY: Math.max(0, (frameH - SCENE_H * scale) / 2) };
}

// Chip anchor (pixels) per seat number: avatar centre plus the below-banner
// offset, mapped through the scene transform. Empty map when the table size
// has no measured anchors.
export function seatAnchors(
  maxSeats: number, heroSeat: number, frameW: number, frameH: number,
): Map<number, ChipPoint> {
  const anchors = ANCHOR_TABLES[maxSeats];
  const points = new Map<number, ChipPoint>();
  if (!anchors) return points;

  const { scale, offsetY } = sceneTransform(frameW, frameH);
  for (let seat = 1; seat <= maxSeats; seat++) {
    // Hero at visual position 0 (south); seats increase clockwise, wrapping.
    const visualPos = (((seat - heroSeat) % maxSeats) + maxSeats) % maxSeats;
    const a = anchors[visualPos]!;
    points.set(seat, {
      x: Math.min(Math.max(a.x * scale, 4), frameW - 4),   // safety clamp
      y: (a.y + CHIP_Y_OFFSET_PX) * scale + offsetY,
    });
  }
  return points;
}

// One display row per occupied opponent seat, falling back to all-zero stats
// so a "0/0 · 0 (0)" chip appears as soon as a player lands in the seat —
// immediate UI feedback, and a debugging aid.
export function chipRows(
  rows: SeatSessionStats[], occupiedSeats: number[], heroSeat: number,
): SeatSessionStats[] {
  const bySeat = new Map(rows.map(r => [r.seat, r]));
  return [...occupiedSeats]
    .filter(seat => seat !== heroSeat)
    .sort((a, b) => a - b)
    .map(seat => bySeat.get(seat) ?? { seat, hands: 0, vpip: 0, pfr: 0, af: 0 });
}

const CHIPS_CSS = `
  :host { all: initial; }
  .layer {
    position: fixed;
    inset: 0;
    z-index: 2147483646;   /* just under the HUD panel */
    pointer-events: none;
  }
  .chip {
    position: absolute;
    transform: translate(-50%, 0);
    padding: 2px 7px;
    border-radius: 9px;
    background: rgba(26, 26, 46, 0.88);
    color: #e0e0e0;
    font: 10px/1.4 system-ui, sans-serif;
    white-space: nowrap;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
  }
  .chip .seat { color: #8a8aa8; margin-right: 4px; }
`;

export class SeatChipOverlay {
  private host: HTMLElement;
  private layer: HTMLElement;
  private lastArgs: Parameters<SeatChipOverlay['update']> | null = null;
  private resizeQueued = false;
  private readonly onResize = (): void => {
    // Throttle to one relayout per frame; zoom fires resize storms.
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      if (this.lastArgs) this.update(...this.lastArgs);
    });
  };

  constructor(doc: Document) {
    this.host = doc.createElement('div');
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CHIPS_CSS;
    root.appendChild(style);
    this.layer = doc.createElement('div');
    this.layer.className = 'layer';
    root.appendChild(this.layer);
    (doc.body ?? doc.documentElement).appendChild(this.host);
    window.addEventListener('resize', this.onResize);
  }

  private lastRenderLog = '';

  // Rebuild the chips: one per occupied opponent seat (zeroed when it has no
  // stats yet); the hero is skipped — their stats live in the HUD panel.
  update(
    rows: SeatSessionStats[], maxSeats: number, heroSeat: number, occupiedSeats: number[],
  ): void {
    this.lastArgs = [rows, maxSeats, heroSeat, occupiedSeats];
    while (this.layer.firstChild) this.layer.firstChild.remove();

    const frameW = window.innerWidth, frameH = window.innerHeight;
    const layoutSize = resolveLayoutSize(maxSeats, heroSeat);
    if (layoutSize === null) {
      this.renderLog(`[BovadaHUD] chips hidden: no layout for maxSeats=${maxSeats}, hero=${heroSeat}`);
      return;
    }

    const anchors = seatAnchors(layoutSize, heroSeat, frameW, frameH);
    const shown = chipRows(rows, occupiedSeats, heroSeat);
    const drawn = shown.filter(r => anchors.has(r.seat));
    const first = drawn[0] ? anchors.get(drawn[0].seat)! : null;
    const t = sceneTransform(frameW, frameH);
    this.renderLog(`[BovadaHUD] chips render: layout=${layoutSize}`
      + (layoutSize !== maxSeats ? ` (fallback from maxSeats=${maxSeats})` : '')
      + ` hero=${heroSeat} frame=${frameW}x${frameH}`
      + ` scale=${t.scale.toFixed(3)} offsetY=${Math.round(t.offsetY)}`
      + ` chips=${drawn.length}/${shown.length}`
      + (first ? ` first=S${drawn[0]!.seat}@(${Math.round(first.x)},${Math.round(first.y)})` : ''));

    const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
    for (const row of shown) {
      const point = anchors.get(row.seat);
      if (!point) continue;
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.left = `${point.x.toFixed(1)}px`;
      chip.style.top = `${point.y.toFixed(1)}px`;
      const seatLabel = document.createElement('span');
      seatLabel.className = 'seat';
      seatLabel.textContent = `S${row.seat}`;
      chip.appendChild(seatLabel);
      chip.append(`${r1(row.vpip)}/${r1(row.pfr)} · ${r1(row.af)} (${row.hands})`);
      this.layer.appendChild(chip);
    }
  }

  // Log the render decision only when it changes — update() fires per action.
  private renderLog(line: string): void {
    if (line === this.lastRenderLog) return;
    this.lastRenderLog = line;
    console.log(line);
  }

  setVisible(visible: boolean): void {
    this.host.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.host.remove();
  }
}
