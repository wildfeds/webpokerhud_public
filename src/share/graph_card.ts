// Shareable "graph card": a self-contained SVG of the cumulative net-winnings
// line sized for a forum or Reddit post (1200×630, the Open Graph ratio),
// with a title, a stats subtitle and a quiet product footer. Pure string
// building — no DOM, unit-tested. Rasterising to PNG lives in graph_image.ts.
//
// Everything interpolated is escaped: the title/subtitle come from stake
// labels and numbers today, but the card must stay safe if that changes.

import { escapeHtml } from '../ui/html';

export interface GraphCardOptions {
  // Cumulative net chips (cents), one point per hand in play order.
  series:    number[];
  // Optional all-in EV (luck-adjusted) line on the same scale; drawn only
  // when it differs from the total somewhere.
  evSeries?: number[];
  title:     string;      // e.g. "$0.05/$0.10 NLHE · Bovada"
  subtitle:  string;      // e.g. "1,234 hands · +$45.20 · +8.3 bb/100 · all time"
  footer?:   string;      // product line; default below
  width?:    number;
  height?:   number;
}

export const DEFAULT_FOOTER = 'webpokerhud.com · free, open-source poker HUD for your browser';
export const CARD_WIDTH  = 1200;
export const CARD_HEIGHT = 630;

const BG      = '#1a1a2e';
const FG      = '#ffffff';
const MUTED   = '#8a8aa8';
const GRID    = 'rgba(255,255,255,0.08)';
const ZERO    = '#6a6a8a';
const POS     = '#7ec97e';
const NEG     = '#ff6b6b';
const EV      = '#f0a860';
const FONT    = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

// Keep polylines to a sane size for very long histories: step-sample down to
// ~`max` points but always keep the final one so the end value is exact.
export function thinSeries(points: number[], max = 2400): number[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: number[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]!);
  return out;
}

// A "nice" tick step (1/2/5 × 10^k, in cents) giving about `target` ticks.
export function niceStep(span: number, target = 4): number {
  if (span <= 0) return 100;
  const rough = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 5, 10]) {
    if (m * mag >= rough) return m * mag;
  }
  return 10 * mag;
}

