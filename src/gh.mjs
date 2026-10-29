import { execFile } from 'node:child_process';

export function gh(args) {
  return new Promise((ok, no) => {
    execFile('gh', args, { maxBuffer: 64 * 1024 * 1024 }, (err, out, errout) => {
      if (err) return no(new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${errout || err.message}`));
      ok(out);
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TRANSIENT = /HTTP (50[0234]|429)|timeout|EAI_AGAIN|ECONNRESET|secondary rate limit|was submitted too quickly/i;

export async function ghJson(args, { attempts = 4 } = {}) {
  let last;
  for (let t = 1; t <= attempts; t++) {
    try { return JSON.parse(await gh(args)); }
    catch (e) {
      last = e;
      if (!TRANSIENT.test(String(e.message))) throw e;
      if (t === attempts) break;
      const wait = 2000 * 2 ** (t - 1);
      console.error(`[retry ${t}/${attempts - 1}] ${String(e.message).slice(0, 80)} — waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw last;
}

export async function poolMap(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { res[k] = await fn(items[k], k); } catch (e) { res[k] = { _error: String(e.message || e) }; }
    }
  }));
  return res;
}
