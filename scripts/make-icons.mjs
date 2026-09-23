/*
 * Rasterises public/favicon.svg into the two bitmap icons browsers still ask
 * for by name:
 *
 *   public/favicon.ico          16/32/48px. Requested at /favicon.ico by
 *                               default whatever the <link> says, and the
 *                               size Google and Bing show beside results.
 *   public/apple-touch-icon.png 180px. iOS ignores SVG icons entirely.
 *
 * The apple icon is rendered full-bleed, with the SVG's rounded corners
 * squared off: iOS applies its own mask, and transparent corners under that
 * mask come out as black notches rather than following our curve.
 *
 * sharp cannot write ICO, so the container is assembled here. An ICO is a
 * 6-byte header, a 16-byte directory entry per image, then the images; every
 * browser since IE11-era accepts PNG payloads inside it.
 *
 * Re-run after any change to favicon.svg:  node scripts/make-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('public/favicon.svg', 'utf8');
const render = (source, size) =>
  sharp(Buffer.from(source), { density: 72 * (size / 64) * 4 })
    .resize(size, size)
    .png()
    .toBuffer();

const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((size) => render(svg, size)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width
  entry.writeUInt8(size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngs[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return entry;
});

await writeFile('public/favicon.ico', Buffer.concat([header, ...entries, ...pngs]));

const squared = svg.replace('<rect width="64" height="64" rx="6"', '<rect width="64" height="64"');
if (squared === svg) throw new Error('favicon.svg background rect changed; update the full-bleed replace');
await writeFile('public/apple-touch-icon.png', await render(squared, 180));

console.log('Wrote public/favicon.ico and public/apple-touch-icon.png');
