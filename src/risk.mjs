const AUTHZ_STRONG = new Set(['auth', 'authz', 'authn', 'authentication', 'authorization', 'permission', 'permissions', 'role', 'roles', 'rbac', 'policy', 'policies', 'license', 'licenses', 'keycloak', 'jwt', 'oidc', 'oauth', 'saml', 'sso', 'acl', 'tenant', 'tenancy', 'scope', 'scopes', 'session', 'sessions', 'login', 'signin', 'mfa']);
const AUTHZ_WEAK = new Set(['token', 'tokens', 'guard', 'guards', 'credential', 'credentials']);
const segments = path => path.toLowerCase().split(/[\/._-]+/);
const touchesAuthz = path => segments(path).some(x => AUTHZ_STRONG.has(x));
const touchesAuthzWeak = path => segments(path).some(x => AUTHZ_WEAK.has(x));

const RE = {
  test: /(_test\.go$|\.spec\.[jt]sx?$|\.test\.[jt]sx?$|(^|\/)e2e\/|(^|\/)tests?\/|__tests__|_test\.py$|(^|\/)test_[^/]*\.py$)/i,
  prod: /(\/environments\/production\/|values[-.]prod|prod(uction)?\.ya?ml$|\.env\.production$)/i,
  config: /(helm\/|values.*\.ya?ml$|\/environments\/|(^|\/)\.env|config\.ya?ml$|\.tf$|terraform|(^|\/)docker-compose[^/]*\.ya?ml$)/i,
  migration: /(migrations?\/|\.sql$)/i,
  contract: /(openapi|swagger|\.proto$|\.graphql$|schema\.(json|ya?ml|ts|go)$)/i,
  doc: /\.(md|mdx|txt|rst)$/i,
  code: /\.(ts|tsx|js|jsx|mjs|cjs|go|py|cs|java|kt|rb|php|vue|svelte|sql|rs|swift)$/i,
};

export const WHAT_TO_CHECK = {
  sliced: 'Ticket delivered across several PRs: check that the final behavior is what the ticket asked for, not the sum of half-deliveries.',
  authz_weak: 'Touched token/credential files — could be real authorization or just form protection. Confirm which before investing time.',
  breaking: 'Marked as a breaking change: consumers (clients, integrations, other services) may stop working with no visible error — test the consumer, not just the producer.',
  prod: 'PRODUCTION config changed: check the real state of the flag in prod and compare with the lower environments before giving any verdict.',
  config: 'Environment config changed: check parity of the touched keys across environments — a feature on in one and off in the other raises no error, it just leaves users without the feature.',
  authz: 'Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.',
  migration: 'Data migration: check records that existed before the change, not only new ones.',
  contract: 'API contract changed: consumers may break without any visible error on screen.',
  no_tests: 'Merged without automated tests: manual cases matter here — main path, empty state and error path.',
  no_review: 'Merged without approval: no second pair of eyes saw this before it hit the main branch.',
  large: 'Large PR: look for side effects outside what the ticket asked for.',
  truncated: 'PR with more than 100 files: the file list is truncated, read the diff on GitHub.',
  multi_repo: 'The same ticket changed more than one repo: integration risk — test end to end, not each side.',
  repeat_fix: 'The ticket already came back with a fix: sign of an incomplete delivery, look at what was left out.',
};

export const DEFAULT_TICKET_PATTERN = '\\b([A-Z][A-Z0-9]{1,9})-(\\d{1,6})\\b';

export function ticketKey(pr, pattern = DEFAULT_TICKET_PATTERN) {
  if (!pattern) return null;
  const re = new RegExp(pattern);
  const m = re.exec(pr.branch.toUpperCase()) || re.exec(pr.title);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

const TYPES = ['revert', 'hotfix', 'fix', 'feat', 'chore', 'style', 'refactor', 'docs', 'test', 'perf', 'build', 'ci'];

export function changeType(pr) {
  for (const s of [pr.title.toLowerCase(), pr.branch.toLowerCase()])
    for (const k of TYPES)
      if (new RegExp(`^${k}(\\([^)]*\\))?!?[/:(]`).test(s) || new RegExp(`(^|/)${k}[/(:]`).test(s)) return k;
  return 'other';
}

export function surface(pr, surfaces = {}) {
  const cfg = surfaces[pr.repo] || surfaces[pr.fullName];
  if (!cfg) return { name: pr.repo, critical: null, mapped: false };
  for (const [re, name, critical] of cfg.paths || [])
    if (pr.files.some(f => new RegExp(re).test(f))) return { name, critical: critical ?? cfg.critical, mapped: true };
  return { name: cfg.surface, critical: cfg.critical, mapped: true };
}

const RE_BREAKING = /^[a-z]+(\([^)]*\))?!:|BREAKING[ _-]?CHANGE/;
const STRUCTURAL = ['prod', 'authz', 'migration', 'contract', 'breaking'];

