# QA risk queue — 2026-10-29

Scope: `repo:supabase/supabase` · merged since `2026-10-22T00:00:00Z` · **224 PRs** in 1 repo(s)
Without approval: **1** (0%) · without ticket key: **224** · items in the queue (risk ≥ 4): **15** of 146

Busiest surfaces: Studio (dashboard) (91) · Docs site (57) · Marketing site (31) · Design system / content (16) · Shared UI (11) · Monorepo (tooling) (11)

## 1. [HIGH 7] supabase/supabase#52238 — feat(studio): require grants in fetch wrappers for FGA-annotated endpoints
**Surface:** Studio (dashboard) · **author:** charislam · **1 PR(s)** / 1407 lines · **last merge:** 26 Oct, 08:58
**Signals:** authz + no_tests, large, truncated
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- Merged without automated tests: manual cases matter here — main path, empty state and error path.
- Large PR: look for side effects outside what the ticket asked for.
- PR with more than 100 files: the file list is truncated, read the diff on GitHub.
PRs: [supabase#52238](https://github.com/supabase/supabase/pull/52238) (feat)

## 2. [MEDIUM 5] supabase/supabase#50837 — feat(studio): link log users and show Auth activity timelines
**Surface:** Studio (dashboard) · **author:** SaxonF · **1 PR(s)** / 982 lines · **last merge:** 29 Oct, 12:15
**Signals:** authz + large
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- Large PR: look for side effects outside what the ticket asked for.
PRs: [supabase#50837](https://github.com/supabase/supabase/pull/50837) (feat)

## 3. [MEDIUM 5] supabase/supabase#52396 — refactor(studio): declare Assistant tool availability on contracts
**Surface:** Studio (dashboard) · **author:** charislam · **1 PR(s)** / 901 lines · **last merge:** 27 Oct, 15:06
**Signals:** authz + large
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- Large PR: look for side effects outside what the ticket asked for.
PRs: [supabase#52396](https://github.com/supabase/supabase/pull/52396) (refactor)

## 4. [MEDIUM 5] supabase/supabase#52105 — feat(studio): add Grant type and useGrant/getGrant/ensureGrant
**Surface:** Studio (dashboard) · **author:** charislam · **1 PR(s)** / 853 lines · **last merge:** 22 Oct, 14:32
**Signals:** authz + large
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- Large PR: look for side effects outside what the ticket asked for.
PRs: [supabase#52105](https://github.com/supabase/supabase/pull/52105) (feat)

## 5. [MEDIUM 5] supabase/supabase#51981 — feat(studio): adopt shared inline code defaults
**Surface:** Studio (dashboard) · **author:** dnywh · **1 PR(s)** / 696 lines · **last merge:** 21 Oct, 21:49
**Signals:** authz + truncated
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- PR with more than 100 files: the file list is truncated, read the diff on GitHub.
PRs: [supabase#51981](https://github.com/supabase/supabase/pull/51981) (feat)

## 6. [MEDIUM 5] supabase/supabase#52334 — chore(eslint): allowlist grant and connectionString in query exhaustive-deps
**Surface:** Studio (dashboard) · **author:** charislam · **1 PR(s)** / 257 lines · **last merge:** 27 Oct, 05:27
**Signals:** authz + no_tests
**What to check:**
- Access/permission code changed: test with a user WITHOUT the permission (expect a clear 403/refusal) and with an expired session, not only the happy path.
- Merged without automated tests: manual cases matter here — main path, empty state and error path.
PRs: [supabase#52334](https://github.com/supabase/supabase/pull/52334) (chore)

---
Off the agenda: **131 items** with risk 1–3 · 78 PRs with no apparent risk (docs, style, tests).
In the queue but outside the top 6: supabase/supabase#52109 (5), supabase/supabase#52379 (5), supabase/supabase#52339 (4), supabase/supabase#52243 (4), supabase/supabase#52120 (4), supabase/supabase#52463 (4), supabase/supabase#52338 (4), supabase/supabase#52382 (4), supabase/supabase#52464 (4)