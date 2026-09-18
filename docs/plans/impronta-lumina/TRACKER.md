# LUMINA tracker (2026-09-16) — updated as work lands

| # | Item | Status | Evidence / PR |
|---|---|---|---|
| A | Mockup (390 + 1440) + stepped flow, sent to owner | done 15:20 | docs/plans/impronta-lumina/mockup/ |
| PR #2002 | ONE PR: menu_board CSS + link minting + ticket e-mail/QR + ticket_picker v2 + Launch party design + door i18n + comps count + D-147 UI | MERGED, on production since 00:38Z (314e6d8be) | https://github.com/orantene/impronta-app/pull/2002 |
| D-146 | admission_comp payee column | ON PRODUCTION (program session, 20261231242000), verified by the 3 comps | |
| B1 | Page /lumina built in the builder on production | PUBLISHED 2026-09-17 ~01:40Z: Launch party design + Buy tickets (event, cards, sheet, tiers, Cortesía hidden), placeholder removed. Canonical share URL /es/lumina (Spanish picker) | https://improntamodels.com/es/lumina |
| B3 | /q/lumina link + QR print file | DONE: minted from the QR inspector ("LUMINA Instagram"), 302 → /es/lumina?l=…; QR block on the page | |
| B4 | Engine page CTA → /lumina | todo | |
| O2 | 3 × Cortesía comps from Day tab | DONE 2026-09-16 ~18:20 (LUMINA comp 1/2/3 → orantene@gmail.com, "Entrada de cortesía emitida" ×3; D-146 live) | |
| Q1 | Localhost QA 390/1440 on test tenant | todo | |
| Q2 | Production walk + flow README with screenshots | DONE to Stripe's page (no payment); 02–05 captured at 390 | docs/plans/impronta-lumina/flow/README.md |
| Q3 | Published-page sweep of Impronta at 390/1440 | DONE (in flow README) | |
| S1 | Report to owner + program session | ongoing in chat; docs on PRs #2014 (merged) + this | |
| F3 | D-159: `ticket-delivery.ts orderContact` payer fallback filtered `booking_transactions.tenant_id` (column is `source_tenant_id`) → 42703 on the first production hit; every ticket sold with no holder/customer e-mail went out unsent | PR #2016 (CLEAN, green, queued by program session) | https://github.com/orantene/impronta-app/pull/2016 |
| F5 | Door Delivery sheet shows static copy ("Enviado con el QR al emitir…") regardless of `admissions.delivery`; nothing in the workspace shows whether a ticket e-mail actually went out | todo (program session, events) | |
| F2 | D-153: POS door gate `onScan` has no catch; a superseded code renders no verdict. Follow-up PR after #2002 (pos/door-client.tsx) | DONE: PR #2007 merged | |

