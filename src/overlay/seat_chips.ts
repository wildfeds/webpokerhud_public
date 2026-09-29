// Per-seat stat chips anchored to Bovada's table art (Enhancement P3a v2).
// Each occupied seat gets a small chip showing the session-scoped
// VPIP/PFR · AF (hands) from computeSeatSessionStats. Opponent chips anchor
// above the seat's card block; the hero's own chip (their table image, at the
// south seat) anchors BELOW the seat container so it never covers the stack
// pill, bet value, or action banner.
//
// Layout model (see design.md, "P3a v2"): each table runs in its own iframe,
// so every question reduces to this frame's viewport. The table scene keeps a
// fixed design aspect ratio inside the frame (letterboxed, centred); avatar
// positions are fractions of that content rect, measured from live
// screenshots; and Bovada always draws the hero at the south anchor, with
// seat numbers increasing clockwise and wrapping at maxSeats.
import { SeatSessionStats } from '../analysis';

// Scene model, calibrated across quarter-tile (844×547) and half-width
// full-height (1040×1035) layouts (docs/BUGFIXES.md BF-004): the table scene
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

// The hero's scene-model prior sits further down: past the stack pill AND the
// action banner, into the dead zone above the sit-out checkboxes.
export const HERO_CHIP_Y_OFFSET_PX = 84;

// Avatar-pill centres (calibration px), listed by visual position clockwise
// from south (0 = hero). Only 6-max is measured; table sizes without a row
// render DOM-only (v4 anchors) with no scene-model fallback — which is how
// 9-max tables are supported.
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
export interface Rect { left: number; top: number; width: number; height: number }

// ── DOM anchoring (v4) ───────────────────────────────────────────────────────
// Measured Bovada structure (DOM dump, 2026-09-22):
//
//   div.…leftPlayer / div.…rightPlayer      ← seat container = the pill rect
//     div.f11rr7sf(.isNotMyPlayer)          ← row; isNotMyPlayer on opponents
//       span[28x28] > span[28x14] "3"       ← seat-number digit leaf
//       span "$5.54"                        ← stack amount
//   parent div (75x61, above the pill)      ← the seat's card block
//
// leftPlayer/rightPlayer are semantic names (stable across Bovada deploys,
// unlike the hashed f… classes), the digit maps container → seat, and the
// container's parent is the card block — so chips anchor ABOVE the cards,
// where nothing else renders (no action banner, timer, or pot bubbles).
// Seats not found in the DOM fall back to the scene-model prior.

export const SEAT_CONTAINER_SELECTOR = '[class*="leftPlayer"], [class*="rightPlayer"]';

// Chip anchor above a seat: horizontally centred on the pill, bottom edge
// just above the card block (the chip renders with translate(-50%,-100%)).
export function anchorAboveSeat(pill: Rect, cardBox: Rect): ChipPoint {
  return { x: pill.left + pill.width / 2, y: Math.min(cardBox.top, pill.top) - 6 };
}

// Hero chip anchor below a seat: under the container box, cleared past the
// action banner (FOLD/CALL/…) that Bovada renders directly beneath the pill,
// so the stack pill and bet value stay readable (the chip renders with
// translate(-50%, 0)).
export const HERO_CHIP_CLEARANCE_PX = 28;
export function anchorBelowSeat(pill: Rect, cardBox: Rect): ChipPoint {
  const bottom = Math.max(pill.top + pill.height, cardBox.top + cardBox.height);
  return { x: pill.left + pill.width / 2, y: bottom + HERO_CHIP_CLEARANCE_PX };
}

// The seat's card block: the container's parent when it is plausibly one —
// a real box starting at/above the pill, card-block sized (not some page
// wrapper mid-relayout), and adjacent to the pill. Else the pill itself.
export function cardBoxOf(pill: Rect, parent: Rect | null): Rect {
  if (parent
      && parent.width > 0 && parent.height > 0
      && parent.top <= pill.top
      && parent.height <= pill.height * 4
      && parent.width <= pill.width * 2.5
      && parent.top + parent.height >= pill.top - pill.height) return parent;
  return pill;
}

