// Serves /api/github for the homepage panel. Runs first only for /api/*;
// everything else is the static site. The GITHUB_TOKEN secret never leaves
// this file: the browser only sees the aggregate JSON below.
//
// Private repos (Outcoach etc.) are shown by name. Commit and PR titles are
// shown too, but only ones the user wrote (flip SHOW_PRIVATE_MESSAGES to hide
// titles from private repos). Private links are never sent. The token needs
// the `repo` scope (and SSO authorisation for org repos) to see any of it.
const SHOW_PRIVATE_MESSAGES = true;

// "What I write": lines ADDED by the user's own recent commits and PRs, by
// file type. Lockfiles, generated code, data and docs don't count.
const LANG = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  dart: "Dart", py: "Python", go: "Go", rs: "Rust", astro: "Astro", svelte: "Svelte",
  html: "HTML", css: "CSS", scss: "CSS", sql: "SQL", gd: "GDScript", cs: "C#", c: "C", h: "C",
  kt: "Kotlin", swift: "Swift", java: "Java", sh: "Shell", mdx: "MDX",
};
const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.dart_tool|generated|migrations)\/|\.(g|freezed|min)\.|lock|\.d\.ts$/;
const language = (path) => (SKIP_PATH.test(path) ? null : LANG[path.split(".").pop().toLowerCase()] ?? null);
const COMMIT_FILES = 30; // REST lookups per refresh (Workers cap subrequests)
const SKIP = new Set(["aditbajaj.com"]); // the site itself: boring, and always the newest commit

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
    repositories(ownerAffiliations: [OWNER, COLLABORATOR], isFork: false, first: 100,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { ...R }
    }
    organizations(first: 10) {
      nodes { repositories(isFork: false, first: 100) { nodes { ...R } } }
    }
    # Private-org work doesn't show up per repo in the contribution calendar,
    # but the user's own pull requests do (name and date; titles only if public).
    pullRequests(first: 40, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { createdAt title repository { name isPrivate } files(first: 100) { nodes { path additions } } }
    }
  }
}

fragment R on Repository {
  name nameWithOwner url isPrivate stargazerCount
  defaultBranchRef { target { ... on Commit {
    history(first: 25) { nodes { oid messageHeadline committedDate author { user { login } } } }
  } } }
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

  const everything = [...u.repositories.nodes, ...u.organizations.nodes.flatMap((o) => o.repositories.nodes)];
  const repos = everything.filter((r) => !SKIP.has(r.name));
  const pub = repos.filter((r) => !r.isPrivate);
  const byStars = [...pub].sort((a, b) => b.stargazerCount - a.stargazerCount)[0];

  // Newest work of mine: commits on public default branches (with messages),
  // plus pull requests, which is how private org work shows up.
  const hide = (r) => r.isPrivate && !SHOW_PRIVATE_MESSAGES;
  const owned = new Set(u.repositories.nodes.map((r) => r.name));
  const commits = repos.flatMap((r) =>
    (r.defaultBranchRef?.target?.history?.nodes ?? [])
      .filter((c) => c.author?.user?.login === env.GITHUB_USER)
      .map((c) => ({ repo: r.name, full: r.nameWithOwner, oid: c.oid, private: r.isPrivate, url: r.url, msg: hide(r) ? "" : c.messageHeadline, date: c.committedDate })),
  );
  const prs = u.pullRequests.nodes
    .filter((p) => !SKIP.has(p.repository.name))
    .map((p) => ({ repo: p.repository.name, private: p.repository.isPrivate, url: "", msg: hide(p.repository) ? "" : p.title, date: p.createdAt }));
  // Org commits on the default branch are merged PRs, which are counted via
  // their files below; counting them again here would double up.
  const ownCommits = commits.filter((c) => owned.has(c.repo)).slice(0, COMMIT_FILES);

  const added = {};
  const add = (path, n) => {
    const l = language(path);
    if (l) added[l] = (added[l] ?? 0) + n;
  };
  for (const p of u.pullRequests.nodes) for (const f of p.files?.nodes ?? []) add(f.path, f.additions);
  await Promise.all(
    ownCommits.map((c) =>
      fetch(`https://api.github.com/repos/${c.full}/commits/${c.oid}`, {
        headers: { authorization: `bearer ${env.GITHUB_TOKEN}`, "user-agent": "aditbajaj-com", accept: "application/vnd.github+json" },
      })
        .then((r) => (r.ok ? r.json() : { files: [] }))
        .then((j) => (j.files ?? []).forEach((f) => add(f.filename, f.additions)))
        .catch(() => {}),
    ),
  );
  const total = Object.values(added).reduce((n, v) => n + v, 0) || 1;
  const langs = Object.entries(added)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, v]) => [name, +((v / total) * 100).toFixed(1)]);

  const recent = [...commits, ...prs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  const latest = recent[0];

  return {
    url: latest && !latest.private && latest.url ? latest.url : `https://github.com/${env.GITHUB_USER}`,
    recent: recent.map(({ repo, private: priv, msg, date }) => ({ repo, private: priv, msg, date })),
    stars: pub.reduce((n, r) => n + r.stargazerCount, 0),
    top: byStars?.name ?? "",
    topStars: byStars?.stargazerCount ?? 0,
    repos: repos.length,
    langs,
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
