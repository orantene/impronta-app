# E2E smoke tests

One Playwright test covering the highest-leverage path: login → builder → save draft → publish → share link works. Catches ~80% of regressions in 30 seconds.

## When to run

Before promoting anything that touches: auth, admin shell, builder, share-link viewer, or core CMS.

Pre-launch: optional. Post-launch ("we are live"): always run against staging before `vercel promote`.

## Install (one-time)

Playwright is not in the default deps. Install when you're ready to use:

```sh
cd web
npm install -D @playwright/test
npx playwright install chromium
```

## Run

Local (against `app.local:3102` from `scripts/dev.sh`):

```sh
cd web
npx playwright test
```

Staging:

```sh
cd web
PLAYWRIGHT_BASE_URL=https://staging.tulala.digital npx playwright test
```

## Required env

Set in `web/.env.local`:

```
TEST_ADMIN_EMAIL=...
TEST_ADMIN_PASSWORD=...
```

The test skips itself if these aren't set so it never blocks CI.
