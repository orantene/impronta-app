# Onboarding 3-choice journey, isolated target (TUL-16, cards 82-85)

**Status: NOT RUN. Blocked on missing isolated-project credentials. Nothing below is a pass.**

- Spec: `web/e2e/onboarding/choices-journey.spec.ts` (written in full, loads and lists 6 tests per Playwright project; never executed).
- Batch under test: `origin/integ/batch-2026-10-07-3` @ `7102906d3e16f7185ef551ce3b09390f5a33c77f`.
- Target: Supabase `fxlankepwnvelxjrahwk` (qa-journeys) only. Production was not touched.

## Why it did not run

`web/.env.capacity-isolated.local` (the file the brief said to copy to `web/.env.local`) holds only two keys:
`NEXT_PUBLIC_SUPABASE_URL` and `VERCEL_AUTOMATION_BYPASS_SECRET`. The dev stack and the spec's DB assertions
(`isolatedService()`) also need the isolated project's anon key and `SUPABASE_SERVICE_ROLE_KEY` (and the app's
other server env). No other env file on this machine references the isolated project (checked by grep, values never
printed); the only complete env files point at production, which is forbidden. Fetching the isolated keys from
Supabase or Vercel was outside the authorisation given, so the stack was not started.

## The one thing a human needs

Put the isolated project's keys (anon, service role, plus whatever else `web/.env.local` normally carries for it) into
`web/.env.capacity-isolated.local`, then:

```
cd <worktree>/web && cp .env.capacity-isolated.local .env.local
bash scripts/onboarding-qa/dev.sh            # marketing :3105, app :3106, dev :3008 (needs a real npm ci, not a symlinked node_modules)
ONB_EVIDENCE_DIR=<abs>/docs/plans/qa-evidence/onboarding-choices-2026-10-07 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  PLAYWRIGHT_BASE_URL=http://localhost:3105 npx playwright test e2e/onboarding/choices-journey.spec.ts --project=chromium --workers=1
```

`--project=chromium` matters: the config also defines `mobile-onboarding`, which would run the file a second time.
The spec writes screenshots as `<choice>-<viewport>-NN-<name>.jpg` and per-run JSON under `results/` here; fill the tables below from those.

## Results (to fill after a real run)

| choice | viewport | 1 front door | 2 screens + code | 3 DB accounts + essentials | 4 finish URL | 5 sign out/in | 6 guest booking |
|---|---|---|---|---|---|---|---|
| myself | desktop | not run | not run | not run | not run | not run | not run |
| myself | phone | not run | not run | not run | not run | not run | not run |
| studio | desktop | not run | not run | not run | not run | not run | not run |
| studio | phone | not run | not run | not run | not run | not run | not run |
| both | desktop | not run | not run | not run | not run | not run | not run |
| both | phone | not run | not run | not run | not run | not run | not run |

## Known risks in the spec (written blind, selectors from reading the components)

- Step 6 booking selectors (service pick, confirm button, confirmation text) are best effort; the slot picker and `cb-*` ids come from existing case specs.
- Finish URLs are `https://<slug>.tulala.digital`: the spec never fetches them. Chromium maps `*.tulala.digital` to 127.0.0.1 and the spec opens `http://<host>:3008`.
- Step 3 table/column names (`agency_memberships`, `talent_booking_hours`, `talent_sites`) were taken from code reading and may need one-line fixes on first run.
