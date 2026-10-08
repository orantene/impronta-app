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