| O1 | 2 × Mesa para 10 off-app sale via POS Counter | DONE 02:53Z (#D4A8, cash $30,000; 2 admissions; Mesa 2/20). Tickets later transferred to the buyer's name + e-mail from the POS door and e-mailed | https://improntamodels.com/r/h52uec7bxdc4anug36ey |
| B2 | Nav "LUMINA" + home announcement bar | DONE: EN + ES header links; home strip re-added 09:05Z with the fixed announcement preset (#2021) → /lumina, published | flow/06, flow/07 |
| B5 | Full-bleed LUMINA page | DONE 09:03Z: `fullBleed` contract (#2021) toggled on the stored tree root, published; hero edge to edge at 1440 | flow/08 (before), flow/09 (after) |
| E1 | Ticket e-mail proof | DONE: five admissions e-mailed from the POS door (3 comps + 2 Mesa), DB stamps method=email; re-sent 08:22Z on the #2030 build so the QR renders | flow/12 (QR route 200 image/png), flow/13 (broken before) |
| E2 | PDF ticket + receipt, Spanish mail, zone label (D-163) | PR #2031 CLEAN, queued | flow/11 (sample page) |
| E3 | Guest ticket page to the owner's mockup + event Settings tab (featured image, refunds switch, checklist) | PR #2024 CLEAN, queued (migration 20261231244000 applied) | |
| D-159 | ticket e-mail payer fallback column | DONE #2016 live | |
| D-160 | public /ticket transfer/resend silent | DONE #2025 live (program session); public resend renders "Sent again to the address on the ticket." 08:47Z | |
| D-161 | POS door 14-day horizon | DONE #2022 live (30 days) | |
| D-162 | Delivery sheet identical "Reenviar" labels | PR #2028 CLEAN, queued | |
| D-164 | QR route /qr.png skipped by the proxy matcher (broken image in every ticket mail) | DONE #2030 live (route /api/tickets/<code>/qr + static guard) | flow/12 |
| F4 | Order 6C22E25F ($0 test comp, never issued) | owner: Orders → Refund lines → Confirm (click gated for the assistant) | |
| F1 | LUMINA imagery to Tulala Stock | handed to the onboarding/imagery session with alt sidecars (family=events) | |
| AI | AI images for the six "Nos acompañan" cards | BLOCKED: Gamma credits (60 left, image costs more), no OpenAI key on the platform | |

Notes
- 2026-09-17 00:40Z: production DB compute-starved (smallest Supabase tier, burst credits drained; count(*) 10.8 s). Owner must upgrade Compute → Small in the Supabase dashboard. Site TTFB 5–27 s until then.
- #2002 on production pointer at 00:38Z (314e6d8be); Vercel build in progress.
- Gamma image credits exhausted after 4 images (hero beams, runway, fire, aerial silk). Remaining imagery via canvas-design skill.

## Owner audit round (2026-09-17, 10:00Z → 18:30Z)

| # | Item | Status | Evidence / PR |
|---|---|---|---|
| D-176 | Date moved to Sat 21 Nov 2026 (session, hero, strip, FAQ, e-mails, engine page) | DONE, published; session `519e18b6` starts 2026-11-22T00:00Z (18:00 Cancún) | live page title "21 de noviembre" |
| D-177 | Home hero LUMINA strip removed (owner: "home looks shit"); top-bar announcement stays → /lumina; LUMINA out of the header nav for good (peer session applied) | DONE, published | improntamodels.com |
| D-178 | SEO URLs: `/events/<slug>` renders the linked builder page, `/es/eventos/<slug>` alias, `/lumina` 308s to the canonical | DONE #2039 live (`events.page_id`, migration 20261231245000); `?edit=1` skips the redirect #2045 live | curl: `/lumina` → 308, `/lumina?edit=1` → 200 |
| D-179 | English page was Spanish | DONE: EN overlay (`node.i18n`) applied by peer session `impronta-app-5e` from `lumina-en.json` (89 entries); "Choose your ticket" on EN, "Elige tu entrada" on ES | both canonical URLs checked after publish |
| D-180 | Ticket UX: tiers visible with prices, designed checkout drawer, always-visible floating "Comprar entradas" | DONE #2040 live (`ticket-picker-{cards,checkout,floating-cta,form}`); floating CTA verified with a real scroll at 375 px in a fresh browser | screenshot in chat |
| AI | Six "Nos acompañan" AI images | DONE via the builder image inspector on production (generateNodeImageAction); stray QR block removed | live page |
| MAP | Venue block: embedded map, Calle 12 Norte, Playa del Carmen | DONE (`location_map` `mapStyle: embed`) | live page |
| C1 | "Elegí tu entrada" → "Elige tu entrada" | DONE 18:25Z (builder edit after #2045; EN overlay intact) | curl both locales |
| T1 | Tier presentation on the ticket type (featured image / badge / includes / description; image column hidden without an image; money parity) | PR #2048 open, gates green, handed to the program session; migration 20261231248000 (additive) to apply before merge | https://github.com/orantene/impronta-app/pull/2048 |
| P0 | Event Program / Schedule / Lineup engine: audit + proposal | PR #2047 (docs) | docs/plans/events-program/00-proposal.md |
| P1 | Wave 1: PR A (schema `event_schedule_items` 20261231249000 + model + night grouping + i18n), PR B (staff actions + public loader) | building; both waiting on the machine-wide tsc queue | |
| P2 | Wave 2 (Programa tab, `event_program` block, JSON-LD, dead lineup fields) · Wave 3 (LUMINA onto the block, QA, docs) | after PR A merges | |

Owner-side, still open: real 500 MXN purchase + refund; Orders → cancel 6C22E25F; confirm venue city (hero says Cancún, venue block says Playa del Carmen).
Editor note: Chrome caches the 308 from `/lumina`; open the editor with `/lumina?edit=1&<any>=1` once after the deploy, then it is fine.
