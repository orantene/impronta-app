# Runbook — Cut production over from `phase-1` to `main`

**Written 2026-05-20.** Precise, sequenced, executable. Hand this to whoever
runs the cutover; do NOT improvise — `phase-1` is shared and ~80 worktrees
hang off it.

---

## TL;DR — what this actually is

It is **not a rename**. Recon (2026-05-20) found:

- `origin/main` **already exists** at `249876ab9` (2026-04-20, "Merge phase-1
  into main"). It is a **clean ancestor** of `origin/phase-1` — `main` is 0
  commits ahead, `phase-1` is 1743 ahead.
- Therefore `main` simply **fast-forwards** to `phase-1`'s tip. No name
  collision, no force-push, no history rewrite.
- Vercel's `link.productionBranch` is **already `main`** (the stale Hobby-plan
  setting). After the fast-forward, that setting finally *matches reality* —
  **no Vercel UI change needed** (the deploy-plan's "edit Vercel setting" step
  is unnecessary and was possibly impossible on Hobby — skip it).
- Edit surface is tiny: **`.github/workflows/ci.yml`** + **`CLAUDE.md`** only.
  No scripts reference the branch name.
- Only **one** worktree is literally on the `phase-1` branch (the main
  checkout `/Users/oranpersonal/Desktop/impronta-app`). The other ~80
  worktrees are on their own lane branches — they need a `git fetch`, nothing
  more.

Net: lower-risk than "rename 80 worktrees." It is "fast-forward `main`, flip
the default, edit 2 files, fetch everywhere."

---

## Phase 0 — Pre-flight gates (ALL must be true before starting)

- [ ] **0.1 — No agent mid-flight.** No lane is pushing to `phase-1` right
      now. Announce in any active chats; confirm quiet.
- [ ] **0.2 — Decide the fate of the main checkout's local commits.** As of
      2026-05-20 the main checkout's local `phase-1` is ~135 ahead / ~334
      behind origin. The fast-forward is origin-side and does NOT need them
      integrated — but you must NOT leave a zombie local branch called
      `phase-1`. Pick one:
        (a) integrate them first (Integration Round 3 — see
            `project_multi_agent_integrator_protocol.md` in memory), OR
        (b) park them: `git branch parked/local-pre-cutover-2026-05 <local-tip>`
      Either way they end up safe; (b) is fine if you just want the cutover.
- [ ] **0.3 — Snapshot safety refs.**
        git fetch origin
        git branch backup/phase-1-pre-cutover origin/phase-1
        git branch backup/main-stale-pre-cutover origin/main
        git push origin backup/phase-1-pre-cutover backup/main-stale-pre-cutover
- [ ] **0.4 — CI is green** on the current `origin/phase-1` tip (check
      GitHub Actions; the T2a "Structural quality gate" run).
- [ ] **0.5 — Production is healthy:** `cd web && npm run deploy:smoke` exits 0.

If any box is unchecked, stop.

---

## Phase 1 — Fast-forward `main` to `phase-1`

`main` is a clean ancestor, so this is a true fast-forward (no `--force`).

```
git fetch origin
# sanity — must print nothing / exit 0:
git merge-base --is-ancestor origin/main origin/phase-1 && echo "FF-safe"
# do the fast-forward:
git push origin origin/phase-1:main
```

`origin/main` now equals `origin/phase-1`. Both point at the same tip.

---

## Phase 2 — Flip the GitHub default branch

GitHub UI → repo **Settings → General → Default branch** → switch from
`phase-1` to `main`. GitHub will:
- update the default-branch pointer,
- retarget any open PRs from `phase-1` base to `main`,
- show contributors a one-line re-point command.

Do NOT delete `phase-1` yet — keep it as a transition alias for ~1 week
(Phase 6).

---

## Phase 3 — Update branch references in code (one PR onto `main`)

Only two files. Branch off `main`, edit, PR, merge.

**`.github/workflows/ci.yml`** — lines 43 + 45:
```
on:
  pull_request:
    branches: [main]      # was [phase-1]
  push:
    branches: [main]      # was [phase-1]
```
Also update the human-readable comments (lines 4, 26, 28, 48) — swap
`phase-1` → `main` so the doc text matches. Cosmetic but do it.

**`CLAUDE.md`** — 4 occurrences of `phase-1`. The "Deployment — READ FIRST"
section + "Branch coordination" section. Rewrite so:
- "Push to `main` auto-builds **production**" (no more preview/promote dance —
  see Phase 4).
- Drop the `npm run deploy:promote` instructions for normal releases (keep
  `deploy:promote` documented only as a rollback / hotfix-specific tool).
- "All active development lands on `main`" (was `phase-1`).

