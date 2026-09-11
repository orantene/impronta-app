# C08-CUS — Guest directory inquiry submitted

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T22:38Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C08-modelling-or-talent-agency.spec.ts -g "C08-CUS inquiry" --project=chromium`

## Result

Guest opened `/directory?inquiry=open`. Dialog **Message the agency**. Home required **Start a new inquiry** before the composer existed. Brief typed, Send message, first/last/email gate, Send message. Receipt in the dialog: **Inquiry received**, **Got it, we've received your message and will be in touch shortly.**, switcher **Sent, awaiting reply**. Isolated DB: `inquiries` row `status=submitted`, `source_channel=agency_site`, `source_page=/directory`. One `inquiry_messages` system_event with the auto-ack body. No `inquiry_offers` row.

Directory listing body may still say the directory could not be loaded. Chat still submitted.

This automated run does **not** tick a human QA row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 11.2s |
| Inquiry | `a1a0b8f6-b3ae-40dc-b615-e8c4880f1fa5` — submitted |
| Contact | Cora Cuevas / `c08-cus-1788907081765@impronta.test` |
| Message | Need two models for a catalog shoot next month. |
| Channel / page | `agency_site` / `/directory` |
| Auto-ack message | `f6e8328a-7905-4eab-a506-ec2f92f05c91` — system_event |
| Offers | none |

## Not claimed

Not offer accepted. Not models assigned. Not commission. Not C08-OP / TAL / DIFF / REC. Not C08 complete. Agency `/contact` CMS page still 404s. Human QA rows stay open. Case count stays **0 / 48**.
