import { existsSync, readFileSync } from 'node:fs';

// `astro dev` doesn't run the Cloudflare Worker, so serve /api/github from the
// same worker/index.js here when a token is available (.dev.vars, gitignored,
// or the GITHUB_TOKEN environment variable). Otherwise it proxies to the
// deployed site, so you don't need the key locally.
export function devApi() {
  const env = () => {
    const vars = {};
    if (existsSync('.dev.vars')) {
      for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\s]*)"?\s*$/);
        if (m) vars[m[1]] = m[2];
      }
    }
    return { GITHUB_TOKEN: process.env.GITHUB_TOKEN, ...vars };
  };

  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/github', async (_req, res) => {
        globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };
        const { default: worker } = await server.ssrLoadModule('/worker/index.js');
        const vars = env();
        // No local token: ask the deployed Worker, which holds the real secret.
        // (Cloudflare secrets are write-only, so they can't be read locally.)
        const r = vars.GITHUB_TOKEN
          ? await worker.fetch(new Request('http://localhost/api/github'), vars, { waitUntil() {} })
          : await fetch('https://aditbajaj.com/api/github/').catch(() => new Response('{"error":"offline"}', { status: 502 }));
        res.statusCode = r.status;
        res.setHeader('content-type', 'application/json');
        res.end(await r.text());
      });
    },
  };
}
