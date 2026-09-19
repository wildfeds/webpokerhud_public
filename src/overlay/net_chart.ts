// Pure inline-SVG line chart of cumulative net winnings — no DOM, no deps.
// x-axis = hand count (1…N), y-axis = net in dollars. Unit-tested.

const CENTS_PER_CHIP = 100;
const POS = '#7ec97e';
const NEG = '#ff6b6b';

// Build an <svg> string for a cumulative net-chip series (one point per hand,
// in play order). Returns '' for fewer than two points (nothing to draw).
export function netChartSvg(series: number[], width = 288, height = 120): string {
  if (series.length < 2) return '';

  // Prepend a 0 baseline so the line starts at the origin (before any hand).
  const points = [0, ...series];
  const n = points.length;

  const padX = 6, padTop = 12, padBot = 16;
  const innerW = width - 2 * padX;
  const innerH = height - padTop - padBot;

  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;

  const x = (i: number) => padX + (i / (n - 1)) * innerW;
  const y = (v: number) => padTop + innerH - ((v - lo) / span) * innerH;

  const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const final = series[series.length - 1]!;
  const color = final >= 0 ? POS : NEG;
  const zeroY = y(0).toFixed(1);
  const endX = x(n - 1).toFixed(1);
  const endY = y(final).toFixed(1);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}" stroke="#555" stroke-width="1" stroke-dasharray="2 3"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${endX}" cy="${endY}" r="2.5" fill="${color}"/>
    <text x="${padX}" y="9" fill="#8a8aa8" font-size="9">${money(hi)}</text>
    <text x="${padX}" y="${height - 4}" fill="#8a8aa8" font-size="9">${money(lo)}</text>
    <text x="${width - padX}" y="9" fill="${color}" font-size="9" text-anchor="end">${money(final)} · ${series.length} hands</text>
  </svg>`;
}

// One line of a multi-series chart. Points are cumulative cents, one per hand.
export interface ChartSeries { points: number[]; color: string }

// Several cumulative series on one scale (same hand count per series). The
// legend is left to the caller (HTML renders better than SVG text); the chart
// draws the zero line, one polyline per series, an end dot on the first series
// (the total), and hi/lo/hand-count labels. '' when there is nothing to draw.
export function multiSeriesChartSvg(
  seriesList: ChartSeries[], width = 288, height = 120,
  fmt: (v: number) => string = money,
): string {
  const drawn = seriesList.filter(s => s.points.length >= 2);
  if (drawn.length === 0) return '';

  const padX = 6, padTop = 12, padBot = 16;
  const innerW = width - 2 * padX;
  const innerH = height - padTop - padBot;

  const all = drawn.flatMap(s => s.points);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const n = Math.max(...drawn.map(s => s.points.length)) + 1;   // +1 for the 0 baseline

  const x = (i: number) => padX + (i / (n - 1)) * innerW;
  const y = (v: number) => padTop + innerH - ((v - lo) / span) * innerH;

  const polylines = drawn.map(s => {
    const points = [0, ...s.points].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linejoin="round"/>`;
  }).join('\n    ');

  const first = drawn[0]!;
  const final = first.points[first.points.length - 1]!;
  const zeroY = y(0).toFixed(1);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}" stroke="#555" stroke-width="1" stroke-dasharray="2 3"/>
    ${polylines}
    <circle cx="${x(first.points.length).toFixed(1)}" cy="${y(final).toFixed(1)}" r="2.5" fill="${first.color}"/>
    <text x="${padX}" y="9" fill="#8a8aa8" font-size="9">${fmt(hi)}</text>
    <text x="${padX}" y="${height - 4}" fill="#8a8aa8" font-size="9">${fmt(lo)}</text>
    <text x="${width - padX}" y="9" fill="#8a8aa8" font-size="9" text-anchor="end">${first.points.length} hands</text>
  </svg>`;
}

// Vertical bars, one per value (e.g. net per session), green/red by sign, with
// a zero line and hi/lo labels. '' when there is nothing to draw.
export function barChartSvg(values: number[], width = 288, height = 120,
  fmt: (v: number) => string = money,
): string {
  if (values.length === 0) return '';

  const padX = 6, padTop = 12, padBot = 16;
  const innerW = width - 2 * padX;
  const innerH = height - padTop - padBot;

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => padTop + innerH - ((v - lo) / span) * innerH;

  const slot = innerW / values.length;
  const barW = Math.max(1, slot * 0.7);
  const zeroY = y(0);

  const bars = values.map((v, i) => {
    const x = padX + i * slot + (slot - barW) / 2;
    const top = Math.min(y(v), zeroY);
    const h = Math.max(1, Math.abs(y(v) - zeroY));
    const color = v >= 0 ? POS : NEG;
    return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`;
  }).join('\n    ');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${bars}
    <line x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}" stroke="#555" stroke-width="1"/>
    <text x="${padX}" y="9" fill="#8a8aa8" font-size="9">${fmt(hi)}</text>
    <text x="${padX}" y="${height - 4}" fill="#8a8aa8" font-size="9">${fmt(lo)}</text>
    <text x="${width - padX}" y="9" fill="#8a8aa8" font-size="9" text-anchor="end">${values.length} sessions</text>
  </svg>`;
}

function money(cents: number): string {
  const v = cents / CENTS_PER_CHIP;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
