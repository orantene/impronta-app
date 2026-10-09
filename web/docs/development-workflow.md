# Development Workflow — Tulala / Impronta

**Localhost-first, short-lived branches off `main`, PR back to `main`, and a
CI-gated release.** Written 2026-05-21 at the `phase-1` → `main` cutover;
rewritten 2026-08-08 to match the CI-gated production pointer that went live
2026-08-04. This is the canonical workflow doc; `CLAUDE.md` points here.

---

## TL;DR

- **`main` is canonical** — GitHub default and the single source of truth.
  Branch off it, PR back to it. Many agents share this repo, so never commit
  to `main` directly.
- **`production` is the branch Vercel actually deploys.** It is a pointer,
  not a place you work: `promote-production.yml` fast-forwards it to a `main`
  commit only after the structural quality gate passes on that exact commit.
  **A red `main` cannot reach production.**
- Every other branch you push builds an SSO-gated preview (401), which
  middleware won't render on a raw `*.vercel.app` host — see §6.

## 1. The everyday loop

```
git fetch origin && git switch -c <type>/<topic> origin/main
# ...edit; run locally: cd web && npm run dev...
cd web && npm run typecheck && npm run lint     # gate — must be clean
git add -A && git commit -m "..."
git push -u origin <type>/<topic>              # → Vercel builds an SSO-gated preview
gh pr create --base main                       # review, then merge
```

Merging the PR to `main` starts the release described in §4.

## 2. Before you commit — the gate

`cd web && npm run typecheck && npm run lint` — both clean. Don't commit a red
build.

## 3. Database migrations — the one hard rule

Supabase migrations are **not** auto-applied (deliberate — fewer moving
parts). If your change includes a new migration:

1. `date -u +%Y%m%d%H%M%S` → unique filename timestamp.
2. **`cd web && npm run db:push` BEFORE you merge the PR** (or the
   Management-API fallback — see `CLAUDE.md`).
3. `npm run db:check` → confirms no drift.

Merging migration-dependent code without applying the migration first =
silent 500s in production the moment the pointer advances. This is the one
step you can't skip.

## 4. The release — merge to main, then the pointer advances

Merging to `main` does **not** by itself deploy. The release is four steps,
and only the first is yours:

1. **Merge the PR to `main`.** Vercel builds this ref as a *preview*
   (`target: null`) — it is not live.
2. **CI runs the structural quality gate on that commit** (~11 min). If it
   fails, nothing below happens and `main-red-alert.yml` opens a pinned
   `🔴 MAIN IS RED` issue (see §10).
3. **`promote-production.yml` fast-forwards `production` to that commit** —
   automatically, on green CI only. Vercel then builds `production` with
   `target: "production"`. The workflow refuses to rewind: it promotes only
   commits that are ancestors of `origin/main`.
4. **`vercel-post-deploy-alias.yml` re-aliases** `tulala.digital` and
   `app.tulala.digital` onto the new deployment, because the production
   pointer does not reliably reassign custom domains on its own.

The promote job reconciles rather than promoting only its own trigger: on every
gate completion and every 10 minutes it fast-forwards `production` to the
**newest `main` commit whose gate run succeeded**, so a red, cancelled or
still-queued newest head does not freeze the pointer. It never moves the
pointer to a commit without a green gate and never backwards. Pacing: avoid
stacking many merges in a few minutes; each main run takes ~11 min and an
unfinished newest head simply waits while the pointer sits on the newest green
one behind it.

Then run the smoke test (§6).

If the pointer needs moving by hand — the workflow was down, or you are
promoting a commit CI already vetted — the fast-forward is:

```bash
git push origin origin/main:production
```

That is a fast-forward only. **Never force-push `production` or `main`**; to
undo a bad release, roll forward or roll back per §7 instead of rewriting the
pointer.

### Branch protection (recorded 2026-10-07, TUL-215)

Verified via `gh api repos/orantene/impronta-app/branches/<branch>/protection/required_status_checks`.

- Required status checks on BOTH `main` and `production` are exactly:
  "Structural quality gate", "Builder perf budget", "Fidelity goldens",
  "Admin boot (prod build)".
- Strict ("require branch to be up to date") is OFF on both.
- `production` is a pointer branch, fast-forwarded by `promote-production.yml`
  only when all four checks are green on that `main` commit.
- Manual fallback is a fast-forward push of a green commit, never a force.

