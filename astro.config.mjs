// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://aditbajaj.com',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
  integrations: [mdx()]
});
