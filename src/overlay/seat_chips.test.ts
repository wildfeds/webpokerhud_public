import { describe, it, expect } from 'vitest';
import {
  seatAnchors, sceneTransform, chipRows, resolveLayoutSize,
  SCENE_W, SCENE_H, CHIP_Y_OFFSET_PX,
} from './seat_chips';

describe('sceneTransform', () => {
  it('is identity at the calibration size', () => {
    expect(sceneTransform(SCENE_W, SCENE_H)).toEqual({ scale: 1, offsetY: 0 });
  });

  it('scales by the limiting axis and centres leftover height', () => {
    // Twice as tall as the scene needs: width-limited, offset = spare/2.
    const t = sceneTransform(SCENE_W, SCENE_H * 2);
    expect(t.scale).toBe(1);
    expect(t.offsetY).toBeCloseTo(SCENE_H / 2, 6);
    // Wider frame with matching height: height-limited, no vertical offset.
    expect(sceneTransform(SCENE_W * 2, SCENE_H)).toEqual({ scale: 1, offsetY: 0 });
  });
});

describe('seatAnchors', () => {
  const W = SCENE_W, H = SCENE_H;   // calibration tile → scale 1, offset 0

  it('anchors the hero seat at the south position, below the action banner', () => {
    const p = seatAnchors(6, 4, W, H).get(4)!;
    expect(p.x).toBeCloseTo(338, 6);
    expect(p.y).toBeCloseTo(366 + CHIP_Y_OFFSET_PX, 6);
  });

  it('places hero+1 clockwise at the south-west anchor', () => {
    // Hero seat 1 → seat 2 is the SW anchor (83, 318).
    const p = seatAnchors(6, 1, W, H).get(2)!;
    expect(p.x).toBeCloseTo(83, 6);
    expect(p.y).toBeCloseTo(318 + CHIP_Y_OFFSET_PX, 6);
  });

  it('wraps seat numbers at maxSeats (…6, 1, 2…)', () => {
    // Hero seat 5: seat 6 → SW (pos 1), seat 1 → NW (pos 2), seat 4 → SE (pos 5).
    const anchors = seatAnchors(6, 5, W, H);
    expect(anchors.get(6)!.x).toBeCloseTo(83, 6);
    expect(anchors.get(6)!.y).toBeCloseTo(318 + CHIP_Y_OFFSET_PX, 6);
    expect(anchors.get(1)!.y).toBeCloseTo(162 + CHIP_Y_OFFSET_PX, 6);
    expect(anchors.get(4)!.x).toBeCloseTo(597, 6);
  });

  it('rotation depends only on the seat distance from the hero', () => {
    const a = seatAnchors(6, 1, W, H).get(3)!;   // two seats past the hero
    const b = seatAnchors(6, 4, W, H).get(6)!;
    expect(a.x).toBeCloseTo(b.x, 8);
    expect(a.y).toBeCloseTo(b.y, 8);
  });

  it('doubling the frame doubles coordinates; extra width alone changes nothing', () => {
    const base = seatAnchors(6, 1, W, H).get(4)!;
    const doubled = seatAnchors(6, 1, W * 2, H * 2).get(4)!;
    expect(doubled.x).toBeCloseTo(base.x * 2, 6);
    expect(doubled.y).toBeCloseTo(base.y * 2, 6);
    const wider = seatAnchors(6, 1, W + 400, H).get(4)!;
    expect(wider.x).toBeCloseTo(base.x, 6);
    expect(wider.y).toBeCloseTo(base.y, 6);
  });

  // BF-004 regression: the half-width full-height tile (1040×1035) from the
  // two-table screenshot. Measured avatars: N≈(407,341+? in-frame 341), left
  // column x≈99, scene scale ≈1.20 with ~200px of vertical centring. The
  // solver must land within a chip-width of those, not at height-scaled spots.
  it('places the north seat near its measured avatar in a tall half-width frame', () => {
    const anchors = seatAnchors(6, 4, 1040, 1035);   // hero seat 4 → seat 1 north
    const north = anchors.get(1)!;
    // Avatar ≈ (407, 341); chip sits CHIP_Y_OFFSET_PX·scale below the pill.
    expect(Math.abs(north.x - 407)).toBeLessThan(25);
    expect(Math.abs(north.y - (341 + CHIP_Y_OFFSET_PX * 1.2))).toBeLessThan(30);
  });

  it('returns an empty map for table sizes without measured anchors', () => {
    expect(seatAnchors(9, 1, W, H).size).toBe(0);
    expect(seatAnchors(2, 1, W, H).size).toBe(0);
  });
});

describe('resolveLayoutSize', () => {
  it('uses the measured layout when one exists for maxSeats', () => {
    expect(resolveLayoutSize(6, 3)).toBe(6);
  });

  it('falls back to 6-max when the protocol reports 9 but the hero fits', () => {
    expect(resolveLayoutSize(9, 6)).toBe(6);
    expect(resolveLayoutSize(9, 1)).toBe(6);
  });

  it('returns null when the hero sits outside every known layout', () => {
    expect(resolveLayoutSize(9, 7)).toBeNull();
    expect(resolveLayoutSize(9, 0)).toBeNull();
  });
});

describe('chipRows', () => {
  const stats = (seat: number, hands: number) => ({ seat, hands, vpip: 50, pfr: 25, af: 2 });

  it('defaults occupied seats without stats to all zeros', () => {
    const rows = chipRows([stats(3, 12)], [2, 3, 5], 1);
    expect(rows).toEqual([
      { seat: 2, hands: 0, vpip: 0, pfr: 0, af: 0 },
      stats(3, 12),
      { seat: 5, hands: 0, vpip: 0, pfr: 0, af: 0 },
    ]);
  });

  it('excludes the hero seat and unoccupied stats rows', () => {
    const rows = chipRows([stats(1, 9), stats(6, 4)], [1, 2], 1);
    expect(rows).toEqual([{ seat: 2, hands: 0, vpip: 0, pfr: 0, af: 0 }]);
  });

  it('sorts by seat number', () => {
    expect(chipRows([], [5, 2, 4], 3).map(r => r.seat)).toEqual([2, 4, 5]);
  });
});
