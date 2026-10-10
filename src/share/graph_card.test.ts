import { describe, it, expect } from 'vitest';
import { graphCardSvg, thinSeries, niceStep, moneyLabel, DEFAULT_FOOTER } from './graph_card';

describe('graphCardSvg', () => {
  it('returns empty for fewer than two hands', () => {
    expect(graphCardSvg({ series: [], title: 't', subtitle: 's' })).toBe('');
    expect(graphCardSvg({ series: [150], title: 't', subtitle: 's' })).toBe('');
  });

  it('draws a sized SVG with the title, subtitle, footer and one polyline', () => {
    const svg = graphCardSvg({ series: [100, -50, 300], title: '$0.05/$0.10 NLHE', subtitle: '3 hands' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"')).toBe(true);
    expect(svg).toContain('$0.05/$0.10 NLHE');
    expect(svg).toContain('3 hands');
    expect(svg).toContain(DEFAULT_FOOTER);
    expect(svg.match(/<polyline /g)).toHaveLength(1);
    expect(svg).toContain('+$3.00');          // end-value label
  });

  it('adds the EV line only when it differs from the total', () => {
    const same = graphCardSvg({ series: [100, 200], evSeries: [100, 200], title: 't', subtitle: 's' });
    expect(same.match(/<polyline /g)).toHaveLength(1);
    expect(same).not.toContain('All-in EV');

    const differs = graphCardSvg({ series: [100, 200], evSeries: [100, 350], title: 't', subtitle: 's' });
    expect(differs.match(/<polyline /g)).toHaveLength(2);
    expect(differs).toContain('All-in EV');
  });

  it('ignores an EV series of the wrong length', () => {
    const svg = graphCardSvg({ series: [100, 200, 300], evSeries: [1, 2], title: 't', subtitle: 's' });
    expect(svg.match(/<polyline /g)).toHaveLength(1);
  });

  it('escapes text', () => {
    const svg = graphCardSvg({ series: [1, 2], title: '<b>&', subtitle: '"q"', footer: "it's" });
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).toContain('&quot;q&quot;');
    expect(svg).toContain('it&#39;s');
    expect(svg).not.toContain('<b>');
  });

  it('colours a losing graph red and a winning one green', () => {
    expect(graphCardSvg({ series: [10, -500], title: 't', subtitle: 's' })).toContain('stroke="#ff6b6b" stroke-width="3"');
    expect(graphCardSvg({ series: [10, 500], title: 't', subtitle: 's' })).toContain('stroke="#7ec97e" stroke-width="3"');
  });

  it('honours custom dimensions', () => {
    const svg = graphCardSvg({ series: [1, 2], title: 't', subtitle: 's', width: 800, height: 400 });
    expect(svg).toContain('width="800" height="400" viewBox="0 0 800 400"');
  });
});

describe('thinSeries', () => {
  it('keeps short series intact', () => {
    expect(thinSeries([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
  it('samples long series and keeps the last point', () => {
    const long = Array.from({ length: 1000 }, (_, i) => i);
    const thin = thinSeries(long, 100);
    expect(thin.length).toBeLessThanOrEqual(101);
    expect(thin[0]).toBe(0);
    expect(thin[thin.length - 1]).toBe(999);
  });
});

describe('niceStep', () => {
  it('picks 1/2/5 steps', () => {
    expect(niceStep(400)).toBe(100);     // $4 span → $1 ticks
    expect(niceStep(1000)).toBe(500);    // $10 span → $5 ticks (rough 250 → 500)
    expect(niceStep(12_000)).toBe(5000); // $120 → $50
    expect(niceStep(0)).toBe(100);
  });
});

describe('moneyLabel', () => {
  it('formats signed dollars with separators', () => {
    expect(moneyLabel(123_450)).toBe('+$1,234.50');
    expect(moneyLabel(-75)).toBe('−$0.75');
    expect(moneyLabel(0)).toBe('$0.00');
  });
});

describe('x-axis ticks', () => {
  it('never repeats a hand-count label on tiny samples', () => {
    const svg = graphCardSvg({ series: [1, 2], title: 't', subtitle: 's' });
    const labels = [...svg.matchAll(/font-size="15" text-anchor="(?:start|middle|end)" font-family="[^"]+">(\d+)<\/text>/g)].map(m => m[1]);
    expect(labels).toEqual(['0', '1', '2']);
  });
});
