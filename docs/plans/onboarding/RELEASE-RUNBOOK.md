# Onboarding module · release runbook (Phase 6)

Everything ships behind `onboarding_module_enabled` (platform default `settings` row, off). With it off, the marketing CTAs behave exactly as before: talent modal, `/get-started`.

## Before flipping anything

1. Full Playwright suite on the isolated stack at low load: `PLAYWRIGHT_BASE_URL=http://localhost:3105 PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/onboarding --project=chromium --project=mobile-onboarding --workers=1 --timeout=90000` → 28/28.
2. One real-model run of `understood.spec.ts` with a QA Upstash + model key in `web/.env.local` (isolated worktree) and the cost rows checked in `cms_ai_usage_log` (`context_jsonb.cost_usd` present for extraction and the compose copy pass).
3. Production env (owner): `ENABLE_SITE_SHELL=all` (or `tenants` + ids) in Vercel Production, redeploy. Without it a composed site renders the legacy header.
4. Production Upstash KV present (`UPSTASH_REDIS_REST_URL`/`_TOKEN`): the understand step fails closed to the short form without it (honest, but the AI never runs).

## The switches, in order (owner, `/platform/admin/operations`)

| # | Switch | Where | After it, verify (read-only) |
|---|---|---|---|
| 1 | `ENABLE_SITE_SHELL` | Vercel env + redeploy | `curl -s https://<any composed tenant>.tulala.digital/` shows the Look header |
| 2 | `ai_master_enabled` | Operations flags | nothing visible yet |
| 3 | `ai_tulala_agent_enabled` | Operations flags | `curl -sI https://tulala.digital/get-started/agent` → 200 (was 307 to /get-started) |
| 4 | `onboarding_module_enabled` | Operations flags | `curl -s https://tulala.digital/ \| grep -c data-onboarding-ready` → 0 in HTML (client-set) but the CTA click opens the overlay on a phone; `curl -sI 'https://app.tulala.digital/auth/google?popup=1' \| grep code-verifier` → present |

Each flip is one message from me with the exact value and the check; the owner flips; I run the checks and report.

## The owner's own checks (Phase 6)

- One real sign-up on tulala.digital with a `+tag` Gmail through the module (Google), on a phone; the arrival opens the builder.
- The three fixture sites (composed on the isolated stack) reviewed on a phone.
- Decision 2 (3-photo floor) stays unless changed here.

## Rollback

Flag `onboarding_module_enabled` off (seconds; no deploy). Only if a deploy itself is bad: `cd web && npm run deploy:promote -- <previous production url>` from a worktree with the production env, then `npm run deploy:smoke`. Migrations are additive; nothing to roll back in the schema.

## Cost per completed signup (to fill from the real-model run)

| Call | Model | Measured |
|---|---|---|
| Extraction (`extractAndRecord`) | chat model (admin setting) | |
| Site copy pass (`composeSiteFromBrief`) | Sonnet 5 (admin setting) | ≈ $0.013–0.02 (templates lead, 102 sites) |
| Per-site images (engine v3, when live) | gpt-image medium | ≈ $0.08–0.10 |
| Transcription (voice only) | gpt-4o-mini-transcribe | |