// "+$1,234.50" / "−$0.75" / "$0.00"
export function moneyLabel(cents: number): string {
  const v = Math.abs(cents) / 100;
  const text = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}$${text}`;
}

// Build the card. Returns '' when there is nothing to draw (< 2 hands).
export function graphCardSvg(opts: GraphCardOptions): string {
  const width  = opts.width  ?? CARD_WIDTH;
  const height = opts.height ?? CARD_HEIGHT;
  if (opts.series.length < 2) return '';

  const total = [0, ...opts.series];
  const evRaw = opts.evSeries && opts.evSeries.length === opts.series.length ? opts.evSeries : null;
  const evDiffers = !!evRaw && evRaw.some((v, i) => Math.round(v) !== Math.round(opts.series[i] ?? 0));
  const ev = evDiffers ? [0, ...evRaw!] : null;

  // Layout
  const padL = 96, padR = 48, padT = 150, padB = 90;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = total.length;

  const all = ev ? [...total, ...ev] : total;
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const step = niceStep(hi - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const span = yMax - yMin || step;

  const x = (i: number) => padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - yMin) / span) * plotH;

  // Horizontal grid + $ labels
  const grid: string[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const yy = y(v).toFixed(1);
    const isZero = Math.abs(v) < 1e-9;
    grid.push(`<line x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" stroke="${isZero ? ZERO : GRID}" stroke-width="${isZero ? 1.5 : 1}"${isZero ? ' stroke-dasharray="4 4"' : ''}/>`);
    grid.push(`<text x="${padL - 12}" y="${(y(v) + 5).toFixed(1)}" fill="${MUTED}" font-size="15" text-anchor="end" font-family="${FONT}">${moneyLabel(v)}</text>`);
  }
  // Hand-count ticks along the bottom
  const hands = opts.series.length;
  const xTicks: string[] = [];
  const tickAt = [...new Set([0, 1, 2, 3, 4].map(k => Math.round((k / 4) * hands)))];
  for (const i of tickAt) {
    const k = i === 0 ? 0 : i === hands ? 4 : 2;
    xTicks.push(`<text x="${x(i).toFixed(1)}" y="${(padT + plotH + 26).toFixed(1)}" fill="${MUTED}" font-size="15" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-family="${FONT}">${i.toLocaleString('en-US')}</text>`);
  }

  const toPoints = (pts: number[]) => {
    const thin = thinSeries(pts);
    const scale = (pts.length - 1) / Math.max(1, thin.length - 1);
    return thin.map((v, i) => `${x(Math.min(n - 1, i * scale)).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  };

  const final = opts.series[opts.series.length - 1]!;
  const color = final >= 0 ? POS : NEG;
  const lines: string[] = [];
  if (ev) {
    lines.push(`<polyline points="${toPoints(ev)}" fill="none" stroke="${EV}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  // Soft fill under the total line down to the zero line, then the line itself.
  const zeroY = y(0).toFixed(1);
  const totalPts = toPoints(total);
  lines.push(`<polygon points="${padL},${zeroY} ${totalPts} ${x(n - 1).toFixed(1)},${zeroY}" fill="${color}" fill-opacity="0.10"/>`);
  lines.push(`<polyline points="${totalPts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
  lines.push(`<circle cx="${x(n - 1).toFixed(1)}" cy="${y(final).toFixed(1)}" r="6" fill="${color}"/>`);

  // Legend (top right of the plot)
  const legend: string[] = [];
  const legendY = padT - 18;
  let lx = width - padR;
  const legendItem = (label: string, c: string) => {
    const w = label.length * 8.5 + 30;
    lx -= w;
    legend.push(`<rect x="${lx}" y="${legendY - 6}" width="18" height="4" rx="2" fill="${c}"/>`);
    legend.push(`<text x="${lx + 26}" y="${legendY}" fill="${MUTED}" font-size="15" font-family="${FONT}">${escapeHtml(label)}</text>`);
    lx -= 18;
  };
  if (ev) legendItem('All-in EV', EV);
  legendItem('Net', color);

  const footer = escapeHtml(opts.footer ?? DEFAULT_FOOTER);

  // Final value next to the end dot, on a dark pill so the line underneath
  // never makes it unreadable. Sits above the dot, or below when the dot is
  // near the top of the plot.
  const endText = moneyLabel(final);
  const endW = endText.length * 12.5 + 20;
  const endX = width - padR - endW;
  const above = y(final) > padT + 40;
  const endY = above ? y(final) - 36 : y(final) + 14;
  const endLabel = `<rect x="${endX.toFixed(1)}" y="${endY.toFixed(1)}" width="${endW.toFixed(1)}" height="28" rx="6" fill="${BG}" fill-opacity="0.9" stroke="${color}" stroke-opacity="0.5"/>
  <text x="${(endX + endW / 2).toFixed(1)}" y="${(endY + 20).toFixed(1)}" fill="${color}" font-size="20" font-weight="600" text-anchor="middle" font-family="${FONT}">${endText}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <text x="48" y="64" fill="${FG}" font-size="32" font-weight="600" font-family="${FONT}">${escapeHtml(opts.title)}</text>
  <text x="48" y="100" fill="${MUTED}" font-size="19" font-family="${FONT}">${escapeHtml(opts.subtitle)}</text>
  ${grid.join('\n  ')}
  ${xTicks.join('\n  ')}
  ${lines.join('\n  ')}
  ${legend.join('\n  ')}
  ${endLabel}
  <text x="${width / 2}" y="${padT + plotH + 48}" fill="${MUTED}" font-size="14" text-anchor="middle" font-family="${FONT}">hands</text>
  <text x="48" y="${height - 22}" fill="${MUTED}" font-size="15" font-family="${FONT}">${footer}</text>
</svg>`;
}
