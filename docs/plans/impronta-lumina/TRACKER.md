# LUMINA tracker (2026-09-16) — updated as work lands

| # | Item | Status | Evidence / PR |
|---|---|---|---|
| A | Mockup (390 + 1440) + stepped flow, sent to owner | done 15:20 | docs/plans/impronta-lumina/mockup/ |
| PR #2002 | ONE PR: menu_board CSS + link minting + ticket e-mail/QR + ticket_picker v2 + Launch party design + door i18n + comps count + D-147 UI | OPEN 22:50, tsc+lint green, awaiting 4 checks → program session merges | https://github.com/orantene/impronta-app/pull/2002 | |
| D-146 | admission_comp payee column | ON PRODUCTION (program session, 20261231242000), verified by the 3 comps | |
| B1 | Page /lumina built in the builder on production | PUBLISHED 2026-09-17 ~01:40Z: Launch party design + Buy tickets (event, cards, sheet, tiers, Cortesía hidden), placeholder removed. Canonical share URL /es/lumina (Spanish picker) | https://improntamodels.com/es/lumina |
| B2 | Nav "LUMINA" + home announcement bar | DONE: shell nav link published; home hero banner → /lumina published | |
| B3 | /q/lumina link + QR print file | DONE: minted from the QR inspector ("LUMINA Instagram"), 302 → /es/lumina?l=…; QR block on the page | |
| B4 | Engine page CTA → /lumina | todo | |
| O1 | 2 × Mesa para 10 off-app sale via POS Counter | BLOCKED: Counter client crashes on add (React #310) and "Cobrar" hangs at "Cobrando"; draft #D4A8 (order d4a82d26…) left unpaid ×1; reported to program session 23:30Z; KPI timeout fixed in #2006 (queued after #2002); Counter fixed on production (D-155/D-156, a55a6e58e) 20:0x; waiting for the DB compute upgrade before collecting (TTFB still 5–7 s) | |
| O2 | 3 × Cortesía comps from Day tab | DONE 2026-09-16 ~18:20 (LUMINA comp 1/2/3 → orantene@gmail.com, "Entrada de cortesía emitida" ×3; D-146 live) | |
| Q1 | Localhost QA 390/1440 on test tenant | todo | |
| Q2 | Production walk + flow README with screenshots | DONE to Stripe's page (no payment); 02–05 captured at 390 | docs/plans/impronta-lumina/flow/README.md |
| Q3 | Published-page sweep of Impronta at 390/1440 | DONE (in flow README) | |
| S1 | Report to owner + program session | todo | |
| F2 | D-153: POS door gate `onScan` has no catch; a superseded code renders no verdict. Follow-up PR after #2002 (pos/door-client.tsx) | todo | |
| F1 | Add the generated LUMINA imagery to platform stock (`platform_stock_images`, category "event / nightlife") so tenants see it in Media | todo (owner ask 2026-09-16) | scripts/import-stock-images.ts |

Notes
- 2026-09-17 00:40Z: production DB compute-starved (smallest Supabase tier, burst credits drained; count(*) 10.8 s). Owner must upgrade Compute → Small in the Supabase dashboard. Site TTFB 5–27 s until then.
- #2002 on production pointer at 00:38Z (314e6d8be); Vercel build in progress.
- Gamma image credits exhausted after 4 images (hero beams, runway, fire, aerial silk). Remaining imagery via canvas-design skill.
