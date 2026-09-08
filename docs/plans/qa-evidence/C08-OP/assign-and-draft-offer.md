# C08-OP — Staff assigns talent and drafts offer

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T23:10Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C08-modelling-or-talent-agency.spec.ts -g "C08-OP assign" --project=chromium`

## Result

Staff signed in on `/admin/messages`. Inbox listed the Cora directory inquiries. Lineup tab → **Add talent** → roster picker **QA Journeys Talent**. Offer tab → **Start drafting offer**. Isolated DB: talent participant `invited` on fixture profile `33330003-…0001`; `inquiry_offers` row `status=draft` USD; inquiry moved `submitted` → `coordination` with `current_offer_id` set.

Offer was **not sent**. Client did **not** accept. Commission was **not** booked.

This automated run does **not** tick a human QA row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 25.1s |
| Inquiry | `1cfb9b13-4f9a-4906-8ce0-23ad72c88ab9` — coordination |
| Contact | Cora Cuevas / `c08-op-1788908872796@impronta.test` |
| Talent | `33330003-0000-4000-8000-000000000001` — invited |
| Offer | `691ca0ad-ecf4-412c-a33e-6c1b9ffe301c` — draft / USD |

## Not claimed

Not offer sent. Not offer accepted. Not models booked. Not commission. Not C08-TAL / DIFF / REC. Not C08 complete. Human QA rows stay open. Case count stays **0 / 48**.