Typecheck and lint go through `npm run typecheck` / `npm run lint` only (the
typecheck routes through the machine-wide queue `web/scripts/tsc-queue.sh`);
never call `tsc` or `eslint` directly.

## 5. Feature branches

Every change goes through one — there is no straight-to-`main` path. Keep them
short-lived and branched off the *latest* `main`; with many concurrent lanes,
a stale base is the usual cause of a semantic (non-textual) conflict, so
re-gate per §11 before merging.

One migration timestamp per agent: run `date -u +%Y%m%d%H%M%S` at the start of
your work so two lanes can't collide on the same filename.

## 6. After a deploy

Merging is not shipping. Once the pointer has advanced (§4):

1. Confirm the release is really live: `production` should be an ancestor of
   `main` and at the commit you expect —
   `git fetch origin && git log --oneline -1 origin/production`.
2. `cd web && npm run deploy:smoke` — must exit 0. Probes the live site +
   checks Supabase migration drift.

Preview `*.vercel.app` URLs don't render the app: `web/src/proxy.ts` gates
every request against `public.agency_domains` and returns 404 "Host not
registered" for anything unlisted. QA on localhost, or alias the preview onto
a host that is already seeded.

## 7. Hotfix / rollback

- **Fix forward:** branch, gate, PR, merge — the same loop, just fast. The
  release still waits on green CI, which is the point.
- **Roll back:** `cd web && npm run deploy:promote -- <previous-good-deploy-url>`.
  `deploy:promote` with no URL picks the newest deployment on *any* branch, so
  always pass the URL explicitly — an unqualified promote has shipped another
  agent's branch to production before.

## 8. Don't

- Force-push `main` or `production` (branch protection blocks `main` anyway).
  `production` only ever moves forward, by fast-forward.
- Commit to `main` directly, or develop on `production`.
- Commit `.env*` files (gitignored — keep it that way).
- Develop on `phase-1` / `stable-work` — both retired.
- **Symlink `web/node_modules` into a worktree.** Turbopack rejects it with
  "Symlink … points out of the filesystem root" the moment you run
  `npm run build` or `npm run dev`. Use `web/scripts/setup-worktree.sh`
  instead — it does a `cp -R` (~5s) which Turbopack accepts.

---

## 9. Worktrees — multi-lane work

The shared checkout at `/Users/oranpersonal/Desktop/impronta-app` is shared
with many concurrent agents and the user's own day-to-day terminal. **Never
`git switch` there.** Always operate from a per-lane worktree under
`/private/tmp/impronta-<lane>` or `/Users/oranpersonal/Desktop/impronta-<lane>`.

```bash
# Create a worktree off latest main, branched for your lane:
git fetch origin
git worktree add /private/tmp/impronta-my-lane -b feat/my-lane origin/main

# Initialize it for local dev (copies node_modules + .env.local from source):
/Users/oranpersonal/Desktop/impronta-app/web/scripts/setup-worktree.sh /private/tmp/impronta-my-lane

# Now work there:
cd /private/tmp/impronta-my-lane/web
npm run typecheck
npm run lint
```

When the lane lands, prune:

```bash
git worktree remove /private/tmp/impronta-my-lane
git branch -d feat/my-lane
```

`setup-worktree.sh` is idempotent — safe to re-run if you blew away
`node_modules` or `.env.local` for any reason.

---

## Background

The `phase-1` → `main` cutover is documented in
[`web/docs/main-branch-cutover-runbook.md`](./main-branch-cutover-runbook.md).
Before it, work happened on a shared `phase-1` branch, production was promoted
by hand, and the GitHub default (`stable-work`) had drifted weeks behind —
three branches each acting as a partial "source of truth". This collapses that
into one: `main`.

**Pipeline verified 2026-05-21** — a commit pushed to `main` auto-built and
promoted to a production deployment on Vercel, live on all domains.

**Re-verified 2026-08-08 against the CI-gated topology.** Vercel's production
branch is now `production`, not `main`: the live deployment's
`meta.githubCommitRef` is `production` with `target: "production"`, while
`main`-ref builds carry `target: null` (preview). `promote-production.yml` is
the only thing that advances the pointer, and it does so on green CI without
anyone pushing by hand.

## 10. When main is red — and how the gate contains it

