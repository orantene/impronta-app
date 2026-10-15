# Staging: password gate and build sources (TUL-827)

## The gate

Code: `web/src/lib/saas/staging-gate-core.ts` (rules), `staging-gate.ts` (request
layer, wraps the proxy entry in `web/src/proxy.ts`), `staging-gate-page.ts` (HTML).
Tests: `web/src/lib/saas/staging-gate.test.ts` (lane `test:auth-routing`).

The gate is active only when ALL of these hold:

| Condition | Why |
|---|---|
| `STAGING_GATE_ENABLED=1` | Kill switch. Unset or anything else = gate off (the old behaviour). |
| `VERCEL_ENV` is not `production` | Production deploys are never gated. |
| Host is not a production host | `tulala.digital`, `app.tulala.digital`, any `*.tulala.digital`, `improntamodels.com`, `www.improntamodels.com` are never gated. Exceptions that ARE gated: `staging.tulala.digital`, `*.staging.tulala.digital`, `staging-qa-*.tulala.digital`, `qa-N.tulala.digital`. Any other host (for example `*.vercel.app`) is gated. |
| Host is not local, or `STAGING_GATE_FORCE=1` | `localhost`, `127.0.0.1`, `[::1]`, `*.localhost` are never gated unless forced. |

When active:

- **Fail closed.** If `STAGING_GATE_PASSWORD` is empty, every request gets
  `503 Staging gate not configured (STAGING_GATE_PASSWORD missing)` and one
  `console.error` per instance. Nothing gets through, including webhooks.
- Unauthenticated `GET`/`HEAD` gets a `302` to `/__staging-gate?next=<path+query>`.
  Other methods get `401`. `next` must be a same-host relative path (absolute
  URLs and `//host` fall back to `/`), so magic links (`/auth/confirm?token_hash=...`)
  and booking deep links survive the detour.
- The gate page is self-contained HTML (EN or ES by `Accept-Language`), one
  password field, `noindex`. A correct password sets cookie `tulala_stg_gate`
  (HMAC-SHA256 of a versioned salt keyed by the password; HttpOnly, Secure,
  SameSite=Lax, Path=/, 30 days, host-only) and `303`s to `next`.
- Password attempts are limited to 10 per IP per 10 minutes (in-memory,
  per instance, `@/lib/rate-limit`).
- Every response carries `X-Robots-Tag: noindex, nofollow`, and `/robots.txt`
  returns `Disallow: /`. Production robots are unchanged.

### Always allowed (no password)

`/api/webhooks/*`, `/api/cron/*`, `/api/stripe/webhook`, `/api/health/*` (deploy
smoke), the gate route `/__staging-gate`, `/_next/*`, `/favicon.ico`,
`/robots.txt`, and static files (images, fonts, css/js) outside `/api/`.

### How QA gets in

The PM hands the password out of band (in person or a password manager share).
**Never** put it in chat, Notion, a PR, an issue or a commit. Testers open any
staging URL, enter it once, and the cookie lasts 30 days per host.

### CI and Playwright

Send header `x-staging-gate-token: $STAGING_GATE_CI_TOKEN`. The env value must be
non-empty; an empty value never matches. Store it only as a CI secret.

## Rotation

- **Password:** change `STAGING_GATE_PASSWORD` in Vercel (Preview) and redeploy.
  Every issued cookie becomes invalid immediately, because the cookie is keyed
  by the password.
- **CI token:** change `STAGING_GATE_CI_TOKEN` in Vercel and in the CI secret store
  together.

## Enable / disable

- Enable: set `STAGING_GATE_PASSWORD`, `STAGING_GATE_CI_TOKEN`, then
  `STAGING_GATE_ENABLED=1` (Vercel, Preview scope), redeploy.
- Disable: remove `STAGING_GATE_ENABLED` (or set it to `0`) and redeploy.
  Setting `ENABLED=1` without a password is a 503 on every staging request, by design.

## Build sources (`web/vercel.json` `ignoreCommand`)

Vercel builds only when `VERCEL_ENV=production` (the `production` pointer branch)
or the ref is `main` (staging). Every other branch push is skipped (shows as
Canceled, no build cost). Staging's source is `main` since 2026-10-14: the staging
domains (`staging.`, `*.staging.`, `staging-qa-*`) track git branch `main`, and the
staging-only Preview env vars are scoped to branch `main`. Each merge to `main`
therefore produces one staging build. `program/journeys-2026-09` is retired.
