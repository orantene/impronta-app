# OPERATING — Tulala (SaaS) / Impronta (first tenant)

The operating contract for this repo. Every contributor — human or agent — reads this before changing anything. If a rule isn't here, it doesn't exist.

**Status:** pre-launch. No real traffic yet. Ground rules in [`feedback_pre_launch_shipping.md`](.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/feedback_pre_launch_shipping.md) override anything below until the user explicitly says **"we are live"**.

---

## 1. Trunk

- Trunk is `phase-1`. Every change lands here.
- `main` is retained only because Vercel's `link.productionBranch` is stuck on it (Hobby plan). Don't push to `main`. Don't merge into `main`. It is a frozen pointer.
- Feature branches only when the work is risky enough to want to throw away. Default: commit straight to `phase-1`.
- No long-lived branches. >7 days = land it or delete it.
- Linear history. Rebase or fast-forward. No merge commits to `phase-1`.
- No `--amend` of pushed commits. No `--force` to `phase-1`. No `--no-verify`.

## 2. Environments

| Env | Host | Purpose | Notes |
|---|---|---|---|
| **Local** | `localhost:3000` (dev), `app.local:3102` (host-routing) | Iterate fast | Hosted Supabase project `pluhdapdnuiulvxmyspd` (one DB, no separate dev DB) |
| **Preview** | `tulala-<hash>-oran-tenes-projects.vercel.app` | Vercel auto-build per push | SSO-gated 401. Don't visit raw — alias to staging |
| **Staging** | `staging.tulala.digital` | Click-through QA before prod | Re-aliased to whichever preview you want to QA. Seeded once in `agency_domains` |
| **Production** | `tulala.digital`, `app.tulala.digital`, `impronta.tulala.digital`, `improntamodels.com` | Live | Promoted via `vercel promote <preview-url> --yes` |

**One Supabase project.** Don't add a second DB until a paying second tenant exists.

## 3. The deploy ladder

```
local → push to phase-1 → Vercel builds preview → (optional) alias to staging.tulala.digital → vercel promote → smoke-test
```

1. **Local:** `npm run dev` (port 3000). Add `node scripts/local-host-proxy.mjs 3102 app.local` only if you're testing host routing.
2. **Pre-commit:** `npm run typecheck && npm run lint`. If you touched middleware / tenant / RLS / server-actions / AI / i18n, also `npm run ci`.
3. **Push:** to `phase-1`. Commit format `<surface>: <what>` (e.g. `admin/drawer: …`).
4. **Preview:** Vercel auto-builds. The preview URL is in the GitHub commit status.
5. **Staging (when you want to click through):** `vercel alias set <preview-url> staging.tulala.digital --scope oran-tenes-projects`. Hit `https://staging.tulala.digital/...`.
6. **Promote (pre-launch — ship straight):** `vercel promote <preview-url> --yes --scope oran-tenes-projects`. The post-deploy GitHub Action re-aliases the two ghost-locked hosts.
7. **Smoke:** `./scripts/smoke-prod.sh`. Green or roll back.

**Post-launch ("we are live"):** always alias to staging and click through 5–10 critical pages before `vercel promote`.

## 4. Content vs code — the hard line

| Lives in code (Git) | Lives in builder/DB |
|---|---|
| Section type definitions (registry) | Which sections appear on which page |
| Page templates (slot definitions) | Page title, slug, body, hero, meta |
| Theme preset palettes | Which preset a tenant uses (`agency_branding`) |
| Route structure | Navigation menu items, link order |
| Schema, RLS policies | Page content, post bodies, drafts |
| Capability rules | Which staff member has which role |
| Brand-shell strings ("Sign in") | Tenant copy ("Impronta Models Tulum") |

**Rule of thumb:** If a future tenant might want it different, it goes in the builder. If every tenant gets the same, it goes in code.

## 5. Domains / hosts

- Every host that serves traffic must exist in `public.agency_domains`. No exceptions.
- Marketing/app/staging hosts: `tenant_id = NULL`, `kind ∈ {marketing, app, hub, subdomain}`.
- Tenant subdomain/custom hosts: `tenant_id = <uuid>`, `kind ∈ {subdomain, custom}`.
- Local dev hosts (`app.local`, `marketing.local`, `impronta.local` etc.) are seeded once.
- Production hosts (`tulala.digital`, `app.tulala.digital`) are NEVER manually `vercel alias set` — they're managed by `vercel promote` + the post-deploy GitHub Action. Only `staging.tulala.digital` is yours to point.

## 6. Vercel

- Project `tulala`, team `oran-tenes-projects`, Hobby plan.
- Push to `phase-1` builds **preview**, not production. Manual `vercel promote` for prod.
- 9 production env vars set in Vercel dashboard. Updating env: dashboard → Settings → Environment Variables, then update `web/.env.example` in the same commit.
- No `vercel.json`. All config in dashboard.
- 2FA on Vercel: enable before launch.

## 7. Testing

- `npm run ci` is the only safety net pre-merge. It chains: typecheck → server-actions → i18n → inquiry-workspace → AI guardrails → tenant-isolation → UI-message → lint → build.
- Tenant-isolation tests (`test:tenant-isolation`) run on every CI invocation. **Do not disable.**
- One Playwright smoke test exists at `web/e2e/smoke.spec.ts` — login → builder → publish → share-link. Run before prod promotion when you've changed surfaces this touches.
- No automated post-deploy verification — `scripts/smoke-prod.sh` is the manual check.

## 8. Decision Log

The Decision Log at [`docs/decision-log.md`](docs/decision-log.md) is binding. L1–L40 are locked. To change a Locked decision: write the rationale in the log first, get approval, then change code. Never silently deviate.

## 9. Open questions parked here (resolve with the user before changing)

- **Prototype tenants** at `web/src/app/prototypes/creator-circuit/` and `prototypes/muse-bridal/`. Either migrate to real `agency_domains` rows + `cms_pages` content, or delete. Currently a third route paradigm.
- **`x-impronta-*` internal headers** (17 usages: `lib/saas/scope.ts`, `lib/auth-routing.ts`, `lib/saas/host-context.ts`, `lib/supabase/middleware.ts`, etc.). These are internal contracts not user-visible; renaming is a 20-file refactor with no functional gain. Leave until there's a reason.
- **Vercel production branch** stuck on `main`. Fix only by upgrading to Pro and editing `link.productionBranch`. Do at launch.

## 10. Where to find more

- [`AGENTS.md`](AGENTS.md) — agent operating contract (read on every change)
- [`README.md`](README.md) — install / dev / test / deploy
- [`docs/decision-log.md`](docs/decision-log.md) — locked architectural decisions
- [`docs/saas/`](docs/saas/) — multi-tenant SaaS phase docs
- [`web/AGENTS.md`](web/AGENTS.md) — Next.js 16 quirks
- `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/` — point-in-time snapshots that may have drifted; read with skepticism
