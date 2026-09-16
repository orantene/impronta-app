# WIRE-0 enable modes — 2026-09-12 second run

Host: `https://staging-qa-journeys.tulala.digital`
Project: chromium
Command: `PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 JOURNEYS_FIXTURE_READY=1 npx playwright test e2e/cases/WIRE-0-enable-modes.spec.ts --project=chromium --workers=1`

Result: failed before Settings.

`signInJourneysStaff` → `POST /api/dev/signin` received Vercel SSO `302 Redirecting...` (expected app `307`). No bypass header was sent because `VERCEL_AUTOMATION_BYPASS_SECRET` is unset.

Modes on isolated tenant A (MCP SQL, `fxlankepwnvelxjrahwk` only): still `["counter","projects"]`. Not changed by this run.
