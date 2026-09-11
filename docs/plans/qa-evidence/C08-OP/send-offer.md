# C08-OP — Staff prices a line and sends the offer

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-09T00:10Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C08-modelling-or-talent-agency.spec.ts -g "C08-OP send" --project=chromium`

## Result

Staff signed in on `/admin/messages`. Inbox **All** → newest empty-shortlist Cora → Lineup (QA Journeys Talent) → Offer → **Edit** draft → client rate **800** → **Save draft** → **Send to client**. Isolated DB: offer `status=sent`, `sent_at` stamped, `total_client_price=800` USD, priced lineup talent `33330003-…0001`, two pending approvals, inquiry `submitted`/`coordination` → `offer_pending`.

Offer was **not accepted**. Booking and commission were **not** created.

This automated run does **not** tick a human QA row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 47.6s |
| Inquiry | `6a5e9455-e7ed-46dd-a53e-d26064e8b780` — offer_pending |
| Contact | Cora Cuevas / `c08-op-1788912366168@impronta.test` |
| Talent | `33330003-0000-4000-8000-000000000001` — priced on a sent line |
| Offer | `d052b6b0-814f-41f1-b153-46eb067525b8` — sent / $800 USD |
| Lines | 2 rows, sum $800 (one $0 leftover + one $800) |
| Approvals | 2 pending |

`engine_send_offer` was missing on cheap-repaired qa-journeys and was installed there only (production already has it). `inquiry_offer_line_items.source_service_id` / `owner_tenant_id` were added on qa-journeys only so save/send could persist. Not applied to production. Not a git migration.

## Not claimed

Not offer accepted. Not models booked. Not commission. Not C08-TAL / DIFF / REC. Not C08 complete. Human QA rows stay open. Case count stays **0 / 48**.