Before 2026-08-04, Vercel deployed **every** push to `main` in parallel with
CI, so a red structural gate meant production might already be running the
broken commit, and every open PR failed its ratchet against it. This happened
on 2026-08-03 (#978): main sat red ~1.5h while three lanes kept merging.

The production pointer closed that hole — a red `main` no longer reaches
production, it just stops the pointer. A red `main` still blocks *everyone
else's* merges, though, so it is still an all-hands stop. Guard rails:

- **`main-red-alert.yml`** opens a pinned `🔴 MAIN IS RED` issue the moment CI
  fails on a main push, and closes it on the next green run. If that issue is
  open: fix forward or revert FIRST; merge nothing unrelated.
- **`admin-boot.yml`** builds the app, boots the **compiled** server and loads
  the admin shell + Card Design studio headlessly. It exists because
  chunk-evaluation crashes (module cycles / TDZ — the 2026-08-03 sev-1 class)
  are invisible to tsc, lint, `next build` and dev-server QA: only a
  production build evaluates client chunks in production order. It skips with
  a loud warning until the `E2E_SUPABASE_*` repo secrets are added — add them
  to arm it. When touching module-level constants in hot shared graphs
  (admin-shell page-modules especially), also verify locally:
  `npm run build && VERCEL_ENV=preview npx next start -p 3079` → load
  `/impronta/admin`.
- **`promote-production.yml`** fast-forwards the `production` branch only when
  CI succeeds on that exact `main` commit. The Vercel project's production
  branch was flipped from `main` to `production` on 2026-08-04, so this is the
  live release path, not a dry run: a red `main` simply stops the pointer
  until it is green. Nothing changes for developers — everyone still branches
  from and merges to `main`.

## 11. Branch freshness — re-gate when main moves under you

With many concurrent lanes, `main` regularly moves between your branch point
and your merge. GitHub auto-merge without textual conflicts is NOT a semantic
gate. Before merging any PR whose files were also touched on `main` since
your branch point:

```bash
git fetch origin && git log --oneline <your-base>..origin/main -- <paths you touched>
```

If anything shows, merge `origin/main` into your branch and re-run the full
gate (tsc, lint, lanes, `next build`) BEFORE merging the PR — CI on the PR
tests the merged tree, but your local prod-build/QA evidence is stale until
you refresh it.

## 12. Required checks on main

Derived from `.github/workflows/*.yml` at `origin/main` `675dc62a6`
(2026-10-07). The workflow facts come from the repo. The "Required" marks and
the recorded answers below come from the PM's answer to the admin checklist
(TUL-215); they were not read from GitHub settings by the author of this
section. Items the PM did not answer are listed as open at the end.

### Checks that exist

"Check" is the job `name:` as GitHub shows it in the PR checks list. None of
these workflows declares a `merge_group` trigger.

| Workflow file | Job id (check) | Required (per PM) | Runs on | Skipped on draft PRs? |
|---|---|---|---|---|
| `ci.yml` | `gate` ("Structural quality gate") | Yes | PR to `main` (opened, synchronize, reopened, ready_for_review), push to `main`, manual | Yes: `if: github.event_name != 'pull_request' \|\| github.event.pull_request.draft == false` |
| `admin-boot.yml` | `admin-boot` ("Admin boot (prod build)") | Yes | PR to `main` (same types plus labeled), push to `main` | Yes, and also skipped on ordinary PRs (see "Heavy checks") |
| `builder-fidelity.yml` | `fidelity` ("Fidelity goldens") | Yes | PR to `main` (same types plus labeled), push to `main` and `ci/seed-fidelity**`, manual | Yes, plus the heavy-check rule |
| `builder-fidelity.yml` | `perf-budget` ("Builder perf budget") | Yes | Same triggers as `fidelity` | Yes, plus the heavy-check rule |
| `talent-website-e2e.yml` | `migrations` ("Local Supabase + migration chain") | Not in the PM's list | PR (any base branch) touching the path filter below, manual. No push trigger | Yes, plus the heavy-check rule |

Path filter for `talent-website-e2e.yml`: `web/src/lib/talent-site/**`,
`web/src/lib/site-admin/builder-core/**`, `web/src/lib/saas/host-context.ts`,
`web/src/proxy.ts`, `web/src/components/talent/**`,
`web/src/components/admin/shell/**`, `web/e2e/talent-website/**`,
`supabase/migrations/**`, `supabase/ci/**`, and the workflow file itself.

### Heavy checks (admin-boot, fidelity, perf-budget, talent-website-e2e)

On a pull request these jobs run only when the PR is not a draft **and** its
head branch starts with `integ/` **or** it carries the `full-ci` label.
Otherwise the job is skipped (its `if:` is false). On push to `main` and on
manual runs they always run. So on an ordinary PR the only check that actually
executes is the structural gate.

### CI priority (TUL-412)

**A red 'Structural quality gate' on a solo PR = deferred to the batch, not broken.** The same `full-ci` label also runs admin boot, Builder fidelity and Talent website E2E on an ordinary PR.

GitHub has no runner-priority API; `ubuntu-latest` is one shared pool, and the
structural gate holds a runner for about 30 minutes. To keep `main`, `integ/*`
batches, `promote-production` and the post-deploy alias from waiting behind
ordinary PR gates:

1. The heavy gate runs on `main`, on `integ/*` PRs, and on ordinary PRs that
   carry the **`full-ci`** label. Any other ordinary PR fails its first step in
   seconds ("ships via an integ batch") and frees the runner; the batch that
   carries it runs the full gate. Failing (not skipping) keeps the required
   check red, so an unlabelled PR cannot be merged around the gate.
2. To merge a PR on its own: add `full-ci` (done at approval), then re-run the
   failed check. The step reads labels live, so the re-run picks it up. There is
   deliberately no `labeled` trigger (any label event would cancel an in-flight
   gate on that ref). Alternatively ship it through a one-PR `integ/*` wrapper.
3. Concurrency stays per-ref: a shared group would cancel queued gates.
4. `promote-production` cancels a superseded queued run (it reconciles to the
   newest green commit). Optional: repo variable `PROMOTE_RUNNER` takes it off
   the shared pool.

### Not PR checks

These run on other events and never report a status on a PR to `main`:

| Workflow file | Job id | Trigger |
|---|---|---|
| `promote-production.yml` | `promote` | `workflow_run` of the structural gate on `main` (acts only on success), manual |
| `main-red-alert.yml` | `alert` | `workflow_run` of the structural gate, fidelity and admin boot on `main` |
| `db-push.yml` | `push` ("Dry run" or "Apply" migrations) | Manual only, and only on `main` |
| `vercel-post-deploy-alias.yml` | `alias` | `deployment_status` success on the Production environment |
| `qa-host-pool.yml` | `claim` | `deployment_status` success on a `factory/*` preview |
| `guide-sync.yml` | `sync` | Push to `main` touching guide sources, Mondays 06:17 UTC, manual |
| `builder-e2e.yml` | `builder-e2e` ("Builder smoke (dev-signin)") | Manual only |

### Recorded answers (PM, TUL-215)

- Required checks on `main` and on `production`: "Structural quality gate",
  "Builder perf budget", "Fidelity goldens", "Admin boot (prod build)".
- "Require branches to be up to date before merging" (strict) is **off**. Section 11 therefore
  stays a manual discipline: GitHub does not force a rebase before merge.

### Still open (admin)

The PM did not answer these. Someone with admin access on
`orantene/impronta-app` should check Settings, then Branches (or Rules), record
the answers here, and delete the item.

- [ ] Whether a **merge queue** is enabled. If it is, the required workflows
      need a `merge_group` trigger, and none has one today.
- [ ] Whether a **skipped** job counts as passing for the required-check rule.
      Relevant because three of the four required checks (Admin boot, Fidelity
      goldens, Builder perf budget) are skipped on drafts and on ordinary PRs
      (see "Heavy checks"), and the structural gate is skipped on drafts.
      Verify against the live rule; do not rely on this note.
- [ ] Who may push to `production`, and whether admins can bypass the rules.
- [ ] Whether the check names above match the names GitHub has recorded.
      Required checks match by name, so a renamed job would stop satisfying the
      rule.

The rule can be read with
`gh api repos/orantene/impronta-app/branches/main/protection` or
`gh api repos/orantene/impronta-app/rules/branches/main` (admin rights may be
needed).

## 13. Stacked PRs and the CI gate

*Research note for TUL-192, verified against the workflow files on `main` at
`675dc62a6` (2026-10-07). No workflow was changed.*

**Current behaviour.** Three PR workflows only fire for PRs whose base is
`main`:

| Workflow | Trigger |
|---|---|
| `.github/workflows/ci.yml` (structural gate) | `pull_request: branches: [main]`, lines 42-44 |
| `.github/workflows/admin-boot.yml` | `pull_request: branches: [main]`, lines 18-20 |
| `.github/workflows/builder-fidelity.yml` | `pull_request: branches: [main]`, lines 4-6 |

`talent-website-e2e.yml` (lines 31-33) has no `branches` filter, but it is
path-filtered and its job only runs for `integ/*` heads or the `full-ci` label
(line 60), so it is not a general gate either.

A stacked PR (base is another feature branch) therefore gets **no gate at all**
on open or on any push: no tsc, lint, ratchets, or test lanes. Retargeting it to
`main` does not start one either, because `ci.yml:44` lists
`[opened, synchronize, reopened, ready_for_review]` and omits `edited`, which
is the event GitHub emits for a base change. The first run appears on the next
push to the branch. We did not test whether GitHub's automatic retarget after
the parent branch is merged and deleted starts a run; do not rely on it.

**Is it intended?** Nothing in the repo says so in as many words, and the
ticket's premise needs one correction: root `CLAUDE.md` does not mention
stacking. The relevant rule is `web/AGENTS.md:16`: "Fresh worktree per PR, off
the LATEST `origin/main`. Never stack branches." The header of `ci.yml`
(line 4) describes the gate as running "on every PR to `main` and every push to
`main`". So the filter is consistent with the no-stacking rule, but it is a
side effect of that filter, not a documented guarantee. It is a gap only for
people who stack anyway.

**Why it is acceptable.** The gate that decides what ships does not depend on
PR runs:

- `ci.yml:45-46` runs the same gate on every push to `main`, so the merged
  state is always tested after it lands.
- `promote-production.yml` advances `production` only when that run succeeded
  on the exact commit (line 51, re-checked at lines 90-91 for manual runs).
- `main-red-alert.yml` opens the pinned red-main issue when it fails.

So an ungated stack cannot reach production. What it can do is turn `main`
red, which per section 10 stops everyone else's merges until it is fixed. That
cost, not a release risk, is why stacking is discouraged.

**Recommended policy.**

1. Do not stack. Branch every PR off the latest `origin/main`, as section 5
   and `web/AGENTS.md` already say.
2. If PR B truly depends on unmerged PR A, wait for A to merge, then rebase B
   onto `origin/main` and open or retarget B only after that (section 11).
3. If a stack already exists, retarget the PR to `main` and push a new commit
   (a rebase push counts) so the gate runs on the final merged tree. Do not
   merge until that run is green. Run `npm run gates` locally in the meantime.
4. Do not widen the triggers (drop `branches: [main]`). Runner capacity is
   already the constraint (see the draft-PR and `full-ci` skips added during the
   2026-10-07 CI jam), and stacking is not a workflow we want to subsidise.
   Revisit only if stacking becomes routine; the alternative would be a
   dedicated lightweight `pull_request` job with no `branches` filter, which
   would be a separate ticket.

We could not read branch protection (the API returned 403 for this token), so
whether any check is *required* on `main` was not verified.

## 14. Stacked PRs and the CI trigger (TUL-219)

**Do not stack PRs.** Branch every PR off the latest `origin/main`
(`web/AGENTS.md`, "Branches and worktrees": "Never stack branches").

Why this matters for CI: `.github/workflows/ci.yml` runs on `pull_request`
types `opened`, `synchronize`, `reopened`, `ready_for_review`, and only for
PRs whose base is `main`. A stacked PR is opened against its parent branch, so
no gate runs. When the parent merges and the child is retargeted to `main`,
that is an `edited` event, which is not in the list. The child gets no gate
until its next push.

**Decision (2026-10-07): the `edited` trigger is deliberately NOT added**,
neither bare nor guarded. Reasons:

1. A bare `edited` fires on every title or body edit and queues a full
   15-25 minute gate each time. Runner capacity is the constraint.
2. The only filter is a job-level `if:` on `github.event.changes.base`. A
   skipped job still starts a workflow run, and the workflow-level
   `concurrency` group is keyed on the PR ref with `cancel-in-progress: true`.
   A title edit made while the real gate is running would cancel the in-flight
   gate and replace it with a run whose job is skipped. GitHub counts a
   skipped check as passing, so a PR could end up green with no gate having
   completed on its head. Making this safe needs a separate concurrency group
   for `edited` runs: more logic in the workflow that gates production, to
   serve a case the no-stacking rule already removes.

**If you land in a retargeted stack anyway:** push any commit to the child
branch (`git commit --allow-empty -m "ci: re-gate"` works), or close and
reopen the PR. Either starts the gate against `main`. Do not merge a
retargeted PR that shows no `Structural quality gate` check.

`src/lib/quality/ci-pr-trigger-types.static.test.ts` pins this decision. If you
revisit it, change the test and this section together.
