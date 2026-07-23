# Talent Rate / Pricing / Services — Deep Audit & Ecommerce Evolution Plan

**Date:** 2026-07-08
**Scope:** How a talent sells, displays, or communicates pricing for services/products today, and how to evolve it into a premium, scalable service/product catalog for every talent type.
**Method:** Read-only audit. Live production Supabase (`pluhdapdnuiulvxmyspd`), full code map of the edit/render/offer/payment surfaces, and a data-adoption census across all 121 production talent profiles.
**Deliverable:** Audit first. No feature was built. Implementation is proposed, not started.

---

## 0. TL;DR (read this first)

The platform did **not** neglect pricing — it built it **three times**. There are four disconnected places a "price" can live, the newest of which (`services_menu`) is a genuinely good configuration model. But:

1. **Across all 121 production talents, essentially nobody has entered a sellable price.** `services_menu`: 0. `rates.cards`: 0. `packageRates`/`rateTiers`: 0. Fixed booking rate: 0. Only 1 talent has a (price-less) "package teaser." The whole stack is **dormant**.
2. **The newest system (`services_menu`) is the right foundation but is not ecommerce.** It has **no images/gallery**, **no product concept**, **no inventory**, and its public cards are **display-only** — a client physically cannot click "Wedding Package — $2,500" to inquire or book it.
3. **The three older systems create real talent confusion** and carry live data-loss bugs.

**Honest maturity score (vs. the "sell services/packages/products from your profile" vision): 3.0 / 10.**
The offer + payment + commission plumbing behind it is solid (7/10) and fully reusable. The gap is the *product surface*: imagery, actionability, product support, and consolidation. Because adoption is zero, **there is no migration risk** — we can design the ideal model and cut over cleanly.

