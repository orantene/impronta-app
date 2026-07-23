# Talent Services (Storefront) — Build + QA Report

**Date:** 2026-07-08 · **Branch:** `feat/talent-services-storefront` · **Mode:** autonomous execution (plan → build → test per phase → full QA)
**Plan:** [`talent-services-execution-plan-2026-07-08.md`](./talent-services-execution-plan-2026-07-08.md) · **Product plan:** `talent-storefront-build-plan-2026-07-08.md` (audit branch)

## What shipped (phases A–I, all gates green)

| Layer | Delivered |
|---|---|
| **Schema (LIVE)** | `talent_offerings` (kind service/package/product · price_type = pricing_unit enum · price_display exact/from/quote · **booking_mode request/instant** · **allow_pay_in_person** · duration/category/inventory/featured/visibility/silent-moderation/attributes/i18n) + `talent_offering_media` (→ `media_assets`) + RLS (anon = published ∧ ¬agency_only ∧ approved — **proven** via `SET ROLE anon`) + `inquiry_source_channel += 'offering_request'`. Migrations `20260708161910/11/12`, applied + recorded. |
| **Lib** | `offerings-types.ts` (normalize/validate/CTA resolver/`offeringIsDirectlyBookable` money guard), `offerings-actions.ts` (owner-or-staff auth, editor CRUD + reorder + images + **legacy import reading all four old rate sources**), `offerings-public.ts` (anon-equivalent public loader, canonical media URL resolution), `offerings-offer.ts` (→ offer-line seed, `source_service_id` stamp). 9 unit tests wired into `test:billing`. |
| **Services tab** | New `TalentPage` **"services"** (`/talent/services`, nav after Profile; tenant-path redirector; segment map). `TalentOfferingsManager` editor: add-a-service composer (title · price + Fixed/From/Contact segmented mode · human unit pills · **"How clients book this": Inquiry to book / Direct booking + pay-in-person** · Add-details fold), rows with Live/Hidden + Direct-booking badges, reorder/feature/duplicate/hide/delete, legacy import, empty state + starters. Same editor mounted in the **admin profile drawer** (replaces `TalentServicesMenuCard`); Settings card → pointer to the tab; profile-editor "Services" section relabeled "Talent type & specialties". |
| **Public storefront** | `TalentStorefront` (kind-aware: service rows / package cards 2-up / product grid, ≤1 featured rail, group subheads only at 2+ groups) + `OfferingCta` (behavior-resolved copy: Book now / Book / Request / Ask for quote; dispatches `tulala:offering-request` / `tulala:offering-instant`). Wired into **all four layouts** with the legacy `ServiceMenuBlock` as zero-regression fallback; plan gate preserved. |
| **Inquiry carry** | Guest chat: CTA event opens the launcher; offering rides `StartGuestChatInput.offering` → `inquiries.source_context.offering`, and the first message is prefixed **"Requesting: {title} (EUR x)"** so coordinator + guest both see it in-thread. Offer composer's service picker now lists **offerings first** (adapted to the ServiceMenuItem shape → zero machinery changes, stamp intact). |
| **Direct booking** | `createInstantBooking` generalized: books the **chosen offering** (per-service opt-in; tenant gate blocks only when explicitly disabled), line = offering title/unit/price + stamp, provenance in `source_context`. **Payment choice:** card → payout receiver (talent, else any candidate) + `requestPayment`; **pay-in-person** → booking confirmed, txn stays `draft`, staff mark paid (cash) from Messages. Server guard: quote/custom/draft/agency-only offerings are **uncharge-able**. Client mount confirms + routes guests to sign-in. |

## 🔴 P0 platform bug found & fixed (pre-existing, not from this feature)

The live `engine_persist_booking_commission_snapshot` RPC **dropped the extended lane keys** (`client_surcharge_cents`, `seller_deduction_cents`, `gross_charged_cents`, `seller_shortfall_cents`) that the TS engine sends — columns defaulted to 0 while the table CHECK had been upgraded to `lanes = gross_charged_cents`. Result: **every commission snapshot since ~2026-06-03 failed silently**, and payment silently fell back to charging the **raw rate** (the platform's client surcharge was never collected). Surfaced by this build's E2E invariant test; fixed in `20260708161912` (RPC re-created inserting the extended columns, lanes-sum fallback for legacy callers). Post-fix, the invariant holds (see below).

## E2E proof — 19/19 green (`web/scripts/qa-offerings-e2e.mts`, real client session, live rail)

1. **Card direct booking** (makeup artist, 120 EUR `per_contact`): booking `confirmed` · snapshot persisted · **gross 12 360 > 12 000 raw (surcharge collected)** · charge == snapshot gross · line stamped `source_service_id` + unit · `source_context.offering` on the inquiry.
2. **Pay-in-person** (same offering): booking created · **txn stays `draft`** (no card request) · provenance `pay_in_person: true`.
3. **Quote offering:** direct booking **refused** (`instant_book_not_enabled`) — uncharge-able by construction.
4. **DJ event booking** (400 EUR `event`): gross 41 200 > 40 000 · unit + stamp correct.
5. **Payout-account talent (More):** **`payment_requested`** issued (gross 8 240) · `inquiry_events` shows the full Messages-shell lifecycle: `offer.sent → approval.approved×2 → offer.accepted → booking.created → booking.payment.transaction_created → payment.receiver_selected → payment.requested`.
6. **Calendar source:** `booking_talent` links exist for every booking (feeds `loadTalentCalendarEntries`).

## Public render proof (curl + DOM, host `improntamodels.com`, dev :3300)

| Talent (type) | Storefront | Shape | CTAs resolved | Media | Prices |
|---|---|---|---|---|---|
| More TAL-00045 (model, pro) | ✅ | 4 rows + featured | book_now (casting) · request×3 · ask_quote (buyout) | real portfolio URLs | €600/€350/€500/€80 |
| TAL-AUDIT-0512 (makeup, portfolio) | ✅ | 3 rows + package card + featured | **book_now** (trial, cash-ok) · request · **ask_quote** | — (no media owned) | €120/€85/€38/from €450 |
| Popi TAL-00039 (DJ, pro) | ✅ | row + package card + featured | book_now (set) · request×2 | ✅ | €400/€120/€900 |
| matu TAL-92061 (model, **free**) | **hidden** ✅ | — | — | — | plan gate holds |

Legacy `ServiceMenuBlock` correctly replaced wherever offerings exist; `/talent/services` responds 200 authed with the Services tab in nav.

## Seeds (kept for admin-shell inspection)

14 offerings: makeup (instant+cash trial · event · package-from · quote · product), model (half/full-day · from-rate · buyout-quote · instant casting; 3 image links), DJ (instant set · wedding package · extra hour). QA bookings/inquiries from the E2E runs remain in the DB — open the impronta admin Messages shell to inspect the offer/payment cards on them.

## Follow-ups (not blocking)

1. **Browser click-through** (editor add/edit/reorder, guest-chat chip UX, admin thread render) — server paths are proven; UI interaction needs a real browser session.
2. **In-editor photo upload** (storage + attach is live via `setOfferingImages`; the uploader UI is pending).
3. **Styled direct-booking confirm sheet** (native `confirm()` today, per the existing instant-book pattern).
4. `database.types.ts` regen (new tables accessed via casts, consistent with the services-menu precedent).
5. i18n sweep of the new editor copy; ES CTA strings are already in.
6. Retire legacy `rates.cards`/fixed-rate surfaces once the storefront soaks (fallback keeps them harmless meanwhile).
