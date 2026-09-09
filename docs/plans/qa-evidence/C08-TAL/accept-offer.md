# C08-TAL — Talent approves the sent offer

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-09T00:29Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C08-modelling-or-talent-agency.spec.ts -g "C08-TAL accept" --project=chromium`

## Result

Claimed talent `qa-journeys-talent@impronta.test` signed in on `/talent/inbox`. Staff cannot accept on this profile's behalf (`talent_has_account`). Isolated DB after **Approve offer**: talent `inquiry_approvals.status=accepted`, client approval still `pending`, offer still `sent`, inquiry still `offer_pending`.

Offer was **not** fully accepted. Booking and commission were **not** created.

This automated run does **not** tick a human QA row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 14.6s |
| Inquiry | `6a5e9455-e7ed-46dd-a53e-d26064e8b780` — offer_pending |
| Contact | Cora Cuevas / `c08-op-1788912366168@impronta.test` |
| Talent | `33330003-0000-4000-8000-000000000001` / user `33330001-…0005` — accepted |
| Offer | `d052b6b0-814f-41f1-b153-46eb067525b8` — sent / $800 USD |
| Approvals | talent accepted; client pending |

`engine_submit_approval` was missing on cheap-repaired qa-journeys and was installed there only from the production-shaped 7-arg body (production already has it). `talent_profiles.talent_plan_key` and `contact_policy` were added on qa-journeys only so `/talent/inbox` could load the claimed profile. Not applied to production. Not a git migration.

## Not claimed

Not offer accepted (client still pending). Not models booked. Not commission. Not C08-CUS accept / convert. Not C08-DIFF / REC. Not C08 complete. Human QA rows stay open. Case count stays **0 / 48**.
