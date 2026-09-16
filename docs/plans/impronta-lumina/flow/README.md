# LUMINA: from Instagram to "Admitido" in 2 minutes

**Event:** Fiesta de lanzamiento LUMINA · sáb 3 oct · Impronta Models (`improntamodels.com`).
**Read this if you run the door, the Instagram, or the Tickets tab.**

## The guest's path (what they see)

| # | Step | Where | Screenshot |
|---|---|---|---|
| 1 | Taps the link in the Instagram bio | `improntamodels.com/q/lumina` | `01-instagram-link.png` (pending: link minted after PR-2 deploys) |
| 2 | Lands on the launch page on their phone | `/lumina` | `02-lumina-390.png` (pending: page built after PR-4/PR-6 deploy) |
| 3 | Taps **Comprar entradas**, picks a ticket card | sheet opens over the page | `03-tier-cards.png` |
| 4 | Sets how many, sees the total, taps **Continuar** | quantity bar | `04-qty-bar.png` |
| 5 | Enters e-mail + name, taps **Pagar con tarjeta** | details step | `05-details.png` |
| 6 | Pays on Stripe's hosted page | Stripe | `06-stripe.png` |
| 7 | Sees the receipt with the QR | `/r/<code>?paid=1` | `07-receipt.png` |
| 8 | Gets the ticket e-mail (Spanish, Impronta-branded) with QR, code and a link | inbox | `08-email.png` |
| 9 | Opens the link; can resend or transfer the ticket | `/ticket/<code>` | `09-ticket-page.png` |
| 10 | At the door, staff scan the QR | `/admin/events/door` or POS Door | `10-door-admitido.png` |

## What happens behind each step (for the team)

- **/q/lumina** is a short link (QR & Links). It records the scan and redirects to `/lumina`. Minted from the builder's QR block ("Create a link").
- **/lumina** is a builder page built from the "Launch party" design with the real **Buy tickets** block (`ticket_picker`, cards + sheet). The Cortesía tier is hidden; it opens only from `/lumina?tier=<id>`.
- **Checkout** creates an order and sends the guest to Stripe. On payment, Stripe's webhook marks the order paid, mints one admission per ticket (a "Mesa para 10" admits 10) and **sends the ticket e-mail once** (`admissions.delivery` is the once-only claim).
- **Comp tickets** (Event → Día del evento → Cortesías): name, e-mail, reason, tier. With an e-mail, the same ticket mail goes out. The Day tab counts them under "Asignación de cortesías".
- **Resend / transfer** from `/ticket/<code>`: resend sends the same mail again; transfer re-issues the code (the old QR and its e-mail image stop working).
- **Door**: scan the QR (or type the code). Green **Admitido** admits; "Ya usada", "Noche equivocada", "Entrada antigua" refuse with the reason.
- **Tickets tab**: Aforo / Vendidas / Restantes per night. If one ticket type's count cannot be read, the tile shows "≥ n" with a note instead of going blank.

## Off-app sales and free tickets

- **Sold outside the app** (e.g. 2 tables by transfer): POS → Counter → add the tier on the LUMINA night → tender "cash"/"other" for what was collected → buyer name + e-mail. Tickets mint and the buyer gets the e-mail with the QRs. Vendidas moves.
- **Free tickets**: Event → Día del evento → Cortesías (one per person, with an e-mail). Counted on the Day tab; on the door list by name.

## Published-page sweep, 2026-09-16 (390 + 1440, `docs/plans/impronta-lumina/sweep/`)

Every page in the sitemap loads (200), no horizontal overflow at either width, no broken images (except 4 on `/faces-of-fall-26` at 390 during a slow load). Found:

| Page | Finding | Owner |
|---|---|---|
| `/`, `/es` | "Studio & workshops" menu block unstyled (raw list, "-0+" stepper). Root cause: the block never had a stylesheet. | Fixed in PR-A (menu_board CSS) |
| `/studio`, `/contact`, `/music-djs` | React hydration error #418 (server/client HTML mismatch) in the console, Sentry-captured. Page renders, but the mismatched subtree re-renders on the client. Needs a dev server to root-cause; not a copy or block fix. | Program session (register) |
| `/our-fashion-models`, `/faces-of-fall-26` | Slow to reach network-idle (45 s) with three 404 sub-resources. Pages themselves are 200. | Program session (register) |
| `/events/fiesta-de-lanzamiento-lumina` | English chrome on a Spanish event (tenant's first locale is en); programme as one paragraph. Superseded by `/lumina`; add a CTA to it. | B4 |

## Evidence log (filled during the production walk)

_(pending)_
