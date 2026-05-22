# Development Workflow — Tulala / Impronta

**Solo-dev workflow, optimized for speed: localhost-first, push straight to
`main`, ship fast.** Written 2026-05-21 at the `phase-1` → `main` cutover.
This is the canonical workflow doc; `CLAUDE.md` points here.

---

## TL;DR

- **`main` is the only branch that matters** — GitHub default, Vercel
  production branch, and what's live. Work on it directly.
- **Develop locally, commit clean chunks, push to `main` when a chunk is
  solid → it auto-deploys to production.** No PR, no promote step.
- Use a throwaway feature branch *only* for big/risky work you want to sit on
  before shipping.

## 1. The everyday loop

```
git pull                                      # latest main
# ...edit; run locally: cd web && npm run dev...
cd web && npx tsc --noEmit && npm run lint     # gate — must be clean
git add -A && git commit -m "..."
git push                                       # → Vercel builds + deploys production (~2-3 min)
```

That's the whole loop.

## 2. Before you commit — the gate

`cd web && npx tsc --noEmit && npm run lint` — both clean. Don't commit a red
build.

## 3. Database migrations — the one hard rule

Supabase migrations are **not** auto-applied (deliberate — fewer moving
parts). If your change includes a new migration:

1. `date -u +%Y%m%d%H%M%S` → unique filename timestamp.
2. **`cd web && npm run db:push` BEFORE you push the code** (or the
   Management-API fallback — see `CLAUDE.md`).
3. `npm run db:check` → confirms no drift.

Pushing migration-dependent code without applying the migration first =
silent 500s in production. This is the one step you can't skip.

## 4. When to push

- Push when you have a **coherent, working chunk** — not after every
  keystroke, not half-done.
- Every push to `main` is a production release. If it's not ready to be live,
  don't push it — commit locally and keep going.

## 5. Feature branches — optional, risky work only

For something big you want to preview before it's live:

```
git switch -c feat/<topic>     # work, commit
git push -u origin feat/<topic>  # → Vercel gives a preview URL
```

Merge to `main` when ready. For everyday changes, skip this — straight to
`main` is fine.

## 6. After a deploy

`cd web && npm run deploy:smoke` — must exit 0. Probes the live site + checks
Supabase migration drift. (Preview `*.vercel.app` URLs don't render the app —
middleware gates on registered hosts; QA on a real domain or localhost.)

## 7. Hotfix / rollback

- **Fix forward:** edit, gate, `git push` — same loop, just fast.
- **Roll back:** `cd web && npm run deploy:promote -- <previous-good-deploy-url>`.

## 8. Don't

- Force-push `main` (branch protection blocks it anyway).
- Commit `.env*` files (gitignored — keep it that way).
- Develop on `phase-1` / `stable-work` — both retired.

---

## Background

The `phase-1` → `main` cutover is documented in
[`web/docs/main-branch-cutover-runbook.md`](./main-branch-cutover-runbook.md).
Before it, work happened on a shared `phase-1` branch, production was promoted
by hand, and the GitHub default (`stable-work`) had drifted weeks behind —
three branches each acting as a partial "source of truth". This collapses that
into one: `main`.

**Pipeline verified 2026-05-21** — a commit pushed to `main` auto-built and
promoted to a production deployment on Vercel, live on all domains. The
`main` → production sync works end to end.
