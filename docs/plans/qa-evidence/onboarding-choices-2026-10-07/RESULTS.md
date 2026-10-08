# Onboarding 3-choice journey, rerun 2026-10-07 (isolated qa-journeys, fxlankepwnvelxjrahwk)

Spec: web/e2e/onboarding/choices-journey.spec.ts, 1 worker, chromium, dev stack via scripts/onboarding-qa/dev.sh.
Guard assertIsolatedJourneysTarget passed. Per-role JSON in results/, screenshots in this folder.
Steps: 1 front door, 2 screens + code, 3 build + DB, 4 finish screen, 5 sign out/in (Spanish dashboard), 6 guest booking.

| Role | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Para mi, desktop | PASS | PASS | FAIL | FAIL | FAIL (17.7 s > 15 s) | FAIL |
| Para mi, phone | PASS | PASS | FAIL | FAIL | FAIL (>90 s) | FAIL |
| Estudio, desktop | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| Estudio, phone | PASS | PASS | FAIL | FAIL | FAIL (>90 s) | FAIL |
| Ambos, desktop | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| Ambos, phone | PASS | PASS | FAIL | FAIL | FAIL (>90 s) | FAIL |

| Check | Result |
|---|---|
| C1-03 account menu sign out (3 of 3) | PASS (cookie cleared, /talent/today -> /login) |
| C1-10 Settings working hours | FAIL: no "Zona horaria" combobox found on Settings (60 s) |
| C1-11 Profile > Servicios category + publish | FAIL: Servicios catalog stuck on "Seguimos intentando" after 15 s |

## Root failure (all 6 roles)
Step 3: the build ends on the `onb-arrival-failed` screen after 180 s (first build also failed). Dev log:
`[onboarding.build.warnings] site:site_publish_failed`, `[onboarding.provisionForChoice.publishOwnSite] Could not read your site`,
`[onboarding.build.verifyLive] talent:no_url` (Para mi / Ambos), `workspace:status` (Estudio / Ambos).
Consequences: talent_sites.theme_design_slug is null (expected maison-v2; Ambos: no talent_sites row), no site published,
so step 4 (no arrival screen) and step 6 (no finish URL) fail. Account rows (profiles, talent, roster, owner membership,
workspace offerings) are correct: Estudio app_role agency_staff, Ambos app_role talent, hub roster rows present.
Repro: `/start?lang=es` on the marketing host, pick any choice, type the sentence, let the build run; arrival-failed appears at ~180 s.
Step 5 repro: sign out, `/api/dev/signin?email=<user>&next=/`; landing takes 17-90 s on first compile of the dev server (cold dev compile, not a product timing).

## Other findings
- Dead end: "too little" screen appears for the typed sentence (AI read is off on the isolated stack); the spec seeds facts with the service role to get past it. Real users would stop here.
- Code send error: yes, the isolated hook. Supabase answers `Hook requires authorization token`; UI shows "No pudimos enviar tu codigo" and, after repeats, "Demasiados intentos" (email rate limit exceeded, 6 in the log). Spec falls back to createUser + dev sign-in.
- Silent hang: the build waits the full 180 s on the arrival screen before the test sees the failure. Proposed fail-fast: the build should surface `onb-arrival-failed` as soon as `verifyLive` reports a non-OK check (it logs it within seconds), and the spec should poll that testid at 20 s granularity and abort after 60 s without progress.
- Harness: after the first dev boot, `/api/dev/signin` answered 404 for the whole first attempt (all 9 tests failed step 2, "dev sign-in never answered 307"); a clean restart of the dev stack fixed it (matches the next.config.ts note on Edge env). Run 1 evidence discarded.

## Env run (Para mi, desktop, AI provider vars exported)
- Verdict: ENV. The build still fails (site_publish_failed, "Could not read your site", talent:no_url) but now in about 8 s, not 180 s.
- Cause in the log: `column talent_sites.custom_palette does not exist` (migration 20261231287000) and `column talent_profiles.is_demo does not exist` (migration 20261231298000). The isolated project fxlankepwnvelxjrahwk is behind the repo migrations.
- Steps: 1 front door PASS, 2 PASS, 3 FAIL (theme_design_slug null), 4 FAIL, 5 FAIL (dashboard landing 248 s... cold compile), 6 FAIL.
- C1-11: FAIL, Servicios did not show a category control (no "Seguimos intentando" wording captured this run); same missing-schema family.
- Next: apply the missing migrations to the isolated project only, rerun.
- Details: env-run-myself-desktop.md

## Rerun after the isolated DB got all migrations (928 applied, newest 20261231347000)
Stack: dev.sh (next dev :3008) with only these AI variable NAMES exported to the process: ANTHROPIC_API_KEY, OPENAI_API_KEY (no AI_PROVIDER or AI_CREDENTIALS_ENCRYPTION_KEY exist). Supabase stays the worktree's isolated env. Values never recorded. One clean restart before the run (first boot answered 404 on /api/dev/signin, known harness quirk). 9 tests, 1 worker, 17.3 min, no retries.

