import { describe, it, expect } from 'vitest';
import { netChartSvg, multiSeriesChartSvg, barChartSvg } from './net_chart';

describe('netChartSvg', () => {
  it('returns empty string for fewer than two points', () => {
    expect(netChartSvg([])).toBe('');
    expect(netChartSvg([100])).toBe('');
  });

  it('renders an svg with a polyline and the final dollar total', () => {
    const svg = netChartSvg([100, 50, 300]); // ends at +$3.00 over 3 hands
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('+$3.00');
    expect(svg).toContain('3 hands');
  });

  it('colors the line green when up, red when down', () => {
    expect(netChartSvg([10, 20])).toContain('#7ec97e');
    expect(netChartSvg([-10, -20])).toContain('#ff6b6b');
  });

  it('produces only finite coordinates (no NaN) for a flat series', () => {
    const svg = netChartSvg([0, 0, 0]);
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('$0.00');
  });

  it('prepends a zero baseline: point count is series length + 1', () => {
    const svg = netChartSvg([100, 200]);
    const points = svg.match(/points="([^"]+)"/)![1]!.trim().split(' ');
    expect(points).toHaveLength(3); // origin + 2 hands
  });
});

describe('multiSeriesChartSvg', () => {
  const rb = [
    { points: [100, 300, 200], color: '#7ec97e' },
    { points: [0, 200, 200], color: '#6fa8ff' },
    { points: [100, 100, 0], color: '#ff6b6b' },
  ];

  it('returns empty string when no series has two points', () => {
    expect(multiSeriesChartSvg([])).toBe('');
    expect(multiSeriesChartSvg([{ points: [100], color: '#fff' }])).toBe('');
  });

  it('draws one polyline per series in its own color', () => {
    const svg = multiSeriesChartSvg(rb);
    expect(svg.match(/<polyline/g)).toHaveLength(3);
    for (const s of rb) expect(svg).toContain(`stroke="${s.color}"`);
    expect(svg).toContain('3 hands');
  });

  it('scales all series on one axis including zero', () => {
    const svg = multiSeriesChartSvg([
      { points: [500, 500], color: '#aaa' },
      { points: [-300, -300], color: '#bbb' },
    ]);
    expect(svg).toContain('+$5.00');   // hi label from first series
    expect(svg).toContain('−$3.00');   // lo label from second
    expect(svg).not.toContain('NaN');
  });

  it('accepts a custom value formatter', () => {
    const svg = multiSeriesChartSvg(
      [{ points: [25, 50], color: '#aaa' }], 288, 120, v => `${v}%`);
    expect(svg).toContain('50%');
    expect(svg).not.toContain('$');
  });
});

describe('barChartSvg', () => {
  it('returns empty string for no values', () => {
    expect(barChartSvg([])).toBe('');
  });

  it('draws one bar per value, green/red by sign', () => {
    const svg = barChartSvg([500, -300, 200]);
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).toContain('#7ec97e');
    expect(svg).toContain('#ff6b6b');
    expect(svg).toContain('3 sessions');
    expect(svg).not.toContain('NaN');
  });
});
