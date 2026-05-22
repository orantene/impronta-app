# Development Workflow — Tulala / Impronta

**The standard for everyone — humans and agents — working on this repo.**
Written 2026-05-21, at the `phase-1` → `main` branch cutover. This is the
canonical workflow doc; `CLAUDE.md` points here.

---

## TL;DR

- **`main` is the one canonical branch.** It is the GitHub default branch, the
  Vercel production branch, and what production runs. There is no other "real"
  branch.
- **Develop local-first on a short-lived feature branch off `main`.** Commit
  cleanly. Open a PR. Merge to `main` only when the work is a meaningful,
  tested checkpoint.
- **A merge to `main` is a production release** — Vercel auto-builds and
  deploys it. Don't merge half-done work.

---

## 1. Branch model

| Branch | Role |
|---|---|
| `main` | Canonical. Production. Always deployable. Protected. |
| `<type>/<topic>` | Your short-lived feature branch. Lives days, not weeks. Deleted after merge. |
| `phase-1` | **Retired** former shared working branch. Do not develop on it. Kept briefly as a transition alias, then deleted. |
| `stable-work` | **Retired** stale former default branch. Ignore it. |
| `backup/*-pre-cutover` | Immutable safety snapshots from the cutover. Do not touch or delete. |

`<type>` is one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
`hotfix`. Example: `feat/inquiry-compare`, `fix/directory-facet-count`.

## 2. Start a feature

```
git fetch origin
git switch -c feat/<topic> origin/main
```

Always branch off the *latest* `origin/main`. Never start from a stale local
branch.

## 3. Develop locally

- Run the app locally — `cd web && npm run dev` — and QA there first.
  Localhost is instant; a Vercel round-trip is 5–10 min.
- Commit in clean, logical chunks. One concern per commit. Write real commit
  messages.
- Do **not** push after every tiny commit. Push when you have a coherent unit
  of work to back up or share.
- Keep the working tree clean — never commit unrelated dirty files. If files
  appear that aren't yours, leave them; don't sweep them into your commit.

## 4. Before every commit — the gate

```
cd web && npx tsc --noEmit && npm run lint
```

A red TS/lint build must not be committed. CI re-runs this on the PR (§8).

## 5. Database migrations

Supabase migrations are **not** auto-applied. If your work adds a migration:

1. Generate a unique timestamp: `date -u +%Y%m%d%H%M%S`.
2. Apply it to remote Supabase **before merging**: `cd web && npm run db:push`
   (or the Management-API fallback if the pooler auth fails — see `CLAUDE.md`).
3. Verify: `npm run db:check` shows no drift.

Merging migration-dependent code to `main` without applying the migration
first = silent 500s in production. This is non-negotiable.

## 6. Open a PR

```
git push -u origin feat/<topic>
gh pr create --base main --fill        # or open it in the GitHub UI
```

- PR target is always `main`.
- Keep PRs reviewable — small and focused beats one giant PR.
- Describe what changed and how you tested it.

## 7. When to merge / deploy

- A merge to `main` **is** the deploy. Treat it as a release checkpoint, not a
  save button.
- Merge only when the gate passes, you've QA'd locally, and the work is a
  meaningful increment.
- Do **not** merge to `main` to "back up" unfinished work — that is what your
  feature branch is for.
- No random deploys. If you're not ready to ship, don't merge.

## 8. CI

`.github/workflows/ci.yml` ("Structural quality gate") runs on every PR to
`main` and every push to `main`: tsc, lint, the suppressions ratchet, and the
curated test suites. Keep it green.

> As of the cutover the gate has **pre-existing failures** (lint +
> `tenant-isolation`, `builder-capabilities`, `node-presentation` tests) carried
> over from `phase-1`. They are tracked for a dedicated fix. Until that lands,
> do not make the gate a *required* merge check, and do not pile new failures
> on top of the known ones.

## 9. How production works

- Vercel project `tulala`, team `oran-tenes-projects`, root directory `web`.
- Vercel's production branch is `main`. Merging to `main` triggers a
  **production** deployment automatically.
- Pushing any other branch triggers a **preview** deployment (SSO-gated 401).
  Preview `*.vercel.app` URLs do **not** render the app — middleware gates on
  registered hosts; QA on a real domain (see the QA caveat in `CLAUDE.md`).
- After a deploy: `cd web && npm run deploy:smoke` — must exit 0.

## 10. Hotfixes

For an urgent production fix:

```
git switch -c hotfix/<topic> origin/main
# fix, gate, commit
git push -u origin hotfix/<topic>
gh pr create --base main --fill
# merge → auto-deploys
```

Same flow, just fast. To **roll back** instead of fixing forward:
`cd web && npm run deploy:promote -- <previous-good-deploy-url>` re-promotes an
earlier deployment.

## 11. Multi-agent coordination

When several agents work at once:

- Each agent: own feature branch off `main`; own isolated git worktree if
  needed.
- One migration timestamp per agent — never collide.
- Never force-push `main`. Never rebase or reset a branch another agent may be
  using.
- Integrate by merging PRs into `main`, not by cross-merging feature branches.

## 12. Handoff between agents

Leave the repo clean: working tree clean, your branch pushed, PR open or
merged. State in the PR (or handoff note) what is done, what is verified, and
what remains. Don't leave uncommitted files in the shared checkout.

## 13. What not to touch

- `main` — only via merged PR; never direct commits, never force-push.
- `backup/*-pre-cutover` branches — safety snapshots.
- Other agents' feature branches and worktrees.
- `.env*` files — never commit them (already gitignored).

---

## Background

The `phase-1` → `main` cutover is documented in
[`web/docs/main-branch-cutover-runbook.md`](./main-branch-cutover-runbook.md).
Before the cutover, development happened directly on a shared `phase-1` branch,
production was promoted by hand, and the GitHub default branch (`stable-work`)
had drifted weeks behind reality — three different branches each acting as a
partial "source of truth". This workflow collapses that into one: `main`.

## Pipeline verification

- **2026-05-21** — End-to-end pipeline test: a commit pushed to `main`
  auto-built and promoted to a `production` deployment on Vercel, with the
  live domains serving it. The `main` → production sync is confirmed working.
