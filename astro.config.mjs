import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';

import react from '@astrojs/react';

export default defineConfig({
  // Needed so canonical and og:image resolve to absolute URLs. Social
  // platforms reject relative og:image paths.
  site: 'https://creativebandit.studio',
  /*
   * Every marketing page stays prerendered exactly as before. The adapter is
   * here for the scanner's API route alone, which opts out per-file with
   * `export const prerender = false`. Astro only emits a serverless function
   * for those routes, so the 14 static pages are unaffected.
   */
  output: 'static',
  adapter: vercel({
    /*
     * Set explicitly rather than inherited, because the plan default has
     * changed over time and a default below the scan budget would kill a slow
     * scan mid-flight - the visitor gets a Vercel timeout page instead of the
     * partial report the scanner is careful to produce.
     *
     * Sized against the worst case in scan.ts: an 8s reachability precheck
     * before the budget timer starts, plus SCAN_BUDGET_MS (45s), plus room to
     * serialise the response. 60 is the ceiling on the lowest plan. If
     * SCAN_BUDGET_MS grows, this has to grow first - never the other way
     * round.
     */
    maxDuration: 60,
  }),
  /*
   * Tailwind 4 ships as a Vite plugin. The old @astrojs/tailwind integration
   * peers on astro ^3-^5 and was never updated for 6 or 7, so it is not an
   * option here; this is the supported path, not a preference.
   */
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'dracula',
      wrap: true,
    },
  },
});