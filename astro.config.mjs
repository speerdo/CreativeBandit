import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';

export default defineConfig({
  // Needed so canonical and og:image resolve to absolute URLs. Social
  // platforms reject relative og:image paths.
  site: 'https://creativebandit.studio',
  integrations: [tailwind(), mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'dracula',
      wrap: true,
    },
  },
});