# LUMINA tracker (2026-09-16) — updated as work lands

| # | Item | Status | Evidence / PR |
|---|---|---|---|
| A | Mockup (390 + 1440) + stepped flow, sent to owner | done 15:20 | docs/plans/impronta-lumina/mockup/ |
| PR #2002 | ONE PR: menu_board CSS + link minting + ticket e-mail/QR + ticket_picker v2 + Launch party design + door i18n + comps count + D-147 UI | MERGED, on production since 00:38Z (314e6d8be) | https://github.com/orantene/impronta-app/pull/2002 |
| D-146 | admission_comp payee column | ON PRODUCTION (program session, 20261231242000), verified by the 3 comps | |
| B1 | Page /lumina built in the builder on production | PUBLISHED 2026-09-17 ~01:40Z: Launch party design + Buy tickets (event, cards, sheet, tiers, Cortesía hidden), placeholder removed. Canonical share URL /es/lumina (Spanish picker) | https://improntamodels.com/es/lumina |
| B2 | Nav "LUMINA" + home announcement bar | DONE: shell nav link published; home hero banner → /lumina published | |
| B3 | /q/lumina link + QR print file | DONE: minted from the QR inspector ("LUMINA Instagram"), 302 → /es/lumina?l=…; QR block on the page | |
| B4 | Engine page CTA → /lumina | todo | |
| O1 | 2 × Mesa para 10 off-app sale via POS Counter | DONE 2026-09-17 02:53Z: sale #D4A8 (order d4a82d26…) charged cash $30,000; 2 admissions minted; Tickets tab Mesa 2/20, Sold 2; door lists 23 expected. Ticket e-mail FAILED (D-159, see F3): order has no customer (POS guest session) and the payer fallback read a non-existent column. Owner to attach themselves as customer on #D4A8, then Resend from the door Delivery sheet after #2016 | https://improntamodels.com/r/h52uec7bxdc4anug36ey |
| O2 | 3 × Cortesía comps from Day tab | DONE 2026-09-16 ~18:20 (LUMINA comp 1/2/3 → orantene@gmail.com, "Entrada de cortesía emitida" ×3; D-146 live) | |
| Q1 | Localhost QA 390/1440 on test tenant | todo | |
| Q2 | Production walk + flow README with screenshots | DONE to Stripe's page (no payment); 02–05 captured at 390 | docs/plans/impronta-lumina/flow/README.md |
| Q3 | Published-page sweep of Impronta at 390/1440 | DONE (in flow README) | |
| S1 | Report to owner + program session | ongoing in chat; docs on PRs #2014 (merged) + this | |
| F3 | D-159: `ticket-delivery.ts orderContact` payer fallback filtered `booking_transactions.tenant_id` (column is `source_tenant_id`) → 42703 on the first production hit; every ticket sold with no holder/customer e-mail went out unsent | PR #2016 (CLEAN, green, queued by program session) | https://github.com/orantene/impronta-app/pull/2016 |
| F4 | Order 6C22E25F: $0 ticket_picker order from 2026-09-07 to oran+lumina-comp@impronta.test, 0 admissions, drives the Overview exception "1 ticket sold and never issued". Program session ruled: cancel via "Refund lines". The confirm click is a real-world transaction gate on my side → owner presses "Confirm this refund" | owner | |
| F5 | Door Delivery sheet shows static copy ("Enviado con el QR al emitir…") regardless of `admissions.delivery`; nothing in the workspace shows whether a ticket e-mail actually went out | todo (program session, events) | |
| F2 | D-153: POS door gate `onScan` has no catch; a superseded code renders no verdict. Follow-up PR after #2002 (pos/door-client.tsx) | DONE: PR #2007 merged | |
| F1 | Add the generated LUMINA imagery to platform stock (`platform_stock_images`, category "event / nightlife") so tenants see it in Media | HANDED OFF 2026-09-17 to the onboarding designer session (parent of Templates & Imagery): 4 files + alt sidecars + manifest, family=events; the importer writes production stock with the service role, not this session\'s lane. Was: todo (owner ask 2026-09-16) | scripts/import-stock-images.ts |

Notes
- 2026-09-17 00:40Z: production DB compute-starved (smallest Supabase tier, burst credits drained; count(*) 10.8 s). Owner must upgrade Compute → Small in the Supabase dashboard. Site TTFB 5–27 s until then.
- #2002 on production pointer at 00:38Z (314e6d8be); Vercel build in progress.
- Gamma image credits exhausted after 4 images (hero beams, runway, fire, aerial silk). Remaining imagery via canvas-design skill.