const BASE = [
  { id: 'breaking', weight: 3, when: p => RE_BREAKING.test(p.title) },
  { id: 'prod', weight: 4, when: p => p.prodFiles.some(f => RE.prod.test(f)) },
  { id: 'authz', weight: 4, when: p => p.surface.critical !== false && p.authzFiles.some(touchesAuthz) },
  { id: 'authz_weak', weight: 2, when: p => p.authzFiles.some(touchesAuthzWeak) || p.authzFiles.some(touchesAuthz) },
  { id: 'migration', weight: 3, when: p => p.prodFiles.some(f => RE.migration.test(f)) },
  { id: 'contract', weight: 3, when: p => p.prodFiles.some(f => RE.contract.test(f)) },
  { id: 'config', weight: 2, when: p => !p.prodFiles.some(f => RE.prod.test(f)) && p.prodFiles.some(f => RE.config.test(f)) },
  { id: 'product', weight: 2, when: p => p.surface.critical === true && p.prodFiles.some(f => RE.code.test(f)) },
  { id: 'support', weight: 1, when: p => p.surface.critical !== true && p.prodFiles.some(f => RE.code.test(f)) },
];

export const AGGRAVATOR_CAP = 3;

const AGGRAVATORS = [
  { id: 'no_review', when: p => p.review !== 'APPROVED' },
  { id: 'no_tests', when: p => !p.configOnly && !p.files.some(f => RE.test.test(f)) },
  { id: 'large', when: p => p.lines > 800 },
  { id: 'truncated', when: p => p.filesTruncated },
];

const capped = p => p.baseWeight + Math.min(AGGRAVATOR_CAP, p.signals.filter(x => x.kind === 'aggravator').length);

export function score(prs, { surfaces = {}, ticketPattern = DEFAULT_TICKET_PATTERN, authzIgnore = [] } = {}) {
  const ignored = authzIgnore.map(re => new RegExp(re));
  for (const p of prs) {
    p.docOnly = p.files.length > 0 && p.files.every(f => RE.doc.test(f));
    p.prodFiles = p.files.filter(f => !RE.test.test(f) && !RE.doc.test(f));
    p.authzFiles = p.prodFiles.filter(f => !ignored.some(re => re.test(f)));
    p.configOnly = p.prodFiles.length > 0 && !p.prodFiles.some(f => RE.code.test(f));
    p.ticket = ticketKey(p, ticketPattern);
    p.type = changeType(p);
    p.surface = surface(p, surfaces);
    p.signals = [];
    p.score = 0;
    p.baseWeight = 0;
    const bases = BASE.filter(r => r.when(p));
    const structural = bases.some(b => STRUCTURAL.includes(b.id));
    if ((p.docOnly || ['docs', 'style', 'test'].includes(p.type)) && !structural) continue;
    const base = bases.sort((a, b) => b.weight - a.weight)[0];
    if (!base) continue;
    p.signals.push({ id: base.id, weight: base.weight, kind: 'base' });
    p.baseWeight = base.weight;
    for (const a of AGGRAVATORS) if (a.when(p)) p.signals.push({ id: a.id, weight: 1, kind: 'aggravator' });
    p.score = capped(p);
  }
  const byTicket = new Map();
  for (const p of prs) if (p.ticket) { if (!byTicket.has(p.ticket)) byTicket.set(p.ticket, []); byTicket.get(p.ticket).push(p); }
  for (const [, group] of byTicket) {
    group.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
    const repos = new Set(group.map(p => p.fullName));
    for (const [i, p] of group.entries()) {
      if (p.score === 0) continue;
      if (repos.size > 1) p.signals.push({ id: 'multi_repo', weight: 1, kind: 'aggravator' });
      if (i > 0 && ['fix', 'hotfix', 'revert'].includes(p.type)) p.signals.push({ id: 'repeat_fix', weight: 1, kind: 'aggravator' });
      p.score = capped(p);
    }
  }
  return prs.sort((a, b) => b.score - a.score || b.lines - a.lines);
}

export function groupByTicket(prs) {
  const groups = new Map();
  for (const p of prs) {
    if (p.score === 0) continue;
    const key = p.ticket ?? `${p.fullName}#${p.number}`;
    if (!groups.has(key)) groups.set(key, { key, ticket: p.ticket, prs: [] });
    groups.get(key).prs.push(p);
  }
  for (const g of groups.values()) {
    g.prs.sort((a, b) => b.score - a.score);
    const owner = g.prs[0];
    g.title = owner.title;
    g.surfaces = [...new Set(g.prs.map(p => p.surface.name))];
    g.critical = g.prs.some(p => p.surface.critical === true);
    g.authors = [...new Set(g.prs.map(p => p.author))];
    g.base = owner.signals.find(x => x.kind === 'base')?.id;
    g.aggravators = [...new Set(g.prs.flatMap(p => p.signals.filter(x => x.kind === 'aggravator').map(x => x.id)))];
    if (g.prs.length > 2) g.aggravators.push('sliced');
    g.score = owner.baseWeight + Math.min(AGGRAVATOR_CAP, g.aggravators.length);
    g.configKeys = [...new Set(g.prs.flatMap(p => p.configKeys || []))];
    g.lines = g.prs.reduce((n, p) => n + p.lines, 0);
    g.lastMerge = g.prs.map(p => p.mergedAt).sort().at(-1);
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || b.lines - a.lines);
}

export const band = s => (s >= 6 ? 'HIGH' : s >= 4 ? 'MEDIUM' : 'LOW');
