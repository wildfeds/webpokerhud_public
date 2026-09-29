// Generate the extension icons (16/32/48/128) as PNGs with no image deps:
// draws RGBA buffers (4x supersampled, box-downsampled) and encodes PNG by
// hand (zlib + CRC32). Design: dark rounded tile, three rising accent bars —
// the HUD/stats identity, legible at 16px.
//
//   node scripts/make_icons.mjs        → icons/icon{16,32,48,128}.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];
const SS = 4;   // supersample factor

// Palette (site identity: ink + indigo accent).
const TILE = [17, 24, 39, 255];        // ink-900
const BARS = [
  [99, 102, 241, 255],                 // indigo-500
  [129, 140, 248, 255],                // indigo-400
  [165, 180, 252, 255],                // indigo-300
];

function draw(size) {
  const s = size * SS;
  const img = new Uint8ClampedArray(s * s * 4);   // transparent

  const put = (x, y, [r, g, b, a]) => {
    const i = (y * s + x) * 4;
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a;
  };

  // Rounded tile.
  const rad = 0.20 * s;
  const inTile = (x, y) => {
    const cx = Math.min(Math.max(x, rad), s - rad);
    const cy = Math.min(Math.max(y, rad), s - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };

  // Three bars on a shared baseline.
  const barW = 0.16 * s;
  const gap = 0.10 * s;
  const base = 0.80 * s;
  const heights = [0.26 * s, 0.40 * s, 0.56 * s];
  const total = 3 * barW + 2 * gap;
  const x0 = (s - total) / 2;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inTile(x, y)) continue;
      put(x, y, TILE);
      for (let b = 0; b < 3; b++) {
        const bx = x0 + b * (barW + gap);
        if (x >= bx && x < bx + barW && y <= base && y >= base - heights[b]) {
          put(x, y, BARS[b]);
        }
      }
    }
  }

  // Box-downsample SS×SS → 1px (alpha-weighted).
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * s + x * SS + dx) * 4;
          const al = img[i + 3] / 255;
          r += img[i] * al; g += img[i + 1] * al; b += img[i + 2] * al;
          a += img[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      const al = a / n / 255;
      out[o] = al > 0 ? r / n / al : 0;
      out[o + 1] = al > 0 ? g / n / al : 0;
      out[o + 2] = al > 0 ? b / n / al : 0;
      out[o + 3] = a / n;
    }
  }
  return out;
}

// ── Minimal PNG encoder ──────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type RGBA
  // scanlines: filter byte 0 + row
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4)
      .copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of SIZES) {
  const file = `public/icons/icon${size}.png`;
  writeFileSync(file, png(draw(size), size));
  console.log('wrote', file);
}
