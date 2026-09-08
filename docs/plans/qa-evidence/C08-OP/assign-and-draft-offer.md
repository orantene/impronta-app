# C08-OP — Staff assigns talent and drafts offer

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T23:08Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C08-modelling-or-talent-agency.spec.ts -g "C08-OP assign" --project=chromium`

## Result

Staff signed in on `/admin/messages`. Inbox listed the Cora directory inquiries. Lineup tab → **Add talent** → roster picker **QA Journeys Talent**. Offer tab → **Start drafting offer**. Isolated DB: talent participant `invited` on fixture profile `33330003-…0001`; `inquiry_offers` row `status=draft` USD; inquiry moved `submitted` → `coordination` with `current_offer_id` set.

Offer was **not sent**. Client did **not** accept. Commission was **not** booked.

This automated run does **not** tick a human QA row.

| Check | Value |
|---|---|
| Playwright UI | Lineup add + Start drafting offer reached; receipt toast **Offer draft created** |
| Inquiry | `aa52afee-a67f-4d02-8ac1-fc82bcf0d06a` — coordination |
| Contact | Cora Cuevas / `c08-op-1788908798848@impronta.test` |
| Talent | `33330003-0000-4000-8000-000000000001` — invited |
| Offer | `d9c3f0e4-f263-4df2-80f6-cdab8c5c6b36` — draft / USD |

## Not claimed

Not offer sent. Not offer accepted. Not models booked. Not commission. Not C08-TAL / DIFF / REC. Not C08 complete. Human QA rows stay open. Case count stays **0 / 48**.
