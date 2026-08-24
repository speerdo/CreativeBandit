/*
 * Bakes the Illustrator texture masters down to web-sized WebP.
 *
 * The masters are unusable as shipped: `cb scan 02.svg` is 3.4 MB of raw
 * vector paths, `cb grain 02.svg` is 1.6 MB of base64 PNG in an SVG wrapper.
 * Everything under public/ is copied verbatim into dist/ and deployed, so
 * they live in assets-src/ instead and only these outputs are served.
 *
 * Rasterising is the right call even for the SVG sources. Two of the three
 * are wrapped bitmaps already, and the third is a scan texture whose whole
 * job is to sit blurred at ~0.07 opacity — there is nothing for the vector
 * form to buy at that size, and the browser would pay to re-render those
 * paths on every resize.
 *
 * Run: npm run textures
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'assets-src', 'textures');
const OUT = path.join(ROOT, 'public', 'textures', 'baked');

/*
 * Two size classes, and the reason they differ:
 *
 *  - Page textures tile across a fixed, viewport-sized layer, so they need
 *    enough resolution that the repeat is not obvious on a wide desktop.
 *  - Shape elements are placed decorations a few hundred px across, so half
 *    the width is already generous.
 *
 * Quality stays at 70 for both. If a file blows the budget the fix is
 * `width`, not `quality` — these are low-contrast textures viewed at low
 * opacity, so detail is worth far less here than bytes are.
 */
const JOBS = [
  { src: 'cb grain 01.svg', out: 'grain-01.webp', width: 800 },
  { src: 'cb grain 02.svg', out: 'grain-02.webp', width: 800 },
  { src: 'cb scan 02.svg', out: 'scan-02.webp', width: 800 },
  // See `alphaFromLuminance` below for why these two are baked differently.
  { src: 'cb scan 01@4x.png', out: 'shape-scan-01.webp', width: 520, alphaFromLuminance: true },
  { src: 'cb scan 03@4x.png', out: 'shape-scan-03.webp', width: 520, alphaFromLuminance: true },
];

// §8 of docs/creative-bandit-visual-identity.md sets a Lighthouse >= 90
// mobile bar. Only one page texture loads per route, so the per-page cost is
// roughly a fifth of this — but the whole set still has to stay honest.
const BUDGET_KB = 250;

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const job of JOBS) {
  const from = path.join(SRC, job.src);
  const to = path.join(OUT, job.out);

  /*
   * Two things going on in this one chain:
   *
   * `density` only affects SVG input, where it sets the rasterisation DPI.
   * The masters have small viewBoxes (~220 units wide), so at the default 72
   * they rasterise to a few hundred pixels and resizing up to the target
   * width would just be upscaling blur. Raising the density renders them
   * large natively and lets resize work downwards, which does no harm.
   *
   * `grayscale` is free: every master is already achromatic — measured R, G
   * and B channel means are identical on all five — so dropping to one
   * channel throws nothing away and takes about 30% off the encode. It also
   * forces the issue at the usage site: a shape element cannot carry its own
   * colour, so it has to be tinted from the token set, which is what keeps
   * §8's "two inks per composition" rule enforceable rather than
   * aspirational.
   *
   * Re-check this if a master is ever re-exported with real ink in it.
   */
  const gray = sharp(from, { density: 600 })
    .resize({ width: job.width, withoutEnlargement: true })
    .grayscale();

  if (job.alphaFromLuminance) {
    /*
     * The shape scans are used as CSS masks so one asset can be tinted to any
     * ink. That does not work on them as delivered: all the structure lives
     * in luminance while the alpha channel is essentially solid (measured
     * mean 254 of 255), so masking on alpha would paint a flat rectangle and
     * throw the texture away.
     *
     * `mask-mode: luminance` is the CSS answer and is widely supported now,
     * but baking the luminance INTO alpha here is strictly better: it needs
     * no support caveat, no vendor-prefixed sibling, and the encode is
     * smaller because the colour channels become a constant.
     *
     * Not inverted, deliberately. These scans are bright smears on a dark
     * field, so luminance-as-alpha keeps the streaks as the ink and lets the
     * dead field drop out — which is the graphic element we actually want.
     * Inverting would give a solid slab with the streaks punched out of it.
     */
    const { data, info } = await gray.removeAlpha().raw().toBuffer({ resolveWithObject: true });

    await sharp({
      create: {
        width: info.width,
        height: info.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
      .webp({ quality: 70, alphaQuality: 60 })
      .toFile(to);
  } else {
    await gray.webp({ quality: 70 }).toFile(to);
  }

  const kb = statSync(to).size / 1024;
  total += kb;
  console.log(`  ${job.out.padEnd(20)} ${kb.toFixed(1).padStart(7)} KB`);
}

console.log(`  ${'total'.padEnd(20)} ${total.toFixed(1).padStart(7)} KB`);

if (total > BUDGET_KB) {
  // Loud rather than advisory: the whole point of this script is that these
  // assets do not quietly get big again.
  console.error(
    `\nOver budget: ${total.toFixed(1)} KB against a ${BUDGET_KB} KB cap.\n` +
      `Reduce the \`width\` on the largest job above rather than the quality.`
  );
  process.exit(1);
}
