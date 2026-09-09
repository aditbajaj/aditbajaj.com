// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  adapter: cloudflare(),
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
  integrations: [mdx()]
});
