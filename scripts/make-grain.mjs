// Bakes a tiling grayscale noise tile to PNG.
// Grain is high-frequency, so a small tile has no perceptible seam.
// Grayscale (PNG color type 0) keeps the file tiny.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 128;
const OUT = process.argv[2];

// Deterministic PRNG so rebuilding produces a byte-identical asset.
let seed = 0x9e3779b9;
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0xffffffff;
}

// Gaussian-ish via averaging: gentler than uniform noise, closer to film grain.
function grain() {
  const n = (rand() + rand() + rand()) / 3;
  // Centre on mid-gray (128) so `mix-blend-mode: overlay` is neutral where
  // the noise is average, and only deviations lighten/darken the page.
  const spread = 110;
  return Math.max(0, Math.min(255, Math.round(128 + (n - 0.5) * spread)));
}

const raw = Buffer.alloc(SIZE * (SIZE + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter type: None
  for (let x = 0; x < SIZE; x++) raw[p++] = grain();
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // color type: grayscale
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} — ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB`);
