# Talent Rate → Services Menu (approved 2026-06-14)

Replace the talent "Rate" with a flexible **menu of services**: a talent lists multiple
services/packages priced by different units, optionally scoped to a discipline, that feed the
existing offer / instant-book money rail (the 3-way split is **not** reinvented).

## Approved decisions (user, 2026-06-14)
- **Scope:** all 20 stories (build phased, MVP-first).
- **Storage:** JSONB `talent_profiles.services_menu` (stable per-item `id` for offer audit) — mirrors
  `package_teasers` / the booking-terms idiom.
- **Pricing units:** **extend** the `inquiry_offer_line_items.pricing_unit` Postgres enum (add
  `half_day`, `per_person`, `per_contact`, `flat_package`, `custom`) so a service's `pricingType`
  IS a valid offer unit (mapper = identity) and offers read correctly.
- **Ownership:** talent-owned in v1 (talent edits; roster staff edit via the drawer). No
  agency floor/ceiling/gating layer yet.

## Data model — `ServiceMenuItem` (`talent_profiles.services_menu` jsonb array)
```
{ id, name, description, pricingType, amountCents|null, currency,
  taxonomyTermIds: string[]|null (null = general/all disciplines),
  addOns: [{id,label,pricingType,amountCents}], tiers: [{id,label,amountCents}],
  isActive, visibility: public|agency_only|on_request, sortOrder, isInstantBook? }
```
`pricingType` = `hour|day|week|half_day|event|per_person|per_contact|flat_package|custom`
(= the extended `pricing_unit` enum). `custom` ⇒ no price (quote on request); `flat_package` ⇒ units=1.

## Integration (reuse, don't reinvent)
- **Offer:** a chosen service pre-fills an `inquiry_offer_line_items` row via `updateOfferDraft`
  ({label, pricing_unit, units, unit_price, talent_cost, sort_order}); stamp `sourceServiceId` +
  price for audit. Commission snapshot unchanged.
- **Instant-book:** a designated instant-book service sources the line in `createInstantBooking`
  (replacing the bare `fixedRateCents`); falls back to `fixedRateCents` when none designated.
- **Save idiom:** mirrors `talent-booking-terms-actions.ts` (talent-self OR roster staff;
  service-role write). Types live in a directive-free module (sibling to `commercial-terms-types`).

## Phases (each = gated PR(s), QA'd, shipped)
- **A — Foundation** (S1,S2,S3,S20): model + types, enum extension + mapper, load/save action, validation + tests. *(no UI; safe)*
- **B — Editor** (S4,S5,S17,S13): talent settings repeater card, unit picker, per-service currency, admin drawer parity.
- **C — Richness** (S6,S7,S8,S9,S10): discipline scoping, visibility, add-ons, tiers, bundle packages.
- **D — Surfacing + integration** (S12,S19,S14,S15,S16,S18,S11): public page render + discipline filter, offer picker → pre-fill, instant-book, audit stamp, legacy migration.

The 20 stories (S1–S20) are recorded in the session transcript / workflow result (wf_9a8d956f-57d).
