// DOM half of the shareable graph: rasterise the SVG card to a PNG, save it
// through chrome.downloads and, where the browser allows it, put it on the
// clipboard so it pastes straight into a Reddit/forum post. Used by the popup
// and the Analysis Panel; the pure card builder is graph_card.ts.

import { graphCardSvg, GraphCardOptions, CARD_WIDTH, CARD_HEIGHT } from './graph_card';

// Draw an SVG string onto a canvas at `scale`× and encode it as PNG. The SVG
// carries explicit width/height attributes (Firefox needs them to draw an
// SVG image) and no external resources, so the canvas stays untainted.
export async function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('could not render the graph image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

// Save under Downloads/webpokerhud/. A data: URL rather than a blob: URL so
// the download does not depend on the popup document staying alive.
async function saveImage(blob: Blob, filename: string): Promise<void> {
  await chrome.downloads.download({
    url:            await blobToDataUrl(blob),
    filename:       `webpokerhud/${filename}`,
    conflictAction: 'uniquify',
    saveAs:         false,
  });
}

// Best effort: ClipboardItem needs a recent browser and a user gesture (the
// click that triggered the share). False when unsupported or refused.
async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export interface ShareResult {
  saved:  boolean;
  copied: boolean;
  file:   string;
}

// Render the card and deliver it. Throws with a user-facing message when the
// image cannot be produced; clipboard failure is reported, not thrown.
export async function shareGraphImage(opts: GraphCardOptions): Promise<ShareResult> {
  const width  = opts.width  ?? CARD_WIDTH;
  const height = opts.height ?? CARD_HEIGHT;
  const svg = graphCardSvg({ ...opts, width, height });
  if (!svg) throw new Error('Need at least two hands to share a graph.');
  const blob = await svgToPngBlob(svg, width, height);
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `graph-${stamp}.png`;
  const copied = await copyImage(blob);
  await saveImage(blob, file);
  return { saved: true, copied, file };
}