Merge that PR to `main`. (After Phase 5's branch protection lands, this PR
itself must pass the T2a check — fine, it's docs + workflow only.)

---

## Phase 4 — Vercel (verify only — no change needed)

Vercel `productionBranch` is already `main`. After Phase 1+2:

```
# push a trivial no-op commit to main:
git commit --allow-empty -m "chore: verify main auto-deploys to production"
git push origin main
```

Watch the Vercel dashboard — it should auto-build a **Production**
deployment (not Preview) from that push. If it does: the promote dance is
dead. If it builds a Preview instead, the productionBranch setting did NOT
take — then (and only then) try Vercel Settings → Git → Production Branch,
or contact Vercel support (Hobby-plan limitation).

Custom-domain aliasing: confirm `tulala.digital` + `app.tulala.digital`
still point at the new production deployment (`npm run deploy:check`). If
they drift, the existing `vercel-post-deploy-alias.yml` workflow + manual
`vercel alias set` fallback still apply.

---

## Phase 5 — The 3 durability pieces (do NOT skip — these make it stick)

### 5.1 — Branch protection on `main`

GitHub UI → **Settings → Branches → Add branch protection rule** for `main`:
- ☑ **Require status checks to pass before merging** → search + select
  **"Structural quality gate"** (the T2a CI job). *This is the missing link
  — T2a currently runs but does not block; this makes a red CI actually
  stop a merge.*
- ☑ **Require branches to be up to date before merging**
- ☑ **Do not allow force pushes**
- ☑ **Do not allow deletions**

### 5.2 — Migration auto-apply Action

`db:push` is manual + fragile (pooler-password auth breaks; this whole
chat couldn't run it). Automate the **Management-API path** (the one that
works — see `project_supabase_push_protocol.md` in memory).

Add repo secret: **Settings → Secrets → Actions → `SUPABASE_ACCESS_TOKEN`**
(value = the token from `web/.env.local`).

New file `.github/workflows/apply-migrations.yml`:
```yaml
name: Apply Supabase migrations on merge to main
on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']
jobs:
  apply:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - name: Apply pending migrations (Management API)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
        run: node scripts/apply-migration.mjs --apply-pending
```
Caveat: this auto-applies every migration on merge. Pre-launch that's the
right velocity trade. Re-evaluate once there are paying tenants — at that
point gate destructive migrations behind a manual approval.

### 5.3 — Confirm no-force-push (covered by 5.1's checkbox)

Already set in 5.1. Just verify the rule is active on `main`.

---

## Phase 6 — Re-point worktrees + retire `phase-1`

Only the **main checkout** has the literal `phase-1` branch. Everything else
is on lane branches.

**Main checkout** (`/Users/oranpersonal/Desktop/impronta-app`):
```
cd /Users/oranpersonal/Desktop/impronta-app
# (the 135 local commits were parked/integrated in Phase 0.2)
git fetch origin
git checkout -B main origin/main      # local main now tracks origin/main
# the old local 'phase-1' branch: either delete it, or it stays as the
# parked ref from 0.2. Do NOT keep an active branch named phase-1.
```

**All other worktrees:** a one-liner from any of them —
```
git fetch origin --prune
git remote set-head origin -a
```
Their lane branches are unaffected; only the remote-tracking ref name
changes (`origin/phase-1` → `origin/main` once `phase-1` is deleted).

**Retire `phase-1`** (after ~1 week of `main` working cleanly — gives any
stale tooling time to catch up):
```
git push origin --delete phase-1
git push origin --delete phase-1-pagebuilder-6a   # also stale; verify first
```

---

## Phase 7 — Verification (all must pass)

- [ ] Push an empty commit to `main` → Vercel builds a **Production** deploy.
- [ ] Open a test PR to `main` with a deliberate CI break (e.g. a new
      untenanted `.from()` or a tsc error) → the merge button is **BLOCKED**
      by the required "Structural quality gate" check. Close the PR.
- [ ] Add + commit a trivial migration on a branch → PR → merge → the
      `apply-migrations` Action runs and `npm run db:check` shows no drift.
- [ ] `cd web && npm run deploy:smoke` exits 0.
- [ ] `tulala.digital` + `app.tulala.digital` both 200.

---

## Rollback

If anything goes wrong at any phase:

1. **GitHub default branch** → flip back to `phase-1` (Settings → General).
2. **`main` ref** → `git push origin backup/main-stale-pre-cutover:main --force`
   (restores the pre-cutover stale `main`). Only if you must fully revert.
3. **`phase-1`** is untouched through Phases 1-5 — it is still the safety
   net. Nothing is destroyed until Phase 6's explicit `--delete`, which is
   gated a week out.
4. `backup/phase-1-pre-cutover` + `backup/main-stale-pre-cutover` refs on
   origin are the immutable snapshots.

---

## What this does and does NOT do (set expectations)

- **DOES:** kills the manual promote dance; makes `main` a true single
  source of truth; ends the recurring "hoard 76→98→135 local commits"
  divergence problem; makes a red CI actually block merges; removes the
  fragile manual `db:push` step.
- **DOES NOT:** move the codebase quality score (~80-82). This is deploy
  safety + release-friction work — a different axis. It reduces incident
  rate; it does not change the code.

## Time budget (honest)

Phase 0: 15-30 min · Phase 1: 5 min · Phase 2: 5 min · Phase 3: 30-45 min
(PR + review) · Phase 4: 15 min · Phase 5: 45-60 min · Phase 6: 20 min ·
Phase 7: 30 min. **Total ~3 hours**, not 30 min. Do it in one focused
sitting when no agent is mid-flight.
