# AGENTS — operating contract for this repo

You are working in a multi-tenant SaaS Next.js app at pre-launch. Read before any change.

## Read first

1. [`OPERATING.md`](OPERATING.md) — environments, deploy ladder, content/code split, smoke procedure.
2. [`docs/decision-log.md`](docs/decision-log.md) — L1–L40 locked architectural decisions. Don't silently deviate.
3. [`web/AGENTS.md`](web/AGENTS.md) — Next.js 16 has breaking changes from your training data.
4. The relevant `_test.ts` neighbor of any file you're about to edit.

## Standing rules

1. **Trunk is `phase-1`.** Don't push to `main`. Don't create long-lived feature branches. Direct commits to `phase-1` are the default at pre-launch.
2. **One canonical version per surface.** No `*-v2.tsx`, no `old-*` folders, no parallel mockups, no backup-named files. Edit live. If risky, branch in git — not in the filesystem.
3. **Stay scoped.** A bug fix fixes one bug. A feature lands one feature. Refactors require explicit user authorization. "Consolidating" / "modernizing" without an ask = stop and ask.
4. **No new top-level directories, env vars, npm dependencies, or branches that might survive >7 days without permission.**
5. **Pre-commit gate:** `npm run typecheck && npm run lint`. If middleware / tenant / RLS / server-actions / AI / i18n changed, also `npm run ci`.
6. **Commit messages:** `<surface>: <terse what>`. Surfaces in active use: `admin/`, `talent/`, `client/`, `directory/`, `feat(api)/`, `feat(edit-chrome)/`, `docs/`, `chore/`, `ci/`. Don't invent prefixes.
7. **Reporting:** files touched, behavior changed, what to verify. No marketing copy in agent summaries.
8. **When in doubt, raise — don't work around.** A perceived contradiction in this file is escalation, not a license to choose.
9. **Never:** `--amend` pushed commits. `--no-verify`. `git push --force` to `phase-1`. `git reset --hard` of pushed commits. Skipping `npm run ci` on tenant/RLS work.
10. **Pre-launch (today):** ship straight to prod after `npm run ci` passes. No per-promote permission needed (see `feedback_pre_launch_shipping.md` in user memory). Post-launch ("we are live"): always alias to `staging.tulala.digital` and click through before `vercel promote`.

## Tenant-touching changes — extra inspection list

If your change touches host resolution, RLS, server actions in admin scope, or anything in `web/src/lib/saas/`, also read:

- [`web/src/middleware.ts`](web/src/middleware.ts)
- [`web/src/lib/saas/scope.ts`](web/src/lib/saas/scope.ts)
- [`web/src/lib/saas/admin-scope.ts`](web/src/lib/saas/admin-scope.ts)
- [`web/src/lib/saas/surface-allow-list.ts`](web/src/lib/saas/surface-allow-list.ts)
- [`web/src/lib/saas/host-context.ts`](web/src/lib/saas/host-context.ts)
- [`docs/saas/`](docs/saas/) — current phase state

And run `npm run test:tenant-isolation` before push.

## What "scope" looks like

- ✅ "Add a `published_at_human` formatted column to the page list" — one file, one concern.
- ✅ "Fix the apostrophe escape in the billing nav copy" — one string.
- ❌ "Refactor the inquiry workspace primitives" — broad refactor, requires user ask.
- ❌ "While I'm here, I noticed the admin nav also has the same pattern, fixing that too" — out of scope, raise instead.

## Pointers

| Need | Go to |
|---|---|
| How to deploy | [`OPERATING.md` §3](OPERATING.md) |
| How to run dev | [`README.md`](README.md) and `scripts/dev.sh` |
| What's locked | [`docs/decision-log.md`](docs/decision-log.md) |
| Vercel topology | `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_vercel_deployment.md` (verify against current state — memories drift) |
| Brand split (Tulala vs Impronta) | [`web/src/lib/brand/tulala.ts`](web/src/lib/brand/tulala.ts) |
| Smoke after prod | `./scripts/smoke-prod.sh` |
