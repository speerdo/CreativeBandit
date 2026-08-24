/*
 * Transcodes the motion-design masters down to web-deliverable MP4, and pulls
 * a poster frame for each.
 *
 * The masters are delivery exports, not web assets: 269 MB across six clips,
 * all H.264 already but at 7-11 Mbps. Nothing about the format needs changing
 * - only the bitrate and the long edge. They live in assets-src/motion/ so
 * they are not deployed; only the outputs of this script are.
 *
 * ffmpeg comes from the `ffmpeg-static` devDependency rather than the system.
 * That was a deliberate choice: this machine has no Homebrew, and a build step
 * that depends on a system package is a build step that works on one laptop.
 * The package ships a platform-specific static binary, so `npm install` is the
 * whole setup.
 *
 * Run: npm run motion
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'assets-src', 'motion');
const OUT = path.join(ROOT, 'public', 'motion');

/*
 * Slugs are stable, human-readable, and decoupled from the master filenames -
 * which carry client codes, aspect ratios, revision numbers and the odd
 * " copy". The page references these, so renaming a master does not break a
 * page; only this map has to keep up.
 *
 * Order here is the order they appear on the page, and it is a curated
 * running order rather than a chronological one - see the note in
 * src/pages/work/motion.astro before rearranging it.
 */
const CLIPS = [
  { slug: 'last-gnome-location', src: 'LGL_26-Q3_How-It-Works_Animation_V3.mp4' },
  { slug: 'pupper-portraits', src: 'PP_DOG_Video Cut Out_(1080x1920).mp4' },
  { slug: 'swan-global-investment', src: 'SGI_Investing Redefined_Explainer_(1920x1080) copy.mp4' },
  { slug: 'everest-comms', src: 'Everest_What We Do_FB_(1200x628)_15s copy.mp4' },
  { slug: 'measure-l', src: 'Disneyland_Measure L_30s Explainer_(1920x1080) copy.mp4' },
  { slug: 'all-knowing', src: 'KM_2021-07_All-Knowing_(1200x1200).mp4' },
];

/*
 * 900px on the long edge. These are motion-design pieces shown in a column on
 * a portfolio page, not a cinema - and the cap has to be on the LONG edge
 * rather than the width, because the set runs from 16:9 through square to
 * 9:16. Capping width alone would leave the vertical pieces enormous.
 *
 * CRF 26 with a 2.2 Mbps ceiling: motion graphics are flat colour and hard
 * edges, which H.264 handles well, so this is visually close to the master at
 * roughly a tenth the size.
 */
const LONG_EDGE = 900;
const CRF = 26;
const MAXRATE = '2200k';
const BUFSIZE = '4400k';

/* The whole page's worth. Generous for video, but this is the one page where
   the media IS the content - and it only downloads on play (preload="none"). */
const BUDGET_MB = 40;

/*
 * ffmpeg-static resolves to null on a platform it has no build for, and its
 * postinstall can be skipped by npm's script policy - so the binary is checked
 * rather than assumed.
 */
const FFMPEG = ffmpegPath ?? '';
try {
  if (!FFMPEG) throw new Error('ffmpeg-static exported no path');
  execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
} catch (err) {
  console.error(
    `Could not run the bundled ffmpeg (${FFMPEG || 'no path'}).\n\n` +
      '  npm install\n\n' +
      'If that does not fix it, the postinstall may have been skipped:\n' +
      '  npm approve-scripts ffmpeg-static\n'
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const clip of CLIPS) {
  const from = path.join(SRC, clip.src);
  if (!existsSync(from)) {
    console.error(`missing master: ${clip.src}`);
    process.exit(1);
  }

  const mp4 = path.join(OUT, `${clip.slug}.mp4`);
  const poster = path.join(OUT, `${clip.slug}.jpg`);

  /*
   * scale: long edge to LONG_EDGE, short edge to whatever keeps the aspect,
   * rounded to even numbers because H.264 requires it. The conditional picks
   * the orientation, so one filter serves portrait, square and landscape.
   */
  const scale =
    `scale='if(gte(iw,ih),min(${LONG_EDGE},iw),-2)':'if(lt(iw,ih),min(${LONG_EDGE},ih),-2)'` +
    `,scale=trunc(iw/2)*2:trunc(ih/2)*2`;

  execFileSync(
    FFMPEG,
    [
      '-y', '-loglevel', 'error',
      '-i', from,
      '-vf', scale,
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-crf', String(CRF),
      '-maxrate', MAXRATE,
      '-bufsize', BUFSIZE,
      '-preset', 'slow',
      '-pix_fmt', 'yuv420p',
      // Moves the index to the front so playback can start before the whole
      // file has arrived. Without it a 2 MB clip still waits for a full
      // download.
      '-movflags', '+faststart',
      // These are silent motion pieces on a portfolio page; audio would only
      // be a surprise. Dropped rather than muted, which also saves bytes.
      '-an',
      mp4,
    ],
    { stdio: 'inherit' }
  );

  // Poster from one second in - frame zero is often a fade from black.
  execFileSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-ss', '1', '-i', from, '-vf', scale, '-frames:v', '1', '-q:v', '4', poster],
    { stdio: 'inherit' }
  );

  const mb = statSync(mp4).size / 1048576;
  const pk = statSync(poster).size / 1024;
  total += mb;
  console.log(`  ${clip.slug.padEnd(24)} ${mb.toFixed(1).padStart(6)} MB   poster ${pk.toFixed(0).padStart(4)} KB`);
}

console.log(`  ${'total'.padEnd(24)} ${total.toFixed(1).padStart(6)} MB`);

if (total > BUDGET_MB) {
  console.error(
    `\nOver budget: ${total.toFixed(1)} MB against a ${BUDGET_MB} MB cap.\n` +
      `Drop LONG_EDGE before touching CRF - resolution costs less quality than\n` +
      `quantisation does on flat-colour motion graphics.`
  );
  process.exit(1);
}

const stale = readdirSync(OUT).filter(
  (f) => !CLIPS.some((c) => f === `${c.slug}.mp4` || f === `${c.slug}.jpg`)
);
if (stale.length) console.log(`\nnote: unreferenced files in public/motion: ${stale.join(', ')}`);
