# Signed-in Live QA sweep on a9277d1f7 (= production incl. #3043), isolated Supabase fxlankepwnvelxjrahwk

Build: exactly main a9277d1f7, `next start` :3008 (TALENT_AGENDA_V2=1, SUPPORT_DESK_ENABLED=1, CLIENT_ACCOUNT_HOSTS=agency,hub,talent, Cloudflare always-pass TEST Turnstile keys, NO Stripe/Resend/KV by design). Captcha widget not bypassed; hub captcha row empty (TUL-479). Two agents: A (client/onboarding/public, `RESULTS-A.md`) and B (dashboard/offers/builder, `RESULTS-B.md`). Run 04:15-05:23 am 2026-10-09 (clock as printed by `date`).

## Moved to Done (Verified on Live): 12 queue rows
TUL-86 (1E, both moves), 438, 487, 442, 416, 61, 374, 267, 451, 433 (core; Secure-cookie-over-http artifact on the post-confirm page), 395, 327 (counter 'Demos . 8' vs 7 chips unverified).

## Stay in Live QA, with the exact reason on each card
| Card | Result | Why |
|---|---|---|
| 62 | tabs PASS | visit detail + receipt need a paid order (paid run) |
| 93 | in-app row PASS | guest email skipped (hook = Needs Oran); talent notification title English for a Spanish talent |
| 117 | core PASS | "I'm Talent skips setup" + English re-login not exercised; agency-host legacy role page Spanish-only |
| 120 | PASS (sign out, login, empty state) | AI support language not provable (AI stubbed) |
| 125 | PARTIAL | /en hero paragraph still Spanish |
| 146 | FAIL one point | English trade label on profile header; bare tab titles; support panel not found |
| 182 | ES money PASS visually | code routing through formatDashboardMoney not confirmed in source |
| 435 | observable parts PASS | no messages_offer order, no plural n>1 |
| 64 | FAIL | agency host: guest-booker client lands on legacy /onboarding/role, login not branded (re-test after #3069) |
| 77 | FAIL | workspace-site nav 404s (/services /about /gallery /contact /directory); fixes #3044/#3045 not live |
| 379 | FAIL | thread panel English; fixes #3047/#3048 not live; no clock time renders |
| 78, 396 | FAIL one item | Heading inspector field loses focus to canvas ~500 ms after typing |
| 79 | FAIL #12 | tablet/mobile frame blank ~5 s; "Tablet editing" panel overlaps canvas |
| 81 | exercised PASS | error toast over Publish dialog not triggerable |
| 484 | FAIL | start-offer dead-ends on "We could not tell which currency this offer should use" (English in ES toast, no chooser) |
| 225 | nothing to exercise | PR 2844 is a design doc only |
| 355, 381, 317, 280 | BLOCKED by 484 | all need a drafted/sent offer |
| 319, 400, 429, 430, 437, 468 | moved to the Payments Developer's paid run | need a real Stripe TEST payment; per-card steps sent to the PM |

## Stack changes (all fxlank, throwaway/own rows only)
Agent B flipped one throwaway talent's plan to talent_portfolio for the builder run and restored it. Two throwaway inquiries (9812078c, 781067e6) remain. No shared row was touched. Two non-basic plans are visible on fxlank (TAL-93078 the TUL-228 fixture, TAL-93071 a Rosa r6a throwaway): not verified who set them.
