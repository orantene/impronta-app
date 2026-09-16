# LUMINA tracker (2026-09-16) — updated as work lands

| # | Item | Status | Evidence / PR |
|---|---|---|---|
| A | Mockup (390 + 1440) + stepped flow, sent to owner | done 15:20 | docs/plans/impronta-lumina/mockup/ |
| PR-1 | menu_board CSS for every tenant | code + tests green; tsc running | |
| PR-2 | mintLinkAction + "Create a link" in qr_code inspector | code + tests green; tsc pending | |
| PR-3 | Ticket e-mail with hosted QR + /ticket QR + resend/deliver reuse | code + 27 tests green | |
| PR-4 | ticket_picker v2 (steps, sheet, tier cards, ?tier=) + inspector + event select | code + 13 tests green | |
| PR-5 | Door i18n "Admitido" (reuses pos.door.gate keys) + Day-tab comps count + D-147 UI + stale "no ticket email" copy | code green, messages aligned | |
| PR-6 | Reusable "Launch party" page design (`page-designs/event-launch.ts`, gallery preset `launch-party`, fidelity-registered, 4 night photos as platform assets) composed from existing kinds; tenant swaps the tickets placeholder for the v2 picker | code + tests green; rendered through the engine at 390/1440 | docs/plans/impronta-lumina/mockup/preset/ |
| D-146 | admission_comp payee column (program session) | message delivered 15:40, awaiting answer | |
| B1 | Page /lumina built in the builder on production | todo (needs PR-1/2/4 deployed) | |
| B2 | Nav "LUMINA" + home announcement bar | todo | |
| B3 | /q/lumina link + QR print file | todo (needs PR-2) | |
| B4 | Engine page CTA → /lumina | todo | |
| O1 | 2 × Mesa para 10 off-app sale via POS Counter | todo (verify on test tenant first) | |
| O2 | 3 × Cortesía comps from Day tab | blocked on D-146 | |
| Q1 | Localhost QA 390/1440 on test tenant | todo | |
| Q2 | Production walk + flow README with screenshots | todo | docs/plans/impronta-lumina/flow/README.md |
| Q3 | Published-page sweep of Impronta at 390/1440 | todo | |
| S1 | Report to owner + program session | todo | |
| F1 | Add the generated LUMINA imagery to platform stock (`platform_stock_images`, category "event / nightlife") so tenants see it in Media | todo (owner ask 2026-09-16) | scripts/import-stock-images.ts |

Notes
- Gamma image credits exhausted after 4 images (hero beams, runway, fire, aerial silk). Remaining imagery via canvas-design skill.
