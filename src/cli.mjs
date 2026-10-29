#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { collect, configKeys } from './collect.mjs';
import { score, groupByTicket, DEFAULT_TICKET_PATTERN } from './risk.mjs';
import { render } from './report.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const has = n => process.argv.includes(`--${n}`);

const USAGE = `Usage: qa-risk-queue (--org <org> | --repo <owner/name>) [options]

  --since <1d|12h|YYYY-MM-DD>   merge window (default 1d)
  --config <file>               surfaces map + ticket pattern (JSON)
  --cutoff <n>                  minimum risk to enter the queue (default 4)
  --top <n>                     items shown in detail (default 8)
  --critical-only               only items that touch a critical surface
  --out <dir>                   where to save the report and raw data (default ./out)
  --no-config-keys              skip fetching patches for config key names`;

const org = arg('org');
const repo = arg('repo');
if (has('help') || (!org && !repo)) { console.log(USAGE); process.exit(org || repo ? 0 : 1); }

const scope = repo ? `repo:${repo}` : `org:${org}`;
const configPath = arg('config');
const config = configPath ? JSON.parse(readFileSync(resolve(configPath), 'utf8')) : {};
const surfaces = config.repos || {};
const ticketPattern = 'ticketPattern' in config ? config.ticketPattern : DEFAULT_TICKET_PATTERN;
const authzIgnore = config.authzIgnore || [];
const cutoff = Number(arg('cutoff', 4));
const top = Number(arg('top', 8));
const out = resolve(arg('out', 'out'));
const day = new Date().toISOString().slice(0, 10);

function loadHistory() {
  const dir = join(out, 'data');
  if (!existsSync(dir)) return new Map();
  const h = new Map();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && f !== `${day}.json`).slice(-30)) {
    try {
      for (const p of JSON.parse(readFileSync(join(dir, f), 'utf8')).prs || [])
        if (p.ticket) h.set(p.ticket, (h.get(p.ticket) || 0) + 1);
    } catch {}
  }
  return h;
}

const { prs, start } = await collect({ scope, since: arg('since', '1d') });
score(prs, { surfaces, ticketPattern, authzIgnore });
if (!has('no-config-keys')) await configKeys(prs);
let groups = groupByTicket(prs);
if (has('critical-only')) groups = groups.filter(g => g.critical);

const md = render({ day, scope, start, prs, groups, cutoff, top, history: loadHistory() });
mkdirSync(join(out, 'queue'), { recursive: true });
mkdirSync(join(out, 'data'), { recursive: true });
writeFileSync(join(out, 'queue', `${day}.md`), md);
writeFileSync(join(out, 'data', `${day}.json`), JSON.stringify({ day, scope, start, prs }, null, 1));
console.log(md);
console.error(`\n[queue saved to ${join(out, 'queue', `${day}.md`)} · raw data in ${join(out, 'data', `${day}.json`)}]`);
