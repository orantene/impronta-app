# Services × Chat — the inquiry-to-booking funnel (W2)

**Date:** 2026-07-08 · **Branch:** `feat/talent-services-storefront` (wave 2)
**Naming (final, owner-decided):** the talent tab is **"Catalog & Pricing"** (was "Services"; before that "Storefront"). Bare "Catalog" was rejected — "Catalog Model" is a talent type in the taxonomy, a real vernacular collision; "Pricing" alone undersold the presentation half. Route stays `/talent/services`; the item noun stays "service"; the public heading stays adaptive ("Services & pricing").

**Companions:** `talent-services-qa-report-2026-07-08.md` (wave-1 build+QA) · `talent-storefront-build-plan-2026-07-08.md` (product plan)

## 1. The chat IS the funnel — audit of the rail with services integrated

The guest chat (`MiniChatPanel` + launcher on every talent profile, defaults-ON per tenant) is the platform's primary inquiry surface. The full lifecycle it drives, with the services integration at each step:

| Stage | Record | Services integration (now live) |
|---|---|---|
| **Browse** | — | Storefront section on the profile: kind-aware cards, behavior-resolved CTAs (Book now / Book / Request / Ask for quote) |
| **Select** | — | Card CTA opens the chat carrying the offering; **NEW (W2-B): the chat itself shows the talent's services as chips under the composer** — the menu lives inside the conversation. Talents with zero services show one "Custom quote" chip (every talent is requestable) |
| **Inquiry** | `inquiries` (`submitted`) | First message auto-prefixed `Requesting: {title} ({price})`; structured `source_context.offering` persisted; channel analytics via `offering_request`/`instant_book` |
| **Coordination** | thread messages | Coordinator sees the request in-thread + the structured payload; client can tap more chips to ask about other services (visible text in thread) |
| **Offer** | `inquiry_offers` + line items | Composer's "From menu" picker lists **offerings first**, then the legacy menu, then **default rate templates** (W2-C: Hourly / Half-day / Day / Event / Custom package — label+unit prefill, coordinator types the price) so EVERY talent is offer-able with full customization freedom. Lines stamp `source_service_id` |
| **Accept → Booking** | `agency_bookings` (`confirmed`) + `booking_talent` | Auto (direct booking) or on client accept; feeds the talent + admin calendars |
| **Payment** | `booking_transactions` → Stripe | Per the offering's **reserve mode** (below); charge = commission-snapshot gross, never the raw price |
| **Follow-up** | Messages shell | Full `inquiry_events` card stream proven: `offer.sent → approvals → accepted → booking.created → transaction_created → payment.receiver_selected → payment.requested` |

**Direct answer to “inquiry is without selecting service, then services added at offer phase?”** Both are true by design: a service selection at inquiry time is *context* (it pre-fills and speeds coordination); the **offer phase is where services become chargeable line items**. Clients request; coordinators compose. Fixed-price + instant offerings can skip the human loop entirely (the headless offer is auto-accepted).

## 2. Reserve models — the talent chooses per service (W2-A, live + E2E-proven)

| Reserve mode | Client pays at booking | Then | E2E proof |
|---|---|---|---|
| **Full amount** (default) | 100% of snapshot gross | done | gross 41,200 charged on 40,000 raw |
| **Deposit %** | `deposit_pct` of snapshot gross (`checkout_type='deposit'`) | balance later via the existing balance rail | 3,708 billed = exactly 30% of 12,360 |
| **Free reserve** | nothing | staff request payment later (card) or collect at the appointment | booking `confirmed`, txn `draft` |
| *+ Pay in person* (orthogonal toggle) | nothing by card | staff mark paid (cash) from Messages | txn `draft`, provenance `pay_in_person` |

Guards: deposit requires 1–99% (DB CHECK + validation); quote/custom offerings remain **uncharge-able**; every charge derives from `resolveBookingCommissions`' snapshot.

**Also worth adding later (flagged, not built):** cancellation windows per reserve mode (free-until-48h etc.), no-show fees, auto-expiring free reserves, per-offering refund policy override, and reminder nudges for unpaid free reserves.

## 3. Default rates for every talent (W2-C, live)

No fake public prices. Instead the **offer composer** shows five DEFAULT templates (Hourly / Half-day / Day rate / Event / Custom package) whenever a talent has no configured services — picking one prefills label + pricing unit and leaves the price to the coordinator/admin. The **chat** equivalently shows a "Custom quote" chip. Net effect: *every talent on the platform is inquiry-able, offer-able, and bookable from day one; configured services only make it richer.*

## 4. Deployment (how this ships)

1. **Migrations are already applied** to the production Supabase (dev = prod DB): `…161910/11/12`, `…190801`. `check:migrations-applied` passes by construction.
2. Push `feat/talent-services-storefront` → open a PR to `main` → review → squash-merge.
3. Vercel auto-builds production from `main`; the post-deploy alias Action re-points `tulala.digital` / `app.tulala.digital`.
4. `cd web && npm run deploy:smoke` (checks alias drift + migration drift).
5. Rollout is inherently safe: 0 talents had legacy pricing data; the legacy `ServiceMenuBlock` remains the fallback; new tables are additive; the snapshot-RPC fix corrects a live P0 (it can ship ahead of everything else if desired).

## 5. Marketing — how the storefront works commercially

- **Conversion ladder:** browse → "Ask about a service" (zero-friction chat chip) → "Request to book" (intent) → "Book now" (instant). Deposits + free-reserve lower the commitment threshold at every rung; talents pick where their offer sits on the ladder.
- **Merchandising:** featured "Signature" offering per talent; kind-aware presentation (menu / packages / shop) keeps profiles premium, not bazaar-like. Prices are honest (`from`, "On request", quote) — no dark patterns.
- **Supply-side pitch:** "Put your menu on your page — get booked while you sleep." The per-service *Quoted × Booked × convert%* analytic (already live on legacy menu; carries to offerings) is the talent's growth loop.
- **Platform economics:** every path — instant, deposit, cash, negotiated — runs through the commission snapshot, so the take-rate is collected identically regardless of how the talent chooses to sell. (The wave-1 P0 fix is what makes this true.)
- **SEO (later):** offerings are structured data — per-service schema.org `Offer` markup on profiles is a cheap follow-up win.

## 6. W2 QA summary

- **E2E 22/22 green** (deposit @30% exact, free reserve draft, cash draft, quote guard, payment_requested with payout account, event-stream lifecycle, calendar links).
- Unit tests 9/9 (types incl. reserve validation); tsc clean.
- Browser: services chips render in the chat panel (verification below); editor exposes "To reserve, clients pay: Full / Deposit % / Nothing".

## 7. Follow-ups (accumulated)

Browser click-through of editor + chat send round-trip · in-editor photo uploader · styled confirm sheet · live-thread structured attach (`source_context.offerings[]` for taps after the thread starts — text lands in-thread today) · cancellation/no-show policy per reserve mode · schema.org Offer markup · database.types regen · InquiryDrawer (signed-in client drawer) offering carry.
