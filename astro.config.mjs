// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { devApi } from './dev-api.js';

export default defineConfig({
  site: 'https://aditbajaj.com',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  vite: { plugins: [devApi()] },
  integrations: [mdx()]
});
