# LUMINA: from Instagram to "Admitido" in 2 minutes

**Event:** Fiesta de lanzamiento LUMINA · sáb 3 oct · Impronta Models (`improntamodels.com`).
**Read this if you run the door, the Instagram, or the Tickets tab.**

## The guest's path (what they see)

| # | Step | Where | Screenshot |
|---|---|---|---|
| 1 | Taps the link in the Instagram bio | `improntamodels.com/q/lumina` → 302 → `/es/lumina?l=<scan>` | live, verified 2026-09-17 01:5xZ |
| 2 | Lands on the launch page on their phone | `/es/lumina` (Spanish) | `02-lumina-390.png`, `02b-lumina-390-full.png` |
| 3 | Taps **Comprar entradas**, picks a ticket card | sheet opens over the page | `03-tier-cards.png` |
| 4 | Sets how many, sees the total, taps **Continuar** | quantity bar | `04-qty-bar.png` |
| 5 | Enters e-mail + name, taps **Pagar con tarjeta** | details step | `05-details.png` |
| 6 | Pays on Stripe's hosted page | Stripe (live keys; reached with "Tickets · MX$2,000.00", not paid) | seen live 2026-09-17; no capture kept (payment page) |
| 7 | Sees the receipt with the QR | `/r/<code>?paid=1` | pending the owner's one real purchase + refund |
| 8 | Gets the ticket e-mail (Spanish, Impronta-branded) with QR, code and a link | inbox | pending the owner's purchase (the 3 comps were issued before the mail existed; use Resend from the Delivery sheet) |
| 9 | Opens the link; can resend or transfer the ticket | `/ticket/<code>` | pending (same) |
| 10 | At the door, staff scan the QR | `/admin/events/door` or POS Door → **Admitido** | pending a real ticket to scan |

## What happens behind each step (for the team)

- **/q/lumina** is a short link (QR & Links). It records the scan and redirects to `/lumina`. Minted from the builder's QR block ("Create a link").
- **/lumina** is a builder page built from the "Launch party" design with the real **Buy tickets** block (`ticket_picker`, cards + sheet). The Cortesía tier is hidden; it opens only from `/lumina?tier=<id>`.
- **Checkout** creates an order and sends the guest to Stripe. On payment, Stripe's webhook marks the order paid, mints one admission per ticket (a "Mesa para 10" admits 10) and **sends the ticket e-mail once** (`admissions.delivery` is the once-only claim).
- **Comp tickets** (Event → Día del evento → Cortesías): name, e-mail, reason, tier. With an e-mail, the same ticket mail goes out. The Day tab counts them under "Asignación de cortesías".
- **Resend / transfer** from `/ticket/<code>`: resend sends the same mail again; transfer re-issues the code (the old QR and its e-mail image stop working).
- **Door**: scan the QR (or type the code). Green **Admitido** admits; "Ya usada", "Noche equivocada", "Entrada antigua" refuse with the reason.
- **Tickets tab**: Aforo / Vendidas / Restantes per night. If one ticket type's count cannot be read, the tile shows "≥ n" with a note instead of going blank.

## Off-app sales and free tickets

- **Sold outside the app** (e.g. 2 tables by transfer): POS → Counter → add the tier on the LUMINA night → **Customer: attach the buyer with an e-mail first** → Charge → tender "cash" for what was collected. Tickets mint and the buyer gets the e-mail with the QRs. Vendidas moves. Without a customer on the sale the tickets exist only on the receipt link (nobody to e-mail).
- **Free tickets**: Event → Día del evento → Cortesías (one per person, with an e-mail). Counted on the Day tab; on the door list by name.

## Published-page sweep, 2026-09-16 (390 + 1440, `docs/plans/impronta-lumina/sweep/`)

Every page in the sitemap loads (200), no horizontal overflow at either width, no broken images (except 4 on `/faces-of-fall-26` at 390 during a slow load). Found:

| Page | Finding | Owner |
|---|---|---|
| `/`, `/es` | "Studio & workshops" menu block unstyled (raw list, "-0+" stepper). Root cause: the block never had a stylesheet. | Fixed in PR-A (menu_board CSS) |
| `/studio`, `/contact`, `/music-djs` | React hydration error #418 (server/client HTML mismatch) in the console, Sentry-captured. Page renders, but the mismatched subtree re-renders on the client. Needs a dev server to root-cause; not a copy or block fix. | Program session (register) |
| `/our-fashion-models`, `/faces-of-fall-26` | Slow to reach network-idle (45 s) with three 404 sub-resources. Pages themselves are 200. | Program session (register) |
| `/events/fiesta-de-lanzamiento-lumina` | English chrome on a Spanish event (tenant's first locale is en); programme as one paragraph. Superseded by `/lumina`; add a CTA to it. | B4 |

## What is live on improntamodels.com (2026-09-17)
- `/lumina` (EN chrome) and `/es/lumina` (Spanish, the canonical share URL): Launch party design, real Buy tickets block (cards + sheet, Cortesía hidden, includes per tier), QR block.
- Header nav "LUMINA" → `/lumina`; home hero banner "Fiesta de lanzamiento LUMINA · sáb 3 oct · Cancún · Entradas disponibles" → `/lumina`.
- `/q/lumina` short link (name "LUMINA Instagram") → `/es/lumina`, scans recorded. Print file: `/api/links/lumina/qr.pdf?mm=80` while signed in.
- Guest walk on a phone (390): sticky Comprar entradas → sheet → Entrada general → ×2 → details → Stripe hosted page "Tickets · MX$2,000.00". Stopped there.

## Evidence log (filled during the production walk)

- 2026-09-16 ~18:20 · Comps: Event → Día del evento → "Admisión de cortesía", 3 × Cortesía (LUMINA comp 1/2/3, orantene@gmail.com, "Prueba de emisión LUMINA"). Each answered "Entrada de cortesía emitida." (D-146 migration live on production). Ticket e-mails for these go out once PR #2002 deploys (they were issued before the mail existed; the Delivery sheet's Resend sends them).
- Tickets tab after the comps: Vendidas still "—" on the deployed build (D-147 fix in #2003 not yet on the production pointer).
- 2026-09-17 02:53Z · Off-app tables: POS Counter sale #D4A8, 2 × Mesa para 10, cash $30,000. "Paid" screen, receipt https://improntamodels.com/r/h52uec7bxdc4anug36ey with two "Party of 10" codes. Tickets & Offers: Sold 2, Mesa para 10 2/20, remaining sellable 3221. Door (session 519e18b6…): 23 expected = 3 comps + 2 × 10.
- Same minute · Ticket e-mail did not go out: Vercel log `[events.ticketDelivery/payer] column booking_transactions.tenant_id does not exist (42703)`. The sale had no customer attached (POS guest session), so delivery fell through holder → customer → payer and the payer query was wrong. Fix PR #2016. After it deploys: attach the buyer on #D4A8, then Resend from the door Delivery sheet.
- Overview exception "1 ticket sold and never issued" = order 6C22E25F, a $0 test order from 2026-09-07 with no admission. Ruling: cancel it (Refund lines → "Cancel one ticket" → Confirm). Not the LUMINA sale.