> **Every load-bearing finding below was independently re-verified** by a separate adversarial pass (9 / 9 claims CONFIRMED — the two data-loss bugs, the "no imagery," the "non-actionable public cards," the money invariant, and the orphaned/dead fields). See **Appendix A**. A full talent-type flexibility deep-dive across all 11 types (deliverable #6) is in **Appendix B**; the concrete field requirements it surfaces are folded into §9.1.

---

## 1. Current behavior summary

A talent's "price" can be expressed in **four architecturally separate systems**, all live at once:

| # | System | Storage | Edited where | Shown on public profile? | Purpose |
|---|--------|---------|--------------|--------------------------|---------|
| 1 | **Legacy rate blobs** | `talent_profile_field_values` keys `rates.cards`, `commercial.packageRates`, `commercial.rateTiers` + 4 scalars (`rateCardVisibility`, `askForQuote`, `travelIncluded`, `lodgingIncluded`) | "Rates" accordion in the profile-shell drawer (admin + talent-self); onboarding wizard | **No** (dead — no layout renders them) | Per-talent-type day/hour rate + named package bundles |
| 2 | **Booking terms** | `talent_profiles.booking_terms` jsonb (`fixedRateCents`, deposit, refund, instant-book) | "Booking terms" accordion + `CommercialBookingTermsCard` in Settings | Indirectly — `fixedRateCents` drives instant-book "Book now — $X" | A single fixed "From $X" rate + booking prefs |
| 3 | **Services menu** (newest, 2026-06-14) | `talent_profiles.services_menu` jsonb (`ServiceMenuItem[]`), dual-written to catalog `commerce.servicesMenu` | `TalentServicesMenuCard` (Settings + admin drawer) | **Yes** — "Services & pricing" cards on all 4 layouts (plan-gated) | A menu of priced services; pre-fills an offer/instant-book |
| 4 | **Editorial teaser cluster** | `talent_profiles.package_teasers`, `booking_note`, `starting_from`, `service_category_slug` | **No editor** — DB-seeded fixtures only | **Yes** — "Services" text block (`ServicesBlock`) | Marketing teaser (package names, "Starting from" text) |

So on the public profile, a Pro/Portfolio talent can render **two adjacent sections** — "Services" (system 4 text) then "Services & pricing" (system 3 cards) — while their "Rates" accordion (system 1) and "Fixed rate" (system 2) render **nothing** publicly.

### The one that matters: `services_menu` (`ServiceMenuItem`)
Defined in `web/src/lib/talent/services-menu-types.ts`. This is the modern, extensible model and the one to build on:

```ts
type ServiceMenuItem = {
  id: string;
  name: string;
  description: string | null;
  pricingType: "hour" | "day" | "week" | "half_day" | "event"
             | "per_person" | "per_contact" | "flat_package" | "custom";
  amountCents: number | null;      // null = quote on request (custom)
  currency: string;                // per-service ISO code
  taxonomyTermIds: string[] | null;// discipline scoping
  addOns: { id; label; pricingType; amountCents }[];
  tiers:  { id; label; amountCents }[];        // e.g. 2h / 4h / full-day
  childServiceIds: string[] | null;            // bundle contents (flat_package)
  isActive: boolean;
  visibility: "public" | "agency_only" | "on_request";
  sortOrder: number;
  isInstantBook: boolean;          // at most one per talent
};
```
`pricingType` values are **identical** to the `inquiry_offer_line_items.pricing_unit` Postgres enum (verified live: `hour, day, week, event, half_day, per_person, per_contact, flat_package, custom`), so a service maps 1:1 onto an offer line. Storage is i18n-ready (`name_i18n`/`description_i18n`).

**What is conspicuously absent from the model:** `images` / gallery, `durationMinutes` (real duration, distinct from billing unit), `category`, `isFeatured`, a `kind` (service vs package vs **product**), `inventory`/stock, and any `draft` state beyond `isActive`.

---

## 2. Screens / areas tested

- **Public profile** — `web/src/app/t/[profileCode]/page.tsx` + all four layouts (`_light`, `_atelier`, `_lumen`, `_noir`) and `_shared`. Service card rendering (`_light/ServiceMenuBlock.tsx`, `ServiceMenuList.tsx`, `ServiceMenuFilter.tsx`), legacy text block (`_light/ServicesBlock.tsx`), instant-book CTA (`talent-profile-instant-book-button.tsx`), inquire CTA (`talent-profile-inquire-button.tsx`), chat launcher.
- **Talent self-edit** — `TalentServicesMenuCard.tsx` (services menu), `CommercialBookingTermsCard.tsx` (booking terms), onboarding `RatesStep`, the "Rates" + "Booking terms" accordions in `TalentProfileShellDrawer.tsx`.
- **Admin edit** — the same `TalentProfileShellDrawer` "Rates"/"Booking terms" accordions; `RatesEditor` / `PackageRatesEditor`; the offer composer service picker (`line-service-picker.tsx`, `machinery-11.tsx`).
- **Backend / flow** — services-menu actions, legacy blob/scalar catalog helpers, offer engine (`inquiry-engine-offers.ts`), instant-book engine (`instant-book-engine.ts`), transactions/Stripe (`transactions.ts`, `stripe-payment-intent.ts`, `transfers.ts`), commission (`commission.ts`).
- **Live DB** — schema of `talent_profiles`, `talent_profile_field_values`, `profile_field_definitions`, `inquiry_offer_line_items`, `media_assets`; adoption census; Morena's row.

### The "Morena" note
The profile the request pointed at (`eb97dc64-…`) is **`TAL-AUDIT-0512` "QA Talent Dashboard Audit"**, a QA fixture rostered to the *Morena Studio* workspace (tenant `e886a518`), plan `talent_portfolio` / tier `free`, currency EUR. It has **no** services menu, rate cards, packages, or booking terms — only the four auto-defaulted commercial toggles (`rateCardVisibility='agency-only'`, others false). It was useful for confirming the *plumbing* and gating, but it is not a populated example. **No production talent is** — see §4.

---

## 3. Files / components / APIs / data structures involved

**Data model / types**
- `web/src/lib/talent/services-menu-types.ts` — `ServiceMenuItem`, normalizer, validator, `findInstantBookService`, i18n (de)serialize.
- `web/src/lib/talent/blob-field-values-catalog.ts` / `scalar-field-values-catalog.ts` — legacy rate blobs/scalars in the field engine.
- `web/src/components/admin/shell/internal/state/types.ts` — `ProfileRate` (1631), `PackageRate` (1820), `RateUnit` (1629).
- `web/src/lib/billing/commercial-terms-types.ts` — `TalentBookingTerms`.
- DB columns on `talent_profiles`: `services_menu`, `booking_terms`, `package_teasers`, `booking_note`, `starting_from`, `service_category_slug`, `total_completed_bookings`, plan cols `talent_plan_key` / `membership_tier` / `subscription_template`.

**Edit surfaces**
- `web/src/app/(workspace)/[tenantSlug]/talent/settings/TalentServicesMenuCard.tsx` — the services-menu editor (also mounted in the admin drawer at `TalentProfileShellDrawer.tsx:3899` and `SettingsPage.tsx:102`).
- `.../settings/CommercialBookingTermsCard.tsx` — booking terms.
- `.../drawers/profile-shell/profile-shell-modules/profile-editors-core.tsx` (`RatesEditor` 495), `profile-extras-editors.tsx` (`PackageRatesEditor` 498), `profile-commercial-terms.tsx` (`CommercialTermsEditor`).
- `web/src/app/(workspace)/talent/onboarding/onboarding-steps.tsx` (`RatesStep` 461).

**Server actions / APIs**
- `web/src/lib/talent/services-menu-actions.ts` — `loadTalentServicesMenu`, `updateTalentServicesMenu`, `importLegacyServicesMenu`, `loadTalentServicePerformance`.
- `web/src/lib/talent/services-menu-legacy.ts` — legacy → menu import mapper.
- `web/src/lib/server-actions/admin-talent-profile-sections.ts` (`commitTalentProfileShellAdmin`, `getTalentProfileEditorData`, `updateTalentRates`), `talent-self-profile-sections.ts` (`updateSelfRates`).
- `web/src/lib/talent/talent-booking-terms-actions.ts`.

**Public render**
- `web/src/app/t/[profileCode]/page.tsx` (fetch + filter + layout dispatch), `_light/ServiceMenuBlock.tsx` / `ServiceMenuList.tsx` / `ServiceMenuFilter.tsx` / `ServicesBlock.tsx`, and the `_atelier` / `_lumen` / `_noir` layouts (all reuse the `_light` blocks).

**Offer / booking / payment**
- `web/src/lib/talent/services-menu-offer.ts` (identity map), `line-service-picker.tsx` + `machinery-11.tsx` (composer), `inquiry-engine-offers.ts` (`OfferLineDraft`, `updateOfferDraft`), `instant-book-engine.ts` (`loadInstantBookEligibility`, `createInstantBooking`), `transactions.ts`, `stripe-payment-intent.ts`, `transfers.ts`, `commission.ts`.
- DB `inquiry_offer_line_items` cols: `id, offer_id, talent_profile_id, label, pricing_unit, units, unit_price, total_price, talent_cost, notes, sort_order, tenant_id, source_service_id`.

**Reusable media infra** (for the imagery gap)
- `media_assets` already has: `owner_talent_profile_id`, `variant_kind`, `sort_order`, `approval_state`, `purpose`, `asset_kind`, `public_url`, `alt`, `tags`, `watermark_override_json`, `visible_on_master_profile`, `visible_in_talent_editor`, `tenant_id`. **A service/product image system does not need new storage — it needs a link.**

---

## 4. Data-adoption census (the decisive finding)

Live counts across **121 production talent profiles**:

| Pricing field | Talents populated |
|---|---|
| `commercial.rateCardVisibility` / `askForQuote` / `travelIncluded` / `lodgingIncluded` (toggles, auto-defaulted) | 121 |
| `creator.engagement_rate` (influencer stat) | 5 |
| `creator.rate_per_reel` | 2 |
| `package_teasers` (label + detail, **no price**) | 1 |
| **`services_menu`** | **0** |
| **`rates.cards`** (per-type day/hour rate) | **0** |
| **`commercial.packageRates`** / **`commercial.rateTiers`** | **0 / 0** |
| **`booking_terms.fixedRateCents`** | **0** |
| **`rates`** (plain text) / `chef.private_chef_day_rate` / `creator.rate_per_post` | **0 / 0 / 0** |

Every talent has the **toggles** (they default on save); **not one** has entered an actual sellable price beyond a handful of influencer "stats." The systems are elaborate and unused. **Interpretation:** this isn't a data problem to preserve — it's a blank canvas. The redesign can be opinionated and cut over cleanly.

---

## 5. What works now (assets worth keeping)

- **`ServiceMenuItem` is a strong config model** — 9 price types, per-service currency, add-ons, tiers, bundles, visibility (public / agency_only / on_request), discipline scoping, instant-book flag, active/sort. i18n-ready. Normalizer is defensive (caps, dedup, "at most one instant-book").
- **The editor is genuinely capable** (`TalentServicesMenuCard.tsx`): add / edit / **reorder** (↑↓) / delete / activate / set visibility / add-ons / tiers / bundle picker / discipline scoping, optimistic save + rollback + explicit Saving/Saved/error, and a **live "Quoted N× · Booked N× · X% convert"** per-service analytic (from the `source_service_id` offer stamp). That analytic loop is a real differentiator.
- **Offer pre-fill works** (staff/talent): `line-service-picker` → offer line, stamped `source_service_id`. `pricing_unit` maps 1:1.
- **Instant-book is fully wired to Stripe** — `createInstantBooking` builds inquiry → offer → auto-accept → booking → commission snapshot → PaymentIntent (platform account, Connect transfers). It is the **only** public "click a price → pay" path today.
- **Commission/payment rail is solid and reusable** — `resolveBookingCommissions` computes the client surcharge and the `talent_net + workspace_fee + platform_fee === gross_charged` invariant; snapshotted at convert. Any future "buy a service/product" must reuse this.
- **Catalog dual-write** keeps the menu inside the unified field engine (one source of truth), gated + revalidated correctly.

---

## 6. What's broken or confusing (verified)

### Product / UX gaps
1. **No imagery anywhere.** `ServiceMenuItem` has no image field; the editor has no uploader; the public card (`ServiceMenuList.tsx`) is text + chips only. For a massage/chef/jewelry/beauty catalog this is the single biggest miss — it reads as a price list, not a storefront. (Repo's own bar, `feedback_prototype_imagery.md`: "never placeholder boxes / editorial portraits.")
2. **Public service cards are not actionable.** `ServiceMenuList.tsx` has no `onClick`/button/href. `InquiryIntent` (`inquiry-intent.ts`) has **no** `service_id`/`package` field; `submitInquiry` never receives one; the guest-chat bridge (`unified-inquiry-bridge.ts`) has no service chip. A client cannot select "Half-day shoot — $800" into an inquiry or chat. The coordinator must **manually re-pick** it in the admin composer. **This is the biggest functional gap.**
3. **Four disconnected "price" places** (per-type Rates, Package bundles, Fixed rate, Services menu, + read-only teasers) with no single "this is where you set pricing." High cognitive load for a non-technical talent.
4. **Public duplication** — `ServicesBlock` ("Services", text teasers + "Starting from") renders immediately above `ServiceMenuBlock` ("Services & pricing", cards). A talent with both shows two stacked service sections; no de-dup.
5. **Editor is dense and off-premium** — cramped inline-styled rows, a `≡` glyph, green accent (`#093328`); not aligned to the "New Inquiry premium" reference the team uses for talent-facing editors (`feedback_talent_editor_premium_reference.md`).

### Data-loss / correctness bugs
6. **`conditions` silently dropped on save** (both `ProfileRate` and `PackageRate`). Editors write it (`profile-editors-core.tsx:570`, `profile-extras-editors.tsx:557`) but the persist maps (`TalentProfileShellDrawer.tsx:1084`, `:1086`) omit it and the wire types don't include it → a talent's "min 4 hours / + tax" rider vanishes on reload.
7. **Legacy import ignores the primary legacy data.** `importLegacyServicesMenu` → `readLegacyRateSources` reads only `package_teasers` + `booking_terms.fixedRateCents`; it **never reads `rates.cards` or `commercial.packageRates`**. A talent who filled the "Rates" accordion and clicks "Import my existing packages & rate" imports nothing from it → "why is my menu empty?"
8. **`commercial.rateTiers` is orphaned** — loaded and saved but has **no editor UI** anywhere. Dead round-trip.
9. **`package_teasers` / `booking_note` / `starting_from` / `service_category_slug` have no editor** — public layouts render them, nothing in-product writes them (DB-seeded only).
10. **Onboarding hardcodes `typeId: "default"`** (`onboarding-steps.tsx:488`), which matches no taxonomy child → an orphan starting-rate row the full RatesEditor can't reconcile.
11. **Self-mode taxonomy relationship-type mismatch** — `self-profile-editor-data.ts:25-26` checks `"primary"`/`"secondary"` but the DB stores `"primary_role"`/`"secondary_role"` (admin path checks the right values). Likely returns empty talent-type slugs in talent-self load, so `RatesEditor` shows "Pick a Talent Type in Services first" even when types exist.
12. **Free-plan leak (Light layout only)** — `startingFrom` + `bookingNote` render un-gated in `_light` while services/packages are hidden for `talent_basic`; the other three layouts fold them into the plan guard.

### Plan gating (by design, but worth a decision)
- All pricing is **talent-subscription-gated**: `isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic"` → free talents render **no** services menu / packages. Only `talent_pro` / `talent_portfolio` see pricing.

---

## 7. Current limitations for an ecommerce / service catalog

| Capability an ecommerce catalog needs | Today |
|---|---|
| Multiple service items | ✅ `services_menu` supports up to 60 |
| Packages / bundles | ✅ `flat_package` + `childServiceIds` |
| Variations / tiers | ✅ `tiers[]` (label + price only — no per-tier image/duration/stock) |
| Add-ons | ✅ `addOns[]` |
| Price types | ✅ 9 units incl. per-person / per-event / flat / custom-quote |
| Currency | ✅ per-service |
| "Contact for price" | ✅ `custom` + `on_request` |
| **Images / gallery / before-after** | ❌ none |
| **Real duration** (90-min massage) | ❌ only billing unit |
| **Category / collection** | ❌ only discipline taxonomy |
| **Featured item** | ❌ (only the single instant-book flag) |
| **Draft vs published** | ⚠️ only `isActive` + `visibility` |
| **Physical products** | ❌ no product concept |
| **Inventory / stock / limited qty** | ❌ none |
| **Client selects item → inquiry/booking** | ❌ display-only |
| **Direct checkout for a fixed-price item** | ❌ only the single instant-book service |
| **Admin approval / moderation** | ⚠️ `agency_only` visibility, no draft/approval workflow |
| **Analytics** | ✅ per-service quoted/booked/convert |

---

## 8. Recommended product direction

**Consolidate the four systems into ONE talent "Storefront" — a single catalog of Offerings that a client can browse, select, and act on — and evolve `ServiceMenuItem` into an `Offering` that spans services, packages, and products.**

Design principles:
- **One place to set pricing.** Retire the "Rates" accordion, the standalone "Fixed rate," and the editorial teaser cluster into the single Offerings surface. Fold their (near-empty) data in; delete the dead ones.
- **Image-first.** Every offering can carry a hero image + gallery (reuse `media_assets`). This is what makes it feel premium and what every visual talent type (chef, jewelry, beauty, model) needs.
- **Actionable, not just informational.** A client can select an offering and carry it into an inquiry / chat / offer, and — where the price is fixed and the plan allows — book or buy it directly.
- **One model, many presentations.** A `kind` discriminator (`service` | `package` | `product`) drives whether the public surface renders a spa-style service menu, package cards, or a product grid — from the same data.
- **Never bypass the money rail.** Any "buy/book" runs through `resolveBookingCommissions` (client surcharge, seller-of-record, snapshot) — never the raw `amountCents`.

Naming: talent-facing label **"Services & Products"** (or "Your Storefront"). Avoid "cart/buyer" language on the talent side per platform copy rules; client-side "Add to inquiry" / "Request" / "Book" / "Buy."

---

## 9. Recommended data model

Because adoption is **zero**, there is no reason to keep stretching the jsonb blob toward products/inventory/per-variant imagery (which it models poorly). Promote to a **dedicated, queryable entity** and reuse the existing media + offer + commission rails.

### Target: `talent_offerings` (+ children)

```sql
-- One row per sellable/displayable offering. kind and price_type are DECOUPLED
-- (a package CAN be quote-on-request; a product CAN be 'from $X') — the current
-- model wrongly couples them (flat_package demands a total, custom demands null).
create table talent_offerings (
  id                uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references talent_profiles(id) on delete cascade,
  tenant_id         uuid,                       -- roster tenant scope (nullable = independent)
  kind              text not null,              -- 'service' | 'package' | 'product'
  title             text not null,
  description       text,
  category          text,                       -- merchandising section ("Bridal","Bodywork","Retail")
  price_type        text not null,              -- 'fixed'|'hour'|'day'|'half_day'|'week'|'event'
                                                --  |'per_person'|'per_unit'|'contact'|'custom'
  price_display     text not null default 'exact', -- 'exact'|'from'(starting-at)|'range'|'quote'
  amount_cents      bigint,                     -- base/'from' price; null for contact/custom
  amount_max_cents  bigint,                     -- optional upper bound for 'range'
  compare_at_cents  bigint,                     -- MSRP/'was' for sale display (products)
  currency          text not null default 'USD',
  duration_minutes  int,                        -- real service duration, DISTINCT from the price unit
  min_quantity      int,                        -- guest floor / min order / min-to-run
  max_quantity      int,                        -- capacity / seat cap / party max
  inventory_qty     int,                        -- null = unlimited (service/digital); int = stock
  fulfillment_type  text,                       -- 'appointment'|'in_stock'|'made_to_order'|'digital'|'rental'
  lead_time_days    int,                        -- made-to-order / catering lead time
  deposit_pct       int,                        -- per-offering deposit-to-hold (else booking_terms)
  requires_consultation boolean not null default false,
  prerequisite_offering_id uuid references talent_offerings(id), -- e.g. lash fill needs a prior set
  is_featured       boolean not null default false,
  status            text not null default 'draft',    -- 'draft'|'published'|'archived'
  visibility        text not null default 'public',   -- 'public'|'agency_only'|'on_request'
  moderation_state  text not null default 'approved', -- 'pending'|'approved'|'rejected'
  instant_bookable  boolean not null default false,
  sort_order        int not null default 0,
  -- Pressure-release valve for the long tail so we don't add a column per niche:
  -- compliance/safety (permits, insurance, clearance), qualifications (TIPS/RBS),
  -- per-order personalization SPECS (engraving/size/glaze inputs), deliverable
  -- specs (file format, revision rounds), structured quote variables (usage
  -- territory/term). Rendered generically; validated per known key.
  attributes        jsonb not null default '{}',
  title_i18n        jsonb, description_i18n jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Variants/tiers: each a real priced option, with its OWN image + stock.
create table talent_offering_variants (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references talent_offerings(id) on delete cascade,
  label text not null,                 -- "30 min" / "1 hour" / "Size M"
  amount_cents bigint, duration_minutes int, inventory_qty int,
  media_asset_id uuid references media_assets(id),
  sort_order int not null default 0
);

-- Add-ons (upsells) attached to an offering.
create table talent_offering_addons (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references talent_offerings(id) on delete cascade,
  label text not null, price_type text not null, amount_cents bigint,
  sort_order int not null default 0
);

-- Gallery: reuse media_assets via a join (hero = lowest sort_order).
create table talent_offering_media (
  offering_id uuid not null references talent_offerings(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  sort_order int not null default 0,
  primary key (offering_id, media_asset_id)
);

-- Bundle contents (package -> included offerings), replacing childServiceIds.
create table talent_offering_bundle_items (
  package_offering_id uuid not null references talent_offerings(id) on delete cascade,
  included_offering_id uuid not null references talent_offerings(id) on delete cascade,
  primary key (package_offering_id, included_offering_id)
);
```

Notes:
- **RLS mirrors the existing pattern** (owner `user_id` or roster staff; public read on `status='published' AND visibility='public' AND moderation_state='approved'`).
- **`inquiry_offer_line_items.source_service_id`** (already present) is repointed to `talent_offerings.id` — the audit stamp and the per-offering analytics keep working with no schema change.
- **`media_assets` is reused wholesale** — no new image storage, and watermark/approval/visibility already exist.
- **Legacy fold-in migration** is trivial given ~0 data: map any `services_menu` item → an offering (identity for shared fields); map the 1 teaser talent's `package_teasers` → `kind='package'` offerings; drop the dead blobs. This is a ~one-screen migration.

**Alternative (lighter, faster) — evolve the blob first:** add `images[]`, `durationMinutes`, `category`, `isFeatured`, `kind`, `inventoryQty`, and `status:'draft'|'published'` to `ServiceMenuItem`, keep the jsonb. Ships imagery + actionability in days, but can't cleanly do product inventory decrement, per-variant images, moderation, or SQL reporting. **Recommendation:** use the blob path only as a Phase-1 accelerator for imagery + actionability if speed matters, then land the table in Phase 2. If we're willing to spend one extra sprint, **go straight to the table** — zero data means the usual "migrate first" cost is absent.

### 9.1 What the 11-type deep-dive adds (see Appendix B)

Designing real offerings for all 11 talent types surfaced a consistent set of requirements a naive "images + kind + inventory" scope would miss. Ranked by how many of the 11 types need each capability:

| Capability | Types needing it | Why the current model fails |
|---|---|---|
| **Per-offering image / gallery (+ before/after)** | 11 / 11 | `media_assets` is profile-scoped, never item-scoped; no link exists |
| **`kind=product` + inventory/stock** | 11 / 11 | every type sells retail/merch/rental/digital; products masquerade as `flat_package` |
| **`duration` distinct from the price unit** | ~10 / 11 | a 45-min fade and a 4-hr balayage both read "per session" |
| **Rich variants** (per-variant price + image + stock; multi-axis SKU) | ~10 / 11 | `tiers` are `{label, amount}` only |
| **"Starting at" / from-price + range** | ~7 / 11 | `amount_cents` is exact; `custom` nulls it — no anchor between |
| **Featured + draft/moderation state** | ~7 / 11 | only `isActive` + a 3-value visibility |
| **Mixed / compound pricing in one offering** | ~5 / 11 | one `pricingType` per item (bride flat + party per-person; food per-person + staff per-hour + rentals flat) |
| **Min/max quantity, capacity, minimum spend** | ~5 / 11 | no bounds → can't enforce guest floors, seat caps, min hours |
| **Availability / calendar** (appointments + rental double-booking) | ~5 / 11 | the rail is event/day-rate shaped, not slot-shaped |
| **Decouple `kind` from `price_type`** (quote-priced packages) | conceptual, all | `flat_package` demands a total; `custom` demands null |
| **Structured custom-quote variables** | ~4 / 11 | usage territory/term, catering lead/range live in free-text |
| **Digital deliverables + digital-vs-physical inventory** | ~3 / 11 | no file-delivery/revision spec; one stock field can't model both poles |
| **Deposits / retainers; deposit-credited-to-purchase** | ~3 / 11 | one flat amount, no split, no credit |
| **Fulfillment / shipping + compare-at (MSRP)** | ~3 / 11 | physical goods have no landed price |
| **Session credits / packages-of-sessions** | ~3 / 11 | `flat_package` bundles once; no redeemable balance/expiry |
| **Per-order personalization capture** | ~3 / 11 | the offer line has no structured custom-input spec |
| **Service dependency / prerequisite** | ~2 / 11 | `childServiceIds` bundles siblings; no "requires prior" |
| **Compliance / qualification metadata** | ~2 / 11 | permits/insurance/certs stuck in free-text |

The schema above absorbs most of this through the relational core plus the `attributes jsonb` valve (compliance, personalization specs, deliverable specs, quote variables). Two structural consequences deserve a call-out:
- **The offer-rail assumption breaks for products.** Services "pre-fill an offer line, never charge"; a ready-made product seller expects **add-to-cart → immediate checkout with live stock decrement**. Direct product checkout (Phase 3) must still run through `resolveBookingCommissions`, but it **bypasses the offer-approval handshake** — a genuinely new flow, not a reuse.
- **Appointment-type talent (massage, hair, lash) and rentals need an availability/calendar layer** the platform doesn't have. That is a distinct, larger workstream — flag it Phase 3+, and keep v1 "request → confirm" rather than real-time slot booking.

The `talent_offering_variants` table should also carry `sku`, `compare_at_cents`, and an `option_axis` label so a real product variant matrix (metal × length × font; scent; size × colorway) is expressible, not just single-axis tiers.

---

## 10. Recommended frontend UX (talent editor)

One surface, **"Services & Products,"** rebuilt to the "New Inquiry premium" bar (cool tokens, card-on-faint-cool ground, click-to-open secondary fields):

- **Kind switch** at add-time: *Service* · *Package* · *Product* (changes which fields show — duration for services, inventory for products, contents for packages).
- **Per offering:** title, description, **image upload + gallery** (drag-reorder, reuse the talent media uploader + `media_assets`), price + **price type** (fixed / hourly / half-day / day / per-person / per-event / starting-at / **contact for price** / **custom quote**), currency, **duration** (services), **category/collection**, **variants** (each with own price + optional image + optional stock), **add-ons**, **featured** toggle, **active/draft** toggle, **visibility**.
- **List controls:** reorder, **duplicate**, delete, feature, filter by category/kind. Keep the live "Quoted / Booked / convert%" analytic per offering.
- **Validation:** price required unless `contact`/`custom`; currency required; duration/inventory numeric ≥ 0; image `alt` prompt; a featured offering must be published; instant-bookable must be fixed-price + active.
- **Empty state:** kind-aware examples ("Add a 60-min massage," "Add a private-dinner package," "List a ready-made piece").
- **Migration nicety:** a real "Import from your old rates" that reads **all four** legacy sources (fixing bug #7).

---

## 11. Recommended public profile display

- **One unified section** ("Services," "Menu," or "Shop" depending on kind mix) — **retire the duplicate** `ServicesBlock`/`ServiceMenuBlock` split.
- **Image-forward, kind-aware rendering from one dataset:**
  - *Services* → spa/menu-style rows **with a thumbnail**, duration, price, "Book"/"Request."
  - *Packages* → richer cards with hero image, what's-included, price, "Request this package."
  - *Products* → a **product grid** (image, title, price, stock badge, "Buy"/"Request").
- **Every card is actionable** (see §12). Featured offerings surface first. **Category filter** by extending the existing `ServiceMenuFilter` island.
- **Mobile:** responsive grid (1-col mobile → 2–3-col desktop), image-led, price and CTA always visible. Fix the current single-column, image-less list.
- **Gallery / before-after:** tap a card → lightbox gallery (reuse the profile lightbox pattern).
- **Premium finish:** real imagery, generous spacing, `--plt` tokens; no placeholder boxes.

---

## 12. Recommended inquiry / booking / payment integration

The offer + payment + commission machinery already exists; the missing piece is the **client-side selection → inquiry attachment**. Add it end-to-end:

1. **Carry the selection through the funnel.** Add `offering` (`{ offeringId, variantId?, addonIds?, qty? }`) to `InquiryIntent`, thread it through `submitInquiry`, and add an "offering" chip to the guest-chat `unified-inquiry-bridge`. Persist it on the inquiry so the thread shows "Interested in: *Private dinner — €1,200*."
2. **CTA behavior by price type + plan:**
   - **Fixed price + instant-bookable + plan on** → **"Book now — $X"** (generalize `createInstantBooking` to book the **chosen** offering, not only the single `isInstantBook` item).
   - **Fixed price** → **"Request to book"** → inquiry pre-carries the offering → coordinator/talent **one-click** converts to a pre-filled offer (**including add-ons/tiers**, fixing the picker's current flattening).
   - **Contact / custom** → **"Request a quote"** → inquiry carries the offering as context.
   - **Product (Phase 3)** → **"Buy"** → direct Payment Element checkout **through `resolveBookingCommissions`**, decrement `inventory_qty` on `payment_intent.succeeded` (never on add-to-cart); or "Request" when out of stock / made-to-order.
3. **Fix the offer pre-fill** to carry `addOns` / `tiers` / bundle children onto the offer line(s) (today `machinery-11` keeps only name + one price).
4. **Money invariants:** always run the commission resolver — the client pays `gross_charged = subtotal + client surcharge + workspace base-reservation fee` (verified in `commission.ts`), never the raw `amount_cents`. Respect seller-of-record (`workspace|talent`) and the frozen snapshot. Single-currency per inquiry/checkout (or per-line) to avoid mixed-currency carts.

Net new code is concentrated in: `ServiceMenuList` CTA, `InquiryIntent` + `submitInquiry` + chat bridge, a generalized instant-book, and the offer-line pre-fill. Everything downstream (offer → booking → transaction → PaymentIntent → transfers) is unchanged.

---

## 13. Risks & edge cases

- **Commission bypass** — the #1 money risk: charging `amount_cents` directly skips the platform surcharge. Gate all checkout through the resolver; add a test asserting `gross_charged > subtotal`.
- **Multi-currency** — per-service currency is already allowed; a mixed-currency selection can't be one charge. Constrain to one currency per inquiry/checkout.
- **Inventory races** (products) — decrement on paid webhook inside the transaction, not on selection; guard oversells; show "sold out."
- **Plan gating decision** — today free talents show no pricing at all. Decide: are **products/services** a Pro-only feature, or should free talents get a basic storefront (with the platform taking rate on sales)? This is a monetization choice, not a technical one.
- **Seller-of-record & agency exclusivity** — respect the commission model's `workspace|talent` and the roster/exclusivity gates; independent vs rostered talent route money differently (already handled by the snapshot).
- **Moderation** — agencies may need to approve talent offerings/prices; `moderation_state` + `agency_only` visibility cover it, but define the workflow.
- **Deleting a referenced offering** — offers stamped with `source_service_id` must not break; **soft-archive** (`status='archived'`) rather than hard-delete.
- **Image rights / watermarking** — reuse `media_assets` watermark + `approval_state`; product photos may need different rules than portfolio shots.
- **Physical-goods legalities** — shipping, returns, tax/VAT for products are real but **out of scope for v1**; keep products "local pickup / arrange in chat" until fulfillment is designed.
- **i18n** — keep `title_i18n`/`description_i18n` (the menu already does this); don't regress the ES profile.
- **Directory/search** — offerings could power "starting from" facets later; not v1, but model `amount_cents` so it's queryable.

---

## 14. Step-by-step implementation plan (phased)

**Phase 0 — Decisions (this doc).** Confirm: table vs blob-first; products-with-inventory in scope for v1 or later; plan-gating/monetization; consolidation (retire legacy systems). *(Blocked on your answers — see §16.)*

**Phase 1 — Make the existing menu premium & actionable (fast, visible).**
- Add images/gallery to the offering model (blob-accelerator or straight to `talent_offering_media`) + editor uploader + public thumbnails/lightbox.
- Add the client CTA + `InquiryIntent.offering` + `submitInquiry` + chat bridge (the missing link).
- Fix bugs #6 (conditions drop), #7 (import blind spot), #4/#12 (dedup + free-plan leak).
- Consolidate the public section to one.

**Phase 2 — Promote to `talent_offerings` + retire legacy.**
- Ship the tables + RLS; port editor + public render to `kind`-aware; add duration, category, featured, draft/moderation, variants-with-images.
- Repoint `source_service_id` → offerings; generalize instant-book to any chosen fixed-price offering; carry add-ons/tiers into offer lines.
- Fold in + delete the "Rates" accordion, standalone fixed-rate, and teaser cluster; migrate the ~0 legacy rows.

**Phase 3 — Products & direct checkout.**
- Product kind + inventory; direct Payment Element checkout via the commission rail; stock decrement on paid; sold-out/made-to-order states.
- Analytics dashboard (extend per-offering quoted/booked/convert with revenue).

**Rollout discipline** (per repo norms): branch off `main`; one migration timestamp per agent; `tsc --noEmit && npm run lint` gate; `npm run db:push` **before** merge (schema+code ship together); QA on a real host, not a raw `*.vercel.app`; `deploy:smoke` after.

---

## 15. QA checklist (for the future build)

**Editor (per talent type: massage, chef, model, musician, dancer, fire performer, barber/stylist, lash/makeup, jewelry, product seller, event provider)**
- [ ] Create each kind (service/package/product); title/description/price/currency persist and reload.
- [ ] Image upload + gallery reorder; hero renders; `alt` saved; watermark/approval respected.
- [ ] Price types incl. contact-for-price + custom-quote; amount hidden for those.
- [ ] Duration (service) and inventory (product) validate numeric ≥ 0.
- [ ] Variants each carry own price/image/stock; add-ons persist; package contents persist.
- [ ] Reorder / duplicate / delete / feature / activate / draft / visibility all round-trip (no silent field drop — regression-test the old `conditions` bug).
- [ ] Empty state + kind-aware examples; "import old rates" pulls **all** legacy sources.
- [ ] Optimistic save + rollback + Saving/Saved/error states.

**Public profile**
- [ ] Renders on all 4 layouts; one unified section (no duplicate "Services"/"Services & pricing").
- [ ] Images render; gallery lightbox works; featured first; category filter works.
- [ ] `on_request` → "On request"; `custom` → "Quote on request"; `agency_only` never leaks.
- [ ] Desktop 2–3 col, mobile 1 col image-led; CTA + price always visible.
- [ ] Plan gating behaves per the decision; no free-plan text leak.

**Inquiry / booking / payment**
- [ ] Client selects offering (+ variant/add-ons/qty) → carried into inquiry AND chat thread ("Interested in: …").
- [ ] "Request to book" → coordinator one-click offer pre-fill includes add-ons/tiers.
- [ ] "Book now" instant-books the **chosen** offering; charge = `gross_charged` (surcharge applied), not raw amount.
- [ ] Product "Buy" → checkout via commission rail; inventory decrements on paid webhook; oversell blocked; sold-out state.
- [ ] Multi-currency selection constrained; deposit-aware where configured.
- [ ] Archived offering doesn't break historical offers referencing it.

**Data / money integrity**
- [ ] `talent_net + workspace_fee + platform_fee === gross_charged` holds on every path.
- [ ] `source_service_id` analytics (quoted/booked/convert) still populate.
- [ ] RLS: public sees only published+public+approved; staff/owner edit; cross-tenant isolation holds.

---

## 16. Decisions needed from you (before Phase 1)

1. **Target model:** go straight to the `talent_offerings` **table** (cleanest, zero-migration cost), or **blob-first** for a faster imagery/actionability win then migrate?
2. **Products in v1?** Include physical products **with inventory + direct checkout** now, or ship services/packages first and add products in Phase 3?
3. **Monetization / plan gating:** keep pricing **Pro/Portfolio-only**, or give **free** talents a basic storefront (platform takes rate on sales)?
4. **Consolidation:** confirm we may **retire** the "Rates" accordion, the standalone fixed-rate, and the editorial teaser cluster into the single Offerings surface (fold in the ~0 rows and delete the dead code).

---

*Prepared as an audit-only deliverable. No code was changed. Recommended next step: your answers to §16, then Phase 1.*

---

## Appendix A — Independent verification of load-bearing findings

Every claim this audit acts on was re-checked by a separate adversarial pass instructed to *refute* it. **All 9 came back CONFIRMED** (2 minor corrections, neither changes a conclusion).

| # | Claim | Verdict | Anchor evidence |
|---|-------|---------|-----------------|
| 1 | Rate/package **`conditions` rider silently dropped on save** (both admin + talent-self) | ✅ CONFIRMED | editors write it (`profile-editors-core.tsx:570`, `profile-extras-editors.tsx:557`) but persist maps omit it (`TalentProfileShellDrawer.tsx:1084,1086`); wire types lack it (`admin-talent-profile-sections.ts:197-198`) |
| 2 | **"Import old rates" ignores `rates.cards` + `commercial.packageRates`** (reads only teasers + fixed rate) | ✅ CONFIRMED | `services-menu-actions.ts:154-163` selects only `package_teasers, booking_terms`; `LegacyRateSources` has no rate-card slot (`services-menu-legacy.ts:20-25`) |
| 3 | **Self-mode taxonomy relationship mismatch** (`primary`/`secondary` vs DB `primary_role`/`secondary_role`) → RatesEditor shows "Pick a Talent Type" even when types exist | ✅ CONFIRMED | `self-profile-editor-data.ts:25-26` vs `admin-talent-profile-sections.ts:1187-1188`; CHECK constraint permits only role-suffixed values (`20260907220000_aspiration_and_rls_v1.sql:37-38`) |
| 4 | **Public service cards are non-actionable + `InquiryIntent` has no service field** | ✅ CONFIRMED | `ServiceMenuList.tsx:52-171` no onClick/button/href; `inquiry-intent.ts:165-190` no service/offering/package; chat bridge `unified-inquiry-bridge.ts:30-77` has no service chip |
| 5 | **No imagery anywhere** (type, editor, public card) | ✅ CONFIRMED | grep `image\|img\|photo\|gallery\|media\|upload` across the 5 files → 0 matches |
| 6 | **Instant-book charges `gross_charged`, not raw `amountCents`** (raw would skip surcharge) | ✅ CONFIRMED | `instant-book-engine.ts:373-374,403,437`; `commission.ts:336`. *Correction:* `gross_charged = subtotal + client_surcharge + base_reservation_fee` (base fee is a third component) |
| 7 | **Public duplication** (`ServicesBlock` above `ServiceMenuBlock`) + **free-plan text leak on Light only** | ✅ CONFIRMED | `LightProfileLayout.tsx:435,447` consecutive siblings; `:438-439` pass `startingFrom`/`bookingNote` ungated; atelier/lumen/noir gate them behind `!isFreePlan` |
| 8 | **`commercial.rateTiers` orphaned** (loaded+saved, no editor UI) | ✅ CONFIRMED | load/save at `TalentProfileShellDrawer.tsx:770,1085`; repo-wide grep finds no `RateTiersEditor`/`setRateTiers` |
| 9 | **`package_teasers`/`booking_note`/`starting_from` have no editor** (DB-seeded, render-only) | ✅ CONFIRMED | selected+rendered in `page.tsx`+layouts; zero insert/update/upsert touches these columns |

---

## Appendix B — Talent-Type Flexibility deep-dive (deliverable #6)

Real offerings were designed for each of the 11 talent types to pressure-test the model. The consolidated, prevalence-ranked gap taxonomy is in §9.1; below is the per-type evidence (condensed).

| Talent type | Representative offerings (kind) | Headline gap this type exposes |
|---|---|---|
| **Massage therapist** | 60-min deep tissue (service), prenatal 90-min (service), 5-session recovery (package), couples (service, per-person), CBD balm (product) | **Appointment/slot + real duration**; session-credit packages; retail product + intake/waiver |
| **Hair stylist / barber** | Cut & blow-dry ("from $85"), full highlights (custom + before/after), skin fade (fixed, instant-book), bridal trial+day-of (package, on-location), Olaplex retail (product) | **"Starting at" pricing** + before/after gallery; on-location/travel; multi-visit packages; retail |
| **Lash / makeup artist** | Classic full set (service), lash fill (tiered by cadence), bridal on-location (bride flat **+** party per-person), makeup lesson (hourly), aftercare kit (product) | **Mixed pricing in one item**; service dependency (fill needs prior set); patch-test intake; digital deliverable + product |
| **Private chef / caterer** | Chef's-table dinner (per-person, guest floor), wedding catering (per-person tiers + compound add-ons), meal-prep sub (recurring), pastry box (product, stock), cooking class (per-person, capacity) | **Min/capacity + compound pricing**; product/inventory; recurring cadence; lead-time/service-area |
| **Event provider (AV/decor/staffing/rentals)** | Full-room AV (package of SKUs), staffing (hourly × headcount, min hours), floral (custom, from-price), chair/lounge rental (product, dated stock), photo booth (duration tiers) | **Rental inventory + date-availability**; quantity/headcount on a rate; compound pricing; featured/draft |
| **Fashion / commercial model** | Half-day (up to 4h), full-day editorial, e-comm per-look, **usage/licensing buyout** (structured custom), casting (per-session, instant-book) | **Duration-vs-unit + per-unit ("per look")**; structured buyout variables; per-service gallery; rider that attaches to a shoot |
| **Singer / musician** | Live set (event, 2×45min), wedding ceremony+cocktail (package), studio vocals (per-song), jingle commission (custom), signed vinyl/merch (product) | **Product kind + variant SKU/stock**; per-song unit; digital deliverables; deposit/retainer |
| **Dancer / performer** | Event set (event, multi-spot), troupe (per-person, min size), coaching (per-session, packs), video tutorial (**digital product**), corporate flash-mob (**custom-priced package**) | **per-person min/max**; session-packs; digital (unlimited) product; kind/price_type decoupling |
| **Fire performer** | Fire show (event, safety metadata), LED/glow (venue-variant), duo/group (per-person), custom festival production (custom package), poi workshop (per-person, seat cap) | **Compliance/safety metadata**; performance-mode variant; capacity ceiling; add-on with its own risk rider; pre-quote site-assessment gate |
| **Custom jewelry creator** | Engagement-ring commission (custom, "from $X"), gold nameplate (product, metal×length×font SKUs), stacking set (per-unit, buyer quantity), design consult (hourly, deposit-credited), restring/repair ("from $35" after inspection) | **Per-item gallery** + variant matrix; from-price/hybrid; personalization capture; lead-time; deposit-credited-to-purchase |
| **Ready-made product seller** | Soy candle (product, per-scent stock), limited-edition print (edition-of-50 scarcity), tote (colorway SKUs), skincare set (bundle, combined stock), made-to-order mug (pre-order lead-time) | **Full ecommerce**: inventory/availability states, per-variant image+stock, shipping/fulfillment, compare-at, and **add-to-cart→checkout** (the offer rail can't transact this) |

**The decisive cross-cutting conclusion:** the two universal, 11/11 gaps are **per-offering imagery** and a **real product kind with inventory** — no talent type escapes either. Combined with duration-vs-unit (~10/11) and rich variants (~10/11), this is why the jsonb `ServiceMenuItem` blob is the wrong long-term home: these are relational, queryable, per-child concerns. Given **zero production adoption**, the `talent_offerings` table (§9) is the low-risk right answer, and the `attributes jsonb` valve keeps the niche long-tail (compliance, personalization, deliverables, quote variables) out of the relational core.