// Scene-model layout to use for fallback priors. The protocol's maxSeat field
// reads 9 even on 6-max tables (it is the seat-array width, not the table
// size — the true signal is still being hunted; gameType2 is a candidate).
// Until decoded: use a measured layout when one exists for maxSeats, else
// fall back to the 6-max layout whenever the hero sits in its range.
// null = no scene priors (9-max heroes in seats 7–9); chips then rely on
// DOM anchors alone, which cover every seat the page renders.
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
    const yOffset = visualPos === 0 ? HERO_CHIP_Y_OFFSET_PX : CHIP_Y_OFFSET_PX;
    points.set(seat, {
      x: Math.min(Math.max(a.x * scale, 4), frameW - 4),   // safety clamp
      y: (a.y + yOffset) * scale + offsetY,
    });
  }
  return points;
}

// One display row per occupied seat — the hero included: their chip shows the
// table image opponents see. Seats without stats fall back to all zeros so a
// "0/0 · 0 (0)" chip appears as soon as a player lands in the seat —
// immediate UI feedback, and a debugging aid.
export function chipRows(
  rows: SeatSessionStats[], occupiedSeats: number[],
): SeatSessionStats[] {
  const bySeat = new Map(rows.map(r => [r.seat, r]));
  return [...occupiedSeats]
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 5px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(32, 34, 58, 0.95), rgba(18, 20, 38, 0.95));
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #eceef8;
    font: 600 12px/1.4 system-ui, sans-serif;
    letter-spacing: 0.01em;
    white-space: nowrap;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  }
  .chip .seat {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    border-radius: 999px;
    background: #4a4ae0;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
  }
  .chip .af { color: #9aa3ff; }
  .chip .hands { color: #9aa0b8; font-weight: 500; }
  .chip.hero { border-color: rgba(126, 201, 126, 0.5); }
  .chip.hero .seat { background: #2e9e5b; }
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

  // DOM-anchor pass (v4): select the semantic seat containers, map each to
  // its seat via the digit leaf inside, and anchor above the card block
  // (container's parent) — except the hero's seat, which anchors BELOW the
  // container so the chip never covers the stack pill, bet value, or action
  // banner. The hero container is the one whose row lacks Bovada's
  // isNotMyPlayer marker (exactly one, else the signal is untrusted and the
  // protocol heroSeat decides). Seats not found keep the scene-model prior.
  private domAnchors(
    seats: number[], priors: Map<number, ChipPoint>, heroSeat: number,
  ): {
    anchors: Map<number, { point: ChipPoint; mode: 'above' | 'below' | 'prior' }>;
    domCount: number;
    heroResolved: number;
  } {
    const doc = this.host.ownerDocument;
    const found = new Map<number, { pill: Rect; cardBox: Rect }>();
    const seatsWithoutOppMarker: number[] = [];
    const containers = doc.querySelectorAll(SEAT_CONTAINER_SELECTOR);
    for (let i = 0; i < containers.length; i++) {
      const c = containers[i]!;
      // Seat number: the first descendant span that is a bare digit.
      let seat: number | null = null;
      const spans = c.querySelectorAll('span');
      for (let j = 0; j < spans.length; j++) {
        const t = spans[j]!.textContent?.trim() ?? '';
        if (/^[1-9]$/.test(t) && spans[j]!.childElementCount === 0) {
          seat = Number(t);
          break;
        }
      }
      if (seat === null || found.has(seat)) continue;
      const pill = c.getBoundingClientRect();
      if (pill.width <= 0 || pill.height <= 0) continue;
      const parent = c.parentElement?.getBoundingClientRect() ?? null;
      found.set(seat, { pill, cardBox: cardBoxOf(pill, parent) });
      if (!c.querySelector('[class*="isNotMyPlayer"]')) seatsWithoutOppMarker.push(seat);
    }

    const heroResolved = seatsWithoutOppMarker.length === 1
      ? seatsWithoutOppMarker[0]!
      : heroSeat;

    const anchors = new Map<number, { point: ChipPoint; mode: 'above' | 'below' | 'prior' }>();
    let domCount = 0;
    for (const seat of seats) {
      const hit = found.get(seat);
      if (hit) {
        const below = seat === heroResolved;
        anchors.set(seat, {
          point: below ? anchorBelowSeat(hit.pill, hit.cardBox) : anchorAboveSeat(hit.pill, hit.cardBox),
          mode: below ? 'below' : 'above',
        });
        domCount++;
      }
      // No container → the player isn't rendered (left mid-hand, seat
      // emptied): show nothing rather than guess. Occupancy catches up at
      // the next hand.
    }

    // Whole scan empty (Bovada DOM changed?): fall back to the scene model
    // for every seat rather than hiding all chips (the hero prior already
    // sits low enough to clear the south seat's pill and banner).
    if (domCount === 0) {
      for (const seat of seats) {
        const prior = priors.get(seat);
        if (prior) anchors.set(seat, { point: prior, mode: 'prior' });
      }
    }
    return { anchors, domCount, heroResolved };
  }

  // Rebuild the chips: one per occupied seat (zeroed when it has no stats
  // yet). The hero's chip — their session image — renders below their seat
  // container with a green badge; opponents render above their card blocks.
  update(
    rows: SeatSessionStats[], maxSeats: number, heroSeat: number, occupiedSeats: number[],
  ): void {
    this.lastArgs = [rows, maxSeats, heroSeat, occupiedSeats];
    while (this.layer.firstChild) this.layer.firstChild.remove();

    const frameW = window.innerWidth, frameH = window.innerHeight;
    // DOM anchors are the primary mechanism and cover any table size (each
    // rendered seat carries its number). The scene model only supplies
    // per-seat fallback priors, and only for sizes it has measured.
    const layoutSize = resolveLayoutSize(maxSeats, heroSeat);
    const priors = layoutSize === null
      ? new Map<number, ChipPoint>()
      : seatAnchors(layoutSize, heroSeat, frameW, frameH);
    const shown = chipRows(rows, occupiedSeats);
    const { anchors, domCount, heroResolved } = this.domAnchors(shown.map(r => r.seat), priors, heroSeat);
    const drawn = shown.filter(r => anchors.has(r.seat));
    const t = sceneTransform(frameW, frameH);
    this.renderLog(`[WebPokerHud] chips render: layout=${layoutSize ?? 'none (DOM-only)'}`
      + (layoutSize !== null && layoutSize !== maxSeats ? ` (fallback from maxSeats=${maxSeats})` : '')
      + ` hero=${heroSeat}${heroResolved !== heroSeat ? ` (dom→${heroResolved})` : ''}`
      + ` frame=${frameW}x${frameH}`
      + ` scale=${t.scale.toFixed(3)} offsetY=${Math.round(t.offsetY)}`
      + ` chips=${drawn.length}/${shown.length} dom-anchored=${domCount}`);

    const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
    for (const row of shown) {
      const anchor = anchors.get(row.seat);
      if (!anchor) continue;
      const { point, mode } = anchor;
      const isHero = mode === 'below' || (mode === 'prior' && row.seat === heroResolved);
      const chip = document.createElement('div');
      chip.className = isHero ? 'chip hero' : 'chip';
      chip.style.left = `${point.x.toFixed(1)}px`;
      chip.style.top = `${point.y.toFixed(1)}px`;
      if (mode === 'above') chip.style.transform = 'translate(-50%, -100%)';
      const seatLabel = document.createElement('span');
      seatLabel.className = 'seat';
      seatLabel.textContent = String(row.seat);
      chip.appendChild(seatLabel);
      chip.append(`${r1(row.vpip)}/${r1(row.pfr)}`);
      const af = document.createElement('span');
      af.className = 'af';
      af.textContent = `AF ${r1(row.af)}`;
      chip.appendChild(af);
      const hands = document.createElement('span');
      hands.className = 'hands';
      hands.textContent = `${row.hands}h`;
      chip.appendChild(hands);
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
