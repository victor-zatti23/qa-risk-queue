import { band, WHAT_TO_CHECK } from './risk.mjs';

const when = s => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function render({ day, scope, start, prs, groups, cutoff, top, history = new Map() }) {
  const queue = groups.filter(g => g.score >= cutoff);
  const noReview = prs.filter(p => p.review !== 'APPROVED').length;
  const noTicket = prs.filter(p => !p.ticket).length;
  const pct = n => (prs.length ? Math.round(n / prs.length * 100) : 0);
  const bySurface = [...prs.reduce((m, p) => m.set(p.surface.name, (m.get(p.surface.name) || 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1]);

  const L = [];
  L.push(`# QA risk queue — ${day}`);
  L.push('');
  L.push(`Scope: \`${scope}\` · merged since \`${start}\` · **${prs.length} PRs** in ${new Set(prs.map(p => p.fullName)).size} repo(s)`);
  L.push(`Without approval: **${noReview}** (${pct(noReview)}%) · without ticket key: **${noTicket}** · items in the queue (risk ≥ ${cutoff}): **${queue.length}** of ${groups.length}`);
  L.push('');
  if (bySurface.length) L.push(`Busiest surfaces: ${bySurface.slice(0, 6).map(([n, q]) => `${n} (${q})`).join(' · ')}`);
  L.push('');

  if (!queue.length) L.push('_Nothing above the cutoff in this window._');

  for (const [i, g] of queue.slice(0, top).entries()) {
    L.push(`## ${i + 1}. [${band(g.score)} ${g.score}] ${g.ticket ?? g.key} — ${g.title}`);
    L.push(`**Surface:** ${g.surfaces.join(' + ')} · **author:** ${g.authors.join(', ')} · **${g.prs.length} PR(s)** / ${g.lines} lines · **last merge:** ${when(g.lastMerge)}`);
    const seen = g.ticket && history.get(g.ticket);
    L.push(`**Signals:** ${g.base ?? '?'}${g.aggravators.length ? ' + ' + g.aggravators.join(', ') : ''}${seen ? ` · ticket already showed up in ${seen} previous queue(s)` : ''}`);
    if (g.configKeys.length) L.push(`**Config keys changed:** \`${g.configKeys.join('`, `')}\``);
    const check = [g.base, ...g.aggravators].filter(x => WHAT_TO_CHECK[x]).map(x => `- ${WHAT_TO_CHECK[x]}`);
    if (check.length) { L.push('**What to check:**'); L.push(...check); }
    L.push(`PRs: ${g.prs.map(p => `[${p.repo}#${p.number}](${p.url}) (${p.type})`).join(' · ')}`);
    L.push('');
  }

  const below = groups.filter(g => g.score < cutoff);
  const zero = prs.filter(p => p.score === 0).length;
  L.push('---');
  L.push(`Off the agenda: **${below.length} items** with risk 1–${cutoff - 1} · ${zero} PRs with no apparent risk (docs, style, tests).`);
  if (queue.length > top) L.push(`In the queue but outside the top ${top}: ${queue.slice(top).map(g => `${g.ticket ?? g.key} (${g.score})`).join(', ')}`);
  return L.join('\n');
}
