# Deployment — READ FIRST

This project deploys to **Vercel** (project `tulala`, team `oran-tenes-projects`). GitHub auto-deploys are live as of 2026-04-23.

- Pushes to any branch auto-build a **preview** on Vercel (SSO-gated 401).
- Push to `phase-1` builds a **preview, not production** — Vercel's internal `link.productionBranch` is stale at `"main"` (Hobby plan won't let us edit). Promote releases with `vercel promote <preview-url> --yes`.
- Post-deploy GitHub Action (`.github/workflows/vercel-post-deploy-alias.yml`) re-aliases the two ghost-locked domains (`tulala.digital`, `app.tulala.digital`) after every prod deploy. No manual step needed.

## QA caveat (important for any feature dev)

`web/src/middleware.ts` gates every request against the `public.agency_domains` DB table. Any host not in the table returns **404 "Host not registered"** before route matching. This means **raw `*.vercel.app` preview URLs will NOT render the app** — they're not in `agency_domains`.

To QA a preview, either:
- `vercel promote <preview-url> --yes` and test on `tulala.digital` / `app.tulala.digital` / `impronta.tulala.digital`, or
- `vercel alias set <preview-url> <seeded-host>` where the target is already in `agency_domains` (no staging host is currently reserved — seed one if you need it).

## Full deploy topology

Domain list, env vars, Supabase seeding contract, ghost-project alias workaround, Vercel IDs, account security notes, branch situation — all in the user-level auto-memory file `project_vercel_deployment.md` (at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`). Treat that file as the source of truth for anything deploy-adjacent.
