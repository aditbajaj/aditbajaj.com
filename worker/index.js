// Serves /api/github for the homepage panel. Runs first only for /api/*;
// everything else is the static site. The GITHUB_TOKEN secret never leaves
// this file: the browser only sees the aggregate JSON below.
//
// Privacy rule: private repos contribute COUNTS only (the calendar and the
// "private" total). Names, URLs and commit messages come from public repos.

const TTL = 600; // seconds, edge cache

const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    createdAt
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        name url stargazerCount
        primaryLanguage { name }
        defaultBranchRef { target { ... on Commit {
          history(first: 5) { nodes { messageHeadline committedDate } }
        } } }
      }
    }
  }
}`;

const json = (body, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });

async function build(env) {
  const to = new Date();
  const from = new Date(to.getTime() - 364 * 86_400_000); // GitHub allows at most a year

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "aditbajaj-com",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { login: env.GITHUB_USER, from: from.toISOString(), to: to.toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const { data, errors } = await res.json();
  if (errors || !data?.user) throw new Error("graphql");
  const u = data.user;

  const days = u.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => [d.date, d.contributionCount]);

  const repos = u.repositories.nodes;
  const byStars = [...repos].sort((a, b) => b.stargazerCount - a.stargazerCount)[0];
  const langs = {};
  for (const r of repos) if (r.primaryLanguage) langs[r.primaryLanguage.name] = (langs[r.primaryLanguage.name] ?? 0) + 1;

  // Newest commits on any public repo's default branch.
  const recent = repos
    .flatMap((r) => (r.defaultBranchRef?.target?.history?.nodes ?? []).map((c) => ({ ...c, repo: r })))
    .sort((a, b) => (a.committedDate < b.committedDate ? 1 : -1))
    .slice(0, 5);
  const latest = recent[0];

  return {
    repo: latest?.repo.name ?? "",
    url: latest?.repo.url ?? `https://github.com/${env.GITHUB_USER}`,
    recent: recent.map((c) => ({ repo: c.repo.name, msg: c.messageHeadline, date: c.committedDate })),
    stars: repos.reduce((n, r) => n + r.stargazerCount, 0),
    top: byStars?.name ?? "",
    topStars: byStars?.stargazerCount ?? 0,
    repos: repos.length,
    langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5),
    years: Math.max(1, Math.round((Date.now() - new Date(u.createdAt)) / (365.25 * 86_400_000))),
    days,
    // Private contributions over the whole window, count only.
    priv: u.contributionsCollection.restrictedContributionsCount,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.replace(/\/$/, "") !== "/api/github") return new Response("Not found", { status: 404 });
    if (request.method !== "GET") return new Response(null, { status: 405 });
    if (!env.GITHUB_TOKEN) return json({ error: "not configured" }, 503);

    env.GITHUB_USER ??= "aditbajaj";
    const cache = caches.default;
    const key = new Request(`${url.origin}/api/github`);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const res = json(await build(env), 200, TTL);
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch {
      return json({ error: "upstream" }, 502, 60);
    }
  },
};
