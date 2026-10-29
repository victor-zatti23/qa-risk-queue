import { ghJson, poolMap } from './gh.mjs';

const QUERY = `
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 30, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url mergedAt createdAt additions deletions changedFiles
      reviewDecision headRefName baseRefName
      author { login } repository { name nameWithOwner }
      labels(first: 8) { nodes { name } }
      files(first: 100) { nodes { path additions deletions } }
    } }
  }
}`;

export function windowStart(since) {
  if (/^\d+d$/.test(since)) {
    const d = new Date(Date.now() - parseInt(since) * 864e5);
    return d.toISOString().replace(/\.\d+Z$/, 'Z');
  }
  if (/^\d+h$/.test(since)) {
    const d = new Date(Date.now() - parseInt(since) * 36e5);
    return d.toISOString().replace(/\.\d+Z$/, 'Z');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) return `${since}T00:00:00Z`;
  return since;
}

export async function collect({ scope, since = '1d', maxPages = 34 }) {
  const start = windowStart(since);
  const q = `${scope} is:pr is:merged merged:>=${start}`;
  const prs = [];
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const args = ['api', 'graphql', '-F', `q=${q}`, '-f', `query=${QUERY}`];
    if (after) args.push('-F', `after=${after}`);
    const r = await ghJson(args);
    const s = r?.data?.search;
    if (!s) break;
    for (const n of s.nodes) if (n && n.number) prs.push(normalize(n));
    if (!s.pageInfo.hasNextPage) break;
    after = s.pageInfo.endCursor;
    if (page === maxPages - 1) console.error(`[warning] the window hit the ${maxPages * 30} PR cap — result is TRUNCATED, use a smaller window`);
  }
  return { scope, start, prs };
}

export function normalize(n) {
  return {
    repo: n.repository?.name ?? '?',
    fullName: n.repository?.nameWithOwner ?? '?',
    number: n.number,
    title: (n.title || '').trim(),
    url: n.url,
    author: n.author?.login ?? '?',
    mergedAt: n.mergedAt,
    createdAt: n.createdAt,
    lines: (n.additions || 0) + (n.deletions || 0),
    fileCount: n.changedFiles || 0,
    review: n.reviewDecision,
    branch: n.headRefName || '',
    base: n.baseRefName || '',
    labels: (n.labels?.nodes || []).map(l => l.name),
    files: (n.files?.nodes || []).map(f => f.path),
    filesTruncated: (n.changedFiles || 0) > (n.files?.nodes?.length || 0),
  };
}

const RE_KEY = /^\+\s{0,8}([A-Z][A-Z0-9_]{2,})\s*[:=]/;
const RE_CONFIG_FILE = /(values.*\.ya?ml|\/environments\/|(^|\/)\.env|config\.ya?ml)/i;

export function configKeysFromPatch(files) {
  const keys = new Set();
  for (const f of files) {
    if (!RE_CONFIG_FILE.test(f.filename)) continue;
    for (const line of (f.patch || '').split('\n')) {
      const m = RE_KEY.exec(line);
      if (m) keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

export async function configKeys(prs, concurrency = 4) {
  const target = prs.filter(p => p.signals?.some(s => s.id === 'config' || s.id === 'prod'));
  await poolMap(target, concurrency, async (p) => {
    const files = await ghJson(['api', `repos/${p.fullName}/pulls/${p.number}/files?per_page=100`]);
    p.configKeys = configKeysFromPatch(files);
    return true;
  });
  return prs;
}
