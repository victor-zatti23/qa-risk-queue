import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, groupByTicket, ticketKey, changeType, surface, AGGRAVATOR_CAP } from '../src/risk.mjs';
import { configKeysFromPatch } from '../src/collect.mjs';

let seq = 0;
const pr = (over = {}) => ({
  repo: 'app', fullName: 'acme/app', number: ++seq, title: 'feat: something', url: '', author: 'dev',
  mergedAt: `2026-10-01T10:${String(seq % 60).padStart(2, '0')}:00Z`, lines: 50, review: 'APPROVED',
  branch: 'feat/something', files: ['src/thing.ts', 'src/thing.test.ts'], filesTruncated: false, ...over,
});
const surfaces = { app: { surface: 'App', critical: true } };
const base = p => p.signals.find(s => s.kind === 'base')?.id;

test('a test file whose name contains "guard" is not an authorization change', () => {
  const [p] = score([pr({ files: ['internal/tools/tool_names_guard_test.go', 'internal/tools/names.go'] })], { surfaces });
  assert.equal(base(p), 'product');
});

test('documentation living under an auth folder is not an authorization change', () => {
  const [p] = score([pr({ title: 'chore(docs): crosslinks', files: ['apps/docs/content/guides/auth/auth-mfa.mdx', 'apps/docs/content/guides/auth/redirect-urls.mdx'] })], { surfaces });
  assert.equal(p.score, 0);
});

test('authz matches path segments, not substrings', () => {
  const [a] = score([pr({ files: ['app/regulations/gates/route.ts'] })], { surfaces });
  const [b] = score([pr({ files: ['src/auth/prehandler.ts'] })], { surfaces });
  assert.notEqual(base(a), 'authz');
  assert.equal(base(b), 'authz');
});

test('auth-named code on a non-critical surface is only a weak signal', () => {
  const map = { app: { surface: 'Docs site', critical: false } };
  const [p] = score([pr({ files: ['apps/docs/app/guides/auth/page.tsx'] })], { surfaces: map });
  assert.equal(base(p), 'authz_weak');
});

test('authzIgnore removes product screens that are merely named after auth', () => {
  const files = ['apps/studio/components/interfaces/Auth/BasicAuthSettingsForm.tsx'];
  const [flagged] = score([pr({ files })], { surfaces });
  const [calibrated] = score([pr({ files })], { surfaces, authzIgnore: ['/components/interfaces/Auth/'] });
  assert.equal(base(flagged), 'authz');
  assert.equal(base(calibrated), 'product');
});

test('"token" alone is a weak authz signal, not a strong one', () => {
  const [p] = score([pr({ files: ['landing/form-token.ts'] })], { surfaces: {} });
  assert.equal(base(p), 'authz_weak');
  assert.equal(p.baseWeight, 2);
});

test('aggravators are capped, so a sliced UI ticket cannot outrank a production config change', () => {
  const noisy = Array.from({ length: 4 }, () => pr({
    branch: 'feat/APP-1-ui', review: null, lines: 900, filesTruncated: true, files: ['src/ui/page.tsx'],
  }));
  const prodChange = pr({ branch: 'chore/APP-2-flag', review: null, files: ['deploy/environments/production/values.yaml'] });
  const groups = groupByTicket(score([...noisy, prodChange], { surfaces }));
  const ui = groups.find(g => g.ticket === 'APP-1');
  const prod = groups.find(g => g.ticket === 'APP-2');
  assert.equal(ui.aggravators.length, 5);
  assert.equal(ui.score, 2 + AGGRAVATOR_CAP);
  assert.ok(prod.score >= ui.score, `prod ${prod.score} should be >= ui ${ui.score}`);
});

test('docs and style changes leave the queue unless they touch something structural', () => {
  const [doc] = score([pr({ files: ['README.md'] })], { surfaces });
  const [style] = score([pr({ title: 'style: values', files: ['deploy/environments/production/values.yaml'] })], { surfaces });
  assert.equal(doc.score, 0);
  assert.equal(base(style), 'prod');
});

test('a fix that comes after another delivery of the same ticket is flagged as a repeat', () => {
  const first = pr({ branch: 'feat/APP-9-export', mergedAt: '2026-10-01T09:00:00Z' });
  const fix = pr({ branch: 'fix/APP-9-export', title: 'fix: export', mergedAt: '2026-10-01T15:00:00Z' });
  score([first, fix], { surfaces });
  assert.ok(fix.signals.some(s => s.id === 'repeat_fix'));
  assert.ok(!first.signals.some(s => s.id === 'repeat_fix'));
});

test('the same ticket in two repos is an integration risk', () => {
  const a = pr({ branch: 'feat/APP-5-x' });
  const b = pr({ branch: 'feat/APP-5-x', repo: 'api', fullName: 'acme/api' });
  score([a, b], { surfaces });
  assert.ok(a.signals.some(s => s.id === 'multi_repo'));
});

test('ticket keys come from branch or title, and the pattern can be turned off', () => {
  assert.equal(ticketKey(pr({ branch: 'feat/abc-1234-slug' })), 'ABC-1234');
  assert.equal(ticketKey(pr({ branch: 'x', title: 'feat(PAY-77): thing' })), 'PAY-77');
  assert.equal(ticketKey(pr({ branch: 'feat/ABC-1' }), null), null);
});

test('change type reads conventional commits and branch prefixes', () => {
  assert.equal(changeType(pr({ title: 'fix(api): x' })), 'fix');
  assert.equal(changeType(pr({ title: 'Update deps', branch: 'chore/deps' })), 'chore');
  assert.equal(changeType(pr({ title: 'feat!: drop v1', branch: 'x' })), 'feat');
});

test('path rules can mark a single folder of a monorepo as critical', () => {
  const map = { app: { surface: 'Tooling', critical: false, paths: [['^apps/studio/', 'Studio', true]] } };
  assert.deepEqual(surface(pr({ files: ['apps/studio/page.tsx'] }), map), { name: 'Studio', critical: true, mapped: true });
  assert.deepEqual(surface(pr({ files: ['scripts/x.js'] }), map), { name: 'Tooling', critical: false, mapped: true });
});

test('config keys are read from the patch of config files only', () => {
  const keys = configKeysFromPatch([
    { filename: 'deploy/values-prod.yaml', patch: '@@\n+  FEATURE_EXPORT: "true"\n-  OLD_FLAG: x\n' },
    { filename: '.env.example', patch: '+API_TIMEOUT=30\n' },
    { filename: 'src/app.ts', patch: '+  NOT_CONFIG: 1\n' },
  ]);
  assert.deepEqual(keys, ['API_TIMEOUT', 'FEATURE_EXPORT']);
});
