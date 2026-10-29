# qa-risk-queue

**English** · [Português](README.pt-BR.md)

> Every morning: *what should I test today?*

When AI writes most of the code, a pipeline can go from **19 to 803 merged PRs a month** while approvals drop to a minority. Nobody tests 800 PRs by hand, and testing the most recent ones first is just a lottery.

`qa-risk-queue` reads what was merged in a time window on GitHub and ranks it by **where a human tester still matters**: production config, authorization, data migrations, API contracts, tickets delivered in slices. Each item comes with *what to check*, not just a score.

```
## 1. [HIGH 7] supabase/supabase#52238 — feat(studio): require grants in fetch wrappers for FGA-annotated endpoints
Surface: Studio (dashboard) · 1 PR(s) / 1407 lines
Signals: authz + no_tests, large, truncated
What to check:
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal)
  and with an expired session, not only the happy path.
- Merged without automated tests: manual cases matter here — main path, empty state and error path.
...
```

224 PRs from one week of `supabase/supabase` → **15 items worth a tester's time**, 78 discarded as docs/style/tests. Full output: [examples/supabase-week-2026-10-22.md](examples/supabase-week-2026-10-22.md).

## Run it

Requires Node 20+ and the [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`). No npm dependencies.

```bash
node src/cli.mjs --repo supabase/supabase --config examples/supabase.json --since 1d
node src/cli.mjs --org my-company --since 7d --top 12
node src/cli.mjs --org my-company --critical-only
npm test
```

The report goes to stdout and to `out/queue/<date>.md`. Raw data is saved to `out/data/<date>.json`, which is the history used to spot tickets that keep coming back.

## How the score works

The **nature of the change** sets the base. Process smells only **aggravate** it, and they are capped.

| Base signal | Weight | Fires when the PR touches… |
|---|---|---|
| `prod` | 4 | production environment config |
| `authz` | 4 | auth/permission/session/tenant path segments on a critical surface |
| `breaking` | 3 | a `feat!:` / `BREAKING CHANGE` title |
| `migration` | 3 | migrations or `.sql` |
| `contract` | 3 | OpenAPI, protobuf, GraphQL, schemas |
| `config` | 2 | non-production env config, Helm, Terraform |
| `authz_weak` | 2 | `token`/`guard`/`credential`, or auth code on a non-critical surface |
| `product` | 2 | code on a surface marked critical |
| `support` | 1 | any other code |

**Aggravators** (+1 each, **max +3**): `no_review`, `no_tests`, `large` (>800 lines), `truncated` (>100 files), `multi_repo` (same ticket in several repos), `repeat_fix` (a fix after another delivery of the same ticket), `sliced` (ticket split into 3+ PRs).

Score ≥ 6 is **HIGH**, ≥ 4 **MEDIUM**. The default cutoff for the queue is 4. PRs are grouped by **ticket key** (`ABC-123` from branch or title), because the tester's unit of work is the ticket, not the PR.

## Design decisions that came from real mistakes

Every rule below exists because the first version got something wrong on real data. The tests in [`test/risk.test.mjs`](test/risk.test.mjs) lock each one in.

- **Aggravators are capped at +3.** Without the cap, a UI ticket split into 16 PRs (product 2 + four aggravators) ranked above a production config change. The nature of the change has to win; process smells are hints, not verdicts.
- **`no_review` and `no_tests` don't count as base signals.** When most PRs merge without approval, those signals are the normal state of the pipeline. As a base they discriminate nothing and push everything up.
- **Test files and docs are ignored by base signals.** `tool_names_guard_test.go` matched "guard" and put a test-only PR at the top. On Supabase, a docs PR with 70 `.mdx` files under `guides/auth/` showed up as an authorization change.
- **Authorization matches path segments, not substrings.** `regulations/gates/route.ts` is not access control. `src/auth/prehandler.ts` is.
- **`token` is a weak signal.** A `form-token.ts` on a landing page is anti-spam, and it was item #1 of a weekly queue.
- **Auth on a non-critical surface is weak, and each repo can calibrate.** In Supabase, *Auth* is the name of a dashboard screen. `authzIgnore` in the config removes those paths without turning the rule off everywhere.
- **Collection fails loudly.** GitHub search stops at 1,000 results, so a truncated window prints a warning. A silent gap would make the queue lie by omission. Transient 5xx/429 errors are retried with backoff.

## Config

```json
{
  "ticketPattern": "\\b([A-Z][A-Z0-9]{1,9})-(\\d{1,6})\\b",
  "authzIgnore": ["/components/interfaces/Auth/"],
  "repos": {
    "my-monorepo": {
      "surface": "Tooling",
      "critical": false,
      "paths": [
        ["^apps/dashboard/", "Dashboard", true],
        ["^apps/docs/", "Docs site", false]
      ]
    }
  }
}
```

- `repos` maps a repo, or a folder inside it, to the **surface** a tester actually opens. The first matching path wins, and the optional third item overrides `critical` for that folder.
- `ticketPattern` sets how ticket keys are found. Use `null` for repos without a tracker key.
- `authzIgnore` lists path regexes that look like auth but are not access control.

## Limits

- It ranks risk from metadata (paths, size, review, tests). It does not read the diff, except for config key names.
- It doesn't know if something was already tested. Pair it with your tracker.
- Calibration is per codebase. Expect to spend the first week tuning `surfaces` and `authzIgnore`.

## License

MIT
