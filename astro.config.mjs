import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
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
  adapter: vercel(),
  integrations: [tailwind(), mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'dracula',
      wrap: true,
    },
  },
});