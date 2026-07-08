# Talent Services — Autonomous Execution Plan (2026-07-08)

**Branch:** `feat/talent-services-storefront` (worktree `impronta-services`, dev port 3300, webpack).
**Builds on:** `talent-rate-pricing-services-audit-2026-07-08.md` + `talent-storefront-build-plan-2026-07-08.md` (both on the audit branch; canonical decisions restated here).
**Mode:** autonomous — plan each phase, execute, test, continue. Full QA at the end. Not launched yet → test hard against the live (pre-launch) database.

## Owner requirements added in this cycle
1. **Per-service selling mode — the talent chooses:** `booking_mode = 'request'` (inquiry → chat → offer → booking; default, safe) or `'instant'` (direct booking / "reserve right away" — e.g. a hairstylist reservation). Fixed price required for instant.
2. **Payment method room:** card (existing Payment Element rail) **or pay in person/cash** (`allow_pay_in_person` → booking confirmed, `payment_status='unpaid'`, chat card says "pay at your appointment"; talent/staff marks paid — `payment_method` enum already has `cash`).
3. **Inquiry messages:** a selected service rides into the chat thread as a structured chip; confirmation flows happen in-thread.
4. **Calendar:** offering-driven bookings must appear on the talent calendar for follow-up.
5. **Messages shell is the management surface** — all booking/offer/payment cards render there (admin-2 live renderer); audit + wire, don't fork.
6. **Multi-type reality:** seed + QA massage, barber/hairstylist, model, DJ/performer offerings, incl. a product.

## Decisions (constant through the build)
- Tab = **Services** (`/talent/services`, new `TalentPage` after profile). DB = `talent_offerings` + `talent_offering_media`. Legacy `services_menu` render stays as fallback; new system takes precedence when offerings exist.
- **Money never forks:** every charge derives from `resolveBookingCommissions` snapshot (`gross_charged`), never `amount_cents`. Quote/custom offerings are server-side uncharge-able. Instant path = generalized `createInstantBooking` with the chosen offering.
- Selection provenance = `inquiries.source_context.offering` + `source_channel='offering_request'`; chargeable truth = offer line stamped `source_service_id = offering.id`.
- Migrations: MCP `execute_sql` + manual `schema_migrations` rows (db:push drift-blocked). One timestamp family: `20260708161910…`.

## Phases (tasks #1–#10)
A. **Schema** — `talent_offerings` (kind, price_type, price_display, amount_cents, currency, booking_mode, allow_pay_in_person, duration, inventory, status/visibility/moderation, featured, sort, attributes, i18n) + media join + `inquiry_source_channel += 'offering_request'` + RLS (anon read published∧¬agency_only∧approved; writes via service-role actions).
B. **Lib** — `offerings-types.ts` (normalize/validate/CTA resolve), `offerings-actions.ts` (load/save/list/legacy-import), `offerings-offer.ts` (→ OfferLineDraft). Tests in `test:billing` family.
C. **Editor** — Services tab (6 fields + booking-mode + pay-in-person + Add details), nav wiring, admin drawer mount, "Services"→"Talent type & specialties" relabel.
D. **Public** — `TalentStorefront` kind-aware presenter + `OfferingCta` on all 4 layouts, images via media join, fallback to legacy block.
E. **Inquiry carry** — intent/submit/source_context/chat chip/composer prefill.
F. **Direct booking** — generalized instant-book; card + pay-in-person branches; server guards.
G. **Calendar + Messages shell** — verify bookings surface on `loadTalentCalendarEntries` + thread cards; fix gaps.
H. **Seed** — 4 talent types with realistic offerings (≥1 instant, ≥1 pay-in-person, ≥1 product, ≥1 quote-only).
I. **E2E QA** — per type: render → request→inquiry(+chip) → composer prefill → offer → booking; instant card + cash; calendar; commission invariant. Gate: tsc/lint/tests.
J. **Full QA audit** — adversarial pass (money, RLS/tenant isolation, plan gating, i18n, mobile, regression), fixes, commit, final report.

Each phase opens with a short deeper plan (in-commit or task comment) and closes with a test proof before the next begins.