| Role | 1 front door | 2 screens + code | 3 build + DB | 4 finish | 5 sign out/in | 6 guest booking |
|---|---|---|---|---|---|---|
| Para mi, desktop | PASS | PASS | FAIL (arrival-failed; site row OK) | FAIL | FAIL (19.3 s > 15 s) | FAIL |
| Para mi, phone | PASS | PASS | FAIL (arrival-failed; site row OK) | FAIL | FAIL (>90 s) | FAIL |
| Estudio, desktop | PASS | PASS | FAIL (arrival-failed) | FAIL | FAIL (16.7 s > 15 s) | FAIL |
| Estudio, phone | PASS | PASS | FAIL (arrival-failed) | FAIL | FAIL (>90 s) | FAIL |
| Ambos, desktop | PASS | PASS | FAIL (no talent_sites row, arrival-failed) | FAIL | PASS (11.0 s) | FAIL |
| Ambos, phone | PASS | PASS | FAIL (no talent_sites row, arrival-failed) | FAIL | FAIL (>90 s) | FAIL |

| Check | Result |
|---|---|
| C1-03 account menu sign out | PASS (3 of 3 tries, cookie cleared ~1 s, /talent/today -> /login) |
| C1-10 Settings working hours | FAIL: no "Zona horaria" combobox on the page reached (60 s) |
| C1-11 Profile > Servicios | FAIL: "Seguimos intentando" still shown after 15 s |

### What changed vs the first run
- The schema errors are gone (no `is_demo` or `custom_palette` errors in the log). Para mi now publishes a real talent site row (maison-v2, site_published_at set) and the build fails fast (about 8 s) instead of 180 s.
- Build still ends on `onb-arrival-failed`. Log: `[onboarding.build.verifyLive] talent:status` (Para mi) and `workspace:status` (Estudio, Ambos).

### Cause of the remaining build failure: ENV (harness)
`verifyLivePageWithRetry` (src/lib/onboarding/build.server.ts, verify-live.ts) fetches the finish URL server-side from the dev process. On the isolated stack that URL is the public host (e.g. `https://rosa-myself-desktop-ywxcij.tulala.digital/`), which answers 404 because that slug only exists in the isolated DB. The Chromium host-resolver rules in the spec cannot reach a server-side fetch. A schema fix cannot cure this. Possible fixes (not applied): a dev-only override that rewrites the verify host to localhost:3008, or skipping verifyLive when the Supabase target is the isolated project.
Ambos has no talent_sites row because the Ambos build stops at the workspace step before the talent site step.

### Other
- Step 5 > 15 s: cold dev compile of /talent/today (same as before); phone runs time out at 90 s because every first route compiles on demand.
- Server log noise (PRODUCT, minor): `record_phase5_audit: caller not staff of tenant` warns on homepage compose/publish during Estudio/Ambos builds; `analytics_events.tenant_id` null violation on /api/analytics/events from /start (anonymous).
- Email code: still "Hook requires authorization token" then "email rate limit exceeded" (ENV, isolated auth hook). Spec falls back to createUser + dev sign-in.
- Dead end "too little" screen still appears even with AI vars set (AI read did not succeed on the isolated stack); spec seeds facts with the service role.
- C1-10 / C1-11: not classified (ENV vs PRODUCT) because the account never completes the build; needs a rerun once verifyLive is bypassed on the isolated stack.

## Run 4 (LIVE_CHECK_ORIGIN) - stopped after Para mi desktop
Branch qa/onb-journey-run2 = PR #2737 (resolveLiveCheckOrigin) + the qa commits. Stack: dev.sh (next dev :3008, isolated fxlankepwnvelxjrahwk), process env: ANTHROPIC_/OPENAI_ names only, LIVE_CHECK_ORIGIN=http://127.0.0.1:3008, VERCEL_ENV unset, NODE_ENV development. Values never recorded. Only Para mi desktop ran (first role failed at build, so the rest was not run, as instructed). C1-03/10/11 not run.

| Role | 1 front door | 2 screens + code | 3 build + DB | 4 finish | 5 sign out/in | 6 guest booking |
|---|---|---|---|---|---|---|
| Para mi, desktop | PASS | PASS | FAIL (arrival-failed) | FAIL | FAIL (>15 s, cold compile) | FAIL (no finish URL) |
| Para mi phone, Estudio x2, Ambos x2, C1-03/10/11 | not run | | | | | |

Evidence: results/myself-desktop.json, myself-desktop-*.jpg. Test 1 took about 1.7 min (build fails fast; no 180 s wait now).

### Cause (PRODUCT, in the #2737 fix): Node fetch ignores the Host override
Dev log: `[onboarding.build.verifyLive] talent:name_missing`. The override worked on the URL side (status is now 200, not 404), but the response was the marketing home page, not the site. Measured against the running server with the existing slug host rosa-myself-desktop-ywxcij.tulala.digital:
- `curl -H 'Host: <slug host>' http://127.0.0.1:3008/`: 200, 1.30 MB, contains the name (site routed correctly).
- `http.get` with a host header: 200, 1.30 MB, contains the name.
- Node `fetch` (undici) with `headers: { host, "x-forwarded-host" }`: 200, 0.20 MB, name absent (marketing page). Host is a forbidden header in fetch, and x-forwarded-host alone is not used for routing.
So verifyLivePage with LIVE_CHECK_ORIGIN cannot work via fetch. Fix options: node:http(s).request for the override path, an undici Agent with a custom connect (keep the URL host, connect to 127.0.0.1:3008), or fetch a path-based route on the local origin.

### ENV notes
- /api/dev/signin answered 404 on two dev boots (first request after boot) and 400 (route reached) on the third; the first attempt failed with "dev sign-in never answered 307" and was aborted (evidence discarded). A fresh restart whose first request is /api/dev/signin worked (flaky Edge-env quirk already noted in Run 1).
- Step 5 over 15 s is the cold dev compile, as before.
