# Preview QA Sign-In — No-Auth Path

## Overview

`GET /api/dev/preview-qa-signin` is a **preview-deploy-only** endpoint that
lets a QA agent (or developer) authenticate as a seeded fixture user **without
supplying the user's password**. This unblocks browser QA on Vercel Preview
deploys where the Claude agent privacy ruleset prevents typing credentials.

**Production deploys return 404 with an empty body at this path. Always.**

---

## Why this exists

Phase 5 launch-readiness QA could not complete items (a)–(f) of its sign-in
matrix because:

1. No Playwright-style `PLAYWRIGHT_USE_DEV_SIGNIN` shortcut works against
   Preview deploys (Preview uses prod Supabase; `NODE_ENV !== "development"`).
2. Agent privacy rules prevent the agent from typing user passwords into a
   browser login form.

This endpoint solves both problems without compromising production security.

---

## Security gates (all must pass)

| Order | Gate | Fail response |
|-------|------|---------------|
| 1 | `VERCEL_ENV === "preview"` (at request time) | `404` (empty body) |
| 2 | `token` query param present + valid HMAC-SHA256 signature | `401` |
| 3 | Token not older than 60 s (configurable TTL) | `401` |
| 4 | Email in `@impronta.test` compile-time allowlist | `403` |
| 5 | User exists in Supabase auth table | `404` |
| 6 | Sign-in succeeds (admin `generateLink` → anon `verifyOtp`) | `500` |
| 7 | Audit row written to `platform_audit_log` | (non-blocking) |

---

## Usage

### 1. Provision the signing secret (user/ops action — do this once)

```bash
# Add PREVIEW_QA_SIGNING_SECRET to Vercel's Preview environment ONLY.
# Do NOT add it to Production.
vercel env add PREVIEW_QA_SIGNING_SECRET preview
# Enter a strong random value, e.g.:
openssl rand -hex 32
```

This env var must exist in the Preview env. It must **never** be in the
Production env. The route returns `401` if the secret is absent.

### 2. Mint a token (CLI — run locally or in a preview-aware agent)

```bash
# From the web/ directory with .env.local (containing PREVIEW_QA_SIGNING_SECRET) loaded:
node -e "
  process.loadEnvFile('.env.local');
  const { signPreviewQaToken } = require('./dist/lib/auth/preview-qa-token');
  signPreviewQaToken('qa-admin@impronta.test').then(t => console.log(t));
"
```

Or with `tsx`:

```bash
PREVIEW_QA_SIGNING_SECRET=<your-secret> npx tsx -e "
  import { signPreviewQaToken } from './src/lib/auth/preview-qa-token.ts';
  const t = await signPreviewQaToken('qa-admin@impronta.test');
  console.log(t);
"
```

The output is the signed token (valid for **60 seconds** by default).

### 3. Use it against a Preview URL

```
https://<preview-alias>/api/dev/preview-qa-signin?token=<token>&next=/impronta/admin
```

The endpoint verifies the token, signs in the fixture user via a server-side
Supabase magic-link OTP, sets the Supabase SSR session cookie, and redirects
to `next`.

> **QA caveat (from CLAUDE.md):** Raw `*.vercel.app` preview URLs will NOT
> render the app — they are blocked by the `agency_domains` middleware before
> route matching. Set an alias first:
>
> ```bash
> vercel alias set <preview-url> <seeded-host>
> ```
>
> Then use `https://<seeded-host>/api/dev/preview-qa-signin?...`

### 4. Fixture user emails

All emails must end with `@impronta.test`. Current fixture users seeded in the
database:

| Email | Role |
|-------|------|
| `qa-admin@impronta.test` | workspace admin |
| `qa-talent@impronta.test` | talent |
| `qa-client@impronta.test` | client |

> To add a new fixture email domain, edit `QA_FIXTURE_DOMAINS` in
> `web/src/app/api/dev/preview-qa-signin/route.ts`.

---

## Threat model

### What an attacker would need to break the production gate

**Production is safe by construction.** Three independent layers must all
misfire simultaneously:

1. `VERCEL_ENV !== "preview"` check returns `404`. This is an env var set
   by Vercel itself, not by application code. The Production runtime always
   sets it to `"production"`.
2. `PREVIEW_QA_SIGNING_SECRET` is **absent from Production env vars** (user
   sets it in Preview only). Without the secret, `verifyPreviewQaToken`
   returns `{ ok: false, reason: "no_secret" }` → `401`.
3. Even if both of the above misfired, the token is short-TTL (60 s) and
   HMAC-SHA256 signed. An attacker without the secret cannot forge a valid
   token.

**Residual risks:**

| Risk | Mitigation |
|------|-----------|
| `PREVIEW_QA_SIGNING_SECRET` accidentally added to Production env | Secret is never in application code; Vercel env-var scope is explicit. Smoke tests flag unexpected 2xx on this path. |
| Leaked Preview token replayed within TTL | 60-second TTL limits the window. Token is per-email, not per-session. Audit log records every use. |
| `VERCEL_ENV` spoofed via crafted header | `VERCEL_ENV` is a Vercel platform env var, not a request header. It cannot be spoofed by an HTTP client. |
| Auth bypass via open redirect | `next=` param is validated: must start with `/`, must not be `//` or `https://`. Absolute URLs are replaced with `/`. |
| Fixture user signs in as real user | Allowlist is `@impronta.test` domain only. Real user emails use `@gmail.com`, `@...` — never `@impronta.test`. |

### Audit trail

Every successful sign-in writes a row to `platform_audit_log`:

```json
{
  "action": "preview_qa_signin",
  "target_type": "profile",
  "target_id": "<email>",
  "severity": "info",
  "ip_address": "<forwarded IP>",
  "user_agent": "<agent UA>",
  "metadata": {
    "email": "<email>",
    "token_exp": <unix timestamp>,
    "env": "preview"
  }
}
```

If a production misconfiguration somehow allows a request through, the audit
row will have `"env": "production"` — searchable immediately.

---

## Implementation files

| File | Purpose |
|------|---------|
| `web/src/lib/auth/preview-qa-token.ts` | `signPreviewQaToken` / `verifyPreviewQaToken` helpers |
| `web/src/lib/auth/preview-qa-token.test.ts` | 8 unit tests for the helper |
| `web/src/app/api/dev/preview-qa-signin/route.ts` | Route handler (the endpoint) |
| `web/src/app/api/dev/preview-qa-signin/route.test.ts` | 10 pure gate tests + 1 skipped integration test |

---

## Vercel env var setup checklist

- [ ] `vercel env add PREVIEW_QA_SIGNING_SECRET preview` (set once; keep out of Production)
- [ ] Verify: `vercel env ls` shows `PREVIEW_QA_SIGNING_SECRET` under **Preview** only
- [ ] Run a smoke test: mint a token locally and hit the Preview URL

---

## Running the tests locally

```bash
cd web

# Helper tests (offline, no Supabase):
npx tsx --test src/lib/auth/preview-qa-token.test.ts

# Route gate tests (offline, no Supabase):
npx tsx --test src/app/api/dev/preview-qa-signin/route.test.ts

# Happy-path integration test (requires live Supabase):
SUPABASE_SERVICE_ROLE_KEY=xxx \
NEXT_PUBLIC_SUPABASE_URL=xxx \
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx \
PREVIEW_QA_SIGNING_SECRET=xxx \
VERCEL_ENV=preview \
npx tsx --test src/app/api/dev/preview-qa-signin/route.test.ts
```
