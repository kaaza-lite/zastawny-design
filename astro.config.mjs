// Astro config. Static output, no server.
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Final domain, used for canonical URLs and the sitemap. Confirm before launch.
  site: 'https://zastawny.design',
  output: 'static',
  integrations: [mdx(), sitemap()],
});
