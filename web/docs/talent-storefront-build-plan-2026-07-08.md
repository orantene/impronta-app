# Talent Storefront — Product + Architecture Build Plan

**Date:** 2026-07-08
**Builds on:** [`talent-rate-pricing-services-audit-2026-07-08.md`](./talent-rate-pricing-services-audit-2026-07-08.md) (the audit that established: 4 overlapping dormant price systems, **0/121 talents have any real pricing**, `services_menu` is the foundation, no imagery, non-actionable cards).
**Method:** grounded on the live payment rail (Supabase `pluhdapdnuiulvxmyspd`) + a 6-perspective architecture panel (two independent order-flow architects, a talent-UX designer, an adversarial simplicity critic, a marketplace-ops architect, a public-merchandising designer).
**Status:** plan only — no code changed. Decisive recommendations, not options.

---

## TL;DR — the recommendation in one box

> **Build ONE thing the talent calls a "listing," stored in ONE new table `talent_offerings`, sold through the money rail that ALREADY exists. Do not build a second checkout, a second order system, or a Shopify admin.**
>
> - **Talent sees 6 fields.** Title · Photo · Price + mode (Fixed / From / Contact for price) · optional unit (each / hour / day / person) · Description · Show-on-profile. One noun — *"listing"* — whether it's a 60-min massage, a wedding package, or a jar of balm. Everything else in the model ships **nullable and hidden**.
> - **Reuse the rail 100%.** A selected listing pre-fills the existing `inquiry → inquiry_offers → agency_bookings → booking_transactions → Stripe/Connect` pipeline. "Buy/Book now" is a generalization of the already-live `createInstantBooking`. Products ride `agency_bookings`, not a new `orders` table.
> - **The whole net-new backend is tiny:** one config table (`talent_offerings`) + an image join, one `inquiry_source_channel` enum value, and (only when products land) one booking discriminator column + one fulfillment sidecar + a stock counter. **Zero money-math is rewritten** — that's the entire safety argument.
> - **Zero migration risk.** 0 of 121 talents have any pricing data, so we design the ideal model and cut over cleanly; the current `services_menu` render stays as a no-regression fallback until `talent_offerings` lights up.

The single most important design principle, from the census: **a 15-field model already shipped and got 0/121 adoption. The answer is fewer visible fields, not more.** Simplicity here is a UI/scope decision — the money plumbing is already headless, so nothing below weakens it; it just refuses to expose it.

---

## 1. Product Direction

**What it becomes:** a **lightweight storefront inside every talent profile** — one place where a talent presents and sells services, packages, prices, and (later) physical products, and where a client can act on any of them without leaving the profile's world.

**Naming (DECIDED 2026-07-08, after owner review):**
- **Feature / dashboard tab (talent-facing): "Services"** (ES: **"Servicios"**), route **`/talent/services`**, a new `TalentPage` positioned after Profile. ~~"Storefront"~~ was rejected by the owner — correctly: 10/11 talent types sell time and skill, not stock, and "storefront" skews retail (a model selling day rates has no store). "Storefront" survives only as this document's internal codename. Rejected alternatives: "Menu" (weak for models/performers), "Rates"/"Pricing" (reads as a numbers form; "Rates" is the legacy surface being retired), "Offers/Offerings" (collides with the inquiry-offer entity; ES "Ofertas" means discounts).
- **Per-profession vernacular lives in the copy, not the tab:** the empty state speaks each dialect ("your rate card" for a model, "your service menu" for a barber). When products land in Phase 3, they appear as a small "Shop" group *inside* the same Services page — one door stays one door; revisit the label then with real data.
- **Naming collision to clear in Phase 1:** the profile editor already has a section card labeled "Services" meaning *talent type & specialties* (`profile-sections-1.tsx:104`). Relabel it **"Talent type & specialties"** so "Services" is unambiguous.
- **The item, in the talent's words: a "service"** in default copy ("Add a service"); "listing" remains the internal unified mental model. Never "offering," never "SKU."
- **Internal / DB entity: `talent_offerings`** ("offering" is the correct umbrella term in code — it spans service, package, product).
- **Public section heading: adaptive by content** — "Services & Pricing" when there are no products, "Packages" / "Shop" / "Book & Buy" when products are present. The talent never picks this; the presenter does.

**How it stays simple yet powerful:** one primitive (a listing), one form, smart defaults, and progressive disclosure. The *platform's* power (9 pricing units, variants, inventory, fulfillment, moderation, commission) lives in the schema and the rail, **behind** the form — the talent only ever fills in name, photo, price, description. Power for the platform ≠ fields for the talent.

**MVP vs later (the discipline):**
- **MVP:** services + packages presented as image-backed "listings" with a price, actionable CTAs that carry the listing into an inquiry, and "Book now" for fixed-price listings via the existing instant-book. **No product checkout, no inventory, no variants/add-ons UI, no moderation badges.**
- **Later:** direct product purchase + inventory + fulfillment (Phase 3), variants/add-ons/bundles, "from/range" pricing, analytics & upsells (Phase 4).

---

## 2. Talent Management Flow

**Where:** a new top-level dashboard tab **"Services"** (`/talent/services`, a new `TalentPage` in the talent shell — today's nav is Today · Messages · Profile · Calendar · Money · Payouts · Public page · Settings; Services slots right after Profile: *who I am → what I sell → what happens when it's booked*). It is the *only* place in the product that talks about pricing (the legacy "Rates" accordion, the standalone "Fixed rate," the `TalentServicesMenuCard` buried in Settings, and the editorial teaser fields are all retired into it).

**The entry / list view:** a calm list of rows — `thumbnail · name · one status pill · one price · ⋯` — and a single primary **"Add listing"** button. It reads like a menu you'd hand a client, not a database table. Drag-handle reorders; the `⋯` kebab holds Hide / Feature / Duplicate / Edit / Delete.

**Empty state (first run):** one editorial figure (never a placeholder box, per house rule), one promise ("Show clients what you offer and let them book it"), one button, and **profession-aware starter chips** derived from the talent's taxonomy already on file — "60-min massage" for a masseuse, "Haircut" for a barber, "Private dinner" for a chef. Tapping a chip pre-fills name + price type.

**The Add flow (the core — must be ~20 seconds):** the first question is the human one — **"What do you offer?"** — *not* "service vs package vs product." Only four controls on the first screen, then Save:

1. **Title** — "Skin fade", "60-min deep tissue", "Wedding package"
2. **Photo** (single, optional) — the one universal 11/11 ask; optional so display-only talents aren't blocked
3. **Price + price mode** — a 3-way segmented control: **Fixed** (a number) · **From** (a starting number) · **Contact for price** (no number)
4. **"Add details"** — one line that reveals the optional rest

**Everything else is behind "Add details"** (collapsed): description, an optional **unit** (each / per hour / per day / per person — four human words, defaulted to flat, *not* nine enum values), duration, and — only for talents who need them — the product/variant/add-on controls (deferred past MVP). `kind` is **inferred** (defaults `service`) and only editable here.

**Choosing the price shape without a scary dropdown:** the segmented **Fixed / From / Contact** control is the primary choice; the optional **unit** pill row (each / hour / day / person) shows only the 3–4 units that fit the talent's profession, with a "More…" sheet for the long tail. A **live plain-English sentence** confirms it ("You'll charge **$120 per session**"). Every pill maps 1:1 to the existing `inquiry_offer_line_items.pricing_unit` enum ("Per session" = `per_contact`, "Package price" = `flat_package`, "Contact for price" = `custom`) — so **no new money code, and the talent never sees an enum word.**

**Images:** reuse the existing `media_assets` pipeline (watermark / approval / `public_url` already exist). First image = cover, the rest = gallery (gallery is Phase 2 in the form; the storage supports it from day one). Every async state is visible: Uploading… → ✓ → thumbnail, with a persistent error tile on failure (house rule: no silent waits).

**Variations & add-ons:** collapsed to a single "+ Add a variation" / "Add-ons" line inside Add details — a first-timer never sees them. In MVP, the simplest path is the critic's mental model: **a variation is just another listing** ("2h massage", "4h massage" = two listings). Structured variants/add-ons arrive in Phase 3 when products need real SKUs.

**Lifecycle controls (all on the row):** drag to reorder (= public order), `⋯` kebab = Hide / **Feature** (one star, reuses `is_featured`) / Duplicate / Edit / Delete (with **Undo**). "Publish" is one honest **visible/hidden** toggle — never the words "draft/archived/pending." **Moderation is silent** (publish immediately, review async, pull down only on violation): a talent must never see their own "Skin fade — $40" sitting at "pending review."

**Why this is easy for a non-technical user:** one noun, one form, four first-screen fields, smart defaults from the profile, and progressive disclosure for the 1% who need more. It mirrors Linktree / a printed menu / Instagram — the mental model these talents already have — not a commerce admin.

---

## 3. Public Profile Design

**One dataset, a KIND-AWARE presenter — never three competing widgets.** A `<TalentStorefront>` section replaces the current `ServiceMenuBlock` slot and groups one normalized `talent_offerings` array by `kind` in a fixed, tasteful order (**service → package → product**), so mixed inventory always renders the same way regardless of per-item sort:

| kind | primitive | why | density cap before "View all" fold |
|---|---|---|---|
| service | **row list** (evolve `ServiceMenuList`) | a price list reads calm and scannable; image is an optional 56px thumb, not a hero | 6 |
| package | **editorial card, 2-up** | packages are the hero offer — deserve a portrait + "Includes" | 4 |
| product | **image grid, 2-up mobile / 3-up desktop** | physical goods need the photo to sell | 6 |

**Images/gallery:** real photos from `talent_offering_media → media_assets.public_url` — **never a placeholder box** (house rule). A service row with no image renders textless (no empty gray tile); a product/package with no image degrades to a row rather than shipping an empty card. Clicking a card image (not the CTA) opens the **existing `PortfolioGalleryLightbox`** seeded with that listing's images — reusing the built lightbox, keyboard nav, and watermark. Before/after is supported when a listing has both a `before` and `after` image (hair, lash, makeup), never fabricated.

**CTA copy matrix — chosen by *behavior*, not by kind** (the label must always match what tapping actually does):

| Behavior | Primary CTA | Price line | What happens |
|---|---|---|---|
| Fixed-price service (not instant) | **Book** | `$X / hour` | pre-fills an offer line → opens the chat thread |
| Instant-book service | **Book now · $X** | `$X` | existing instant-book path, charges on confirm |
| Package | **Request package** | `From $X` or `$X` | pre-fills offer (with bundle children) → chat |
| Per-person (catering/events) | **Get a quote** | `$X / person · min N` | chat, carries headcount |
| Custom / quote | **Ask for quote** | `Quote on request` | chat, no amount pre-filled |
| Contact-for-price | **Request** | `On request` | chat, price hidden |
| Product, in stock (Phase 3) | **Buy** | `$X` | direct checkout via the rail; qty stepper if allowed |
| Product, made-to-order / rental (Phase 3) | **Request** | `From $X · lead N days` | chat, carries lead time |

Copy is verb-led and honors the language rules: **never "buyer," "cart," or "pay to DM"**; the always-available secondary is **"Add to inquiry"** (not "Add to cart"). Full i18n via `title_i18n`/`description_i18n` + `pickLocale`.

**Mobile:** the storefront never precedes the portfolio band (imagery leads). Services = single-column rows, name+price on one baseline, tap-to-expand accordion (one-open) for description/CTA. Packages = 1-up stacked cards. Products = 2-up grid. Offering CTAs sit inline; the profile's existing sticky bottom Inquire bar stays the talent-level CTA — **no competing fixed bars**.

**How we avoid a messy ecommerce page (taste guardrails, baked into the presenter):**
- Merchandising chrome (a **featured** hero rail + **category tabs**) appears **only at ≥6 items AND ≥2 categories**. ≤3 items total = a clean list, no tabs, no featured, no sub-headings.
- One **"View all N services & pricing →"** fold per section, so mobile never sprawls.
- At most **one** featured listing (a signature offer). The store inherits the theme's `--plt`/`--pp` accent (Lumen/Atelier/Noir light-dark register) — no store-specific palette.
- **No ecommerce tells:** no star badges on tiles, no "N left" scarcity nags, no shipping/checkout copy on the profile. Money always resolves inside Messages / instant-book, never on the profile surface. Free plan or zero listings → the section renders `null`, exactly as today.

---

## 4. Booking / Inquiry / Checkout Flow  *(the core — think deeply)*

**One rule that drives everything:** a listing is *configuration*; its `price_type` + `price_display` + `instant_bookable` fields select which **preset over the one existing rail** fires. Two independent architects reached the same conclusion — **every behavior reuses `inquiry → inquiry_offers → inquiry_offer_line_items → agency_bookings → booking_transactions → Stripe/Connect`; nothing gets a parallel checkout.** `createInstantBooking` already proves the whole chain runs headlessly in one server call.

**What happens when a client clicks a listing (7 behaviors, one routing table):**

| # | Behavior | Client sees | Records + status | Who acts next | Charge moment |
|---|---|---|---|---|---|
| 1 | Service, request-to-book | "Request to book" | `inquiries=submitted` (carries the listing ref); no offer yet | coordinator/talent composes & sends an offer; client accepts | **after accept** (T1) |
| 2 | Service, fixed-price instant-book | "Book now — $X" | headless chain: `inquiries submitted→approved` → `offers draft→sent→accepted` → `agency_bookings confirmed` + snapshot → `booking_transactions draft→payment_requested` | system (auto) | **immediately** (T0) |
| 3 | Package, fixed | "Book package — $X" | same as #2 (instant) or #1 (request); expands to one flat line or N bundle lines | system/coordinator | T0 / T1 |
| 4 | Custom quote (price null) | "Ask for quote" (no number) | `inquiries=submitted→coordination`; negotiate in Messages; coordinator builds offer → `offer_pending` | coordinator + client negotiate | **after accept** (T1) |
| 5 | Contact-for-price | "Request" (number hidden) | same as #4 — pure lead; distinction is *display intent*, not rail behavior | coordinator responds | T1 or never |
| 6 | Product, fixed-price direct buy (Phase 3) | "Buy — $X", qty | same headless chain as #2 + a **stock reservation** first; `booking_sub_type='product'` | system for money; talent for fulfillment | **immediately** (T0), full |
| 7 | Per-person / per-unit | qty stepper, live total | rides whichever of #1/#2/#6 applies; quantity → the **existing** `inquiry_offer_line_items.units` field | per underlying mode | per underlying mode |

**When it goes to inquiry/chat vs checkout vs order vs booking:**
- **Inquiry/chat** — behaviors #1, #4, #5 (and #7 when the base is request-mode). The listing rides into the thread as a pinned "Requesting: *Bridal Trial · $150*" chip; a human then composes/confirms an offer.
- **Checkout** — only when a fixed price is known *and* the listing is instant-bookable (#2, #3-instant, #6). Checkout is the existing **Payment Element in the Messages Offer tab** (not a hosted Stripe Checkout), reached via the generalized `createInstantBooking`.
- **Order / booking** — the moment an offer is accepted (manually or auto), it converts to an **`agency_bookings`** row. A service booking and a product order are the *same* row type, distinguished by `booking_sub_type`. There is **no separate `orders` table.**

**Services that require approval first:** any listing with `price_display=quote`, `price_type=custom`, `requires_consultation`, or `visibility=on_request` is **server-gated to the inquiry-only path** — there is no code path that can charge it. A coordinator/talent composes the number, sends an offer, and only an accepted offer converts + charges.

**Fixed-price items bought directly:** reuse `createInstantBooking`, generalized from "resolve rate from `booking_terms.fixedRateCents`" to "resolve line items from the selected listing (+ variant/add-ons/quantity)." One offer line, `source_service_id → talent_offerings.id`, auto-accept, convert, snapshot, charge.

**How the selection passes into the thread / offer / admin / payment:** via primitives that **already exist** — no new column on `inquiries`, no join table:
- **Provenance** → `inquiries.source_context` jsonb: `{ "offering": { "offering_id", "variant_id?", "quantity?", "addon_ids?" } }` + a new `inquiry_source_channel = 'offering_request'`.
- **Chargeable truth** → `inquiry_offer_line_items`, with `source_service_id` (the existing audit stamp) repointed to `talent_offerings.id`. Add-ons/tiers/quantity map to line items directly (`units` already exists; each add-on is one more line).
- Admin/coordinator sees the stamped line in the offer composer; payment reads the snapshot, not the listing.

**Preventing wrong payments / wrong expectations (the failure modes to fear):**
1. **"Client thinks a custom item is fixed."** `price_display`/`amount_cents` are **load-bearing**: a `quote`/null listing is *uncharge-able* by a single server guard; the CTA renders "Ask for quote."
2. **Charging the raw price and skipping the surcharge.** Never pass `amount_cents` to Stripe. The contract is `amount_cents → offer line → resolveBookingCommissions → booking_commission_snapshot.gross_charged → that is what is charged`. Add a test asserting the charged amount always derives from a snapshot sum, never a listing field.
3. **Overselling stock** (products): an atomic conditional-decrement RPC (`WHERE inventory_qty >= qty` under row lock) reserves stock **before** the offer is built; failure aborts with "sold out" and creates no inquiry/offer/charge.
4. **Double-charge / partial-paid race:** inherited-fixed by riding the rail (the money-spine C1 race is already patched); a parallel order system would reintroduce it.
5. **Wrong-recipient payout:** existing payout-receiver resolution (talent vs workspace) is reused unchanged.
6. **False "instant" expectation:** `fulfillment_type` + `lead_time_days` gate the CTA — only `in_stock` shows "Buy now"; made-to-order routes to request even when priced.

---

## 5. Orders / Bookings / Fulfillment

**Where an order/booking lives:** in **`agency_bookings`** (the money-bearing table) — a bought product and a booked service are the same row, distinguished by a new **`booking_sub_type` (`service | product | package`)**. There is deliberately **no `orders` table**: reusing `agency_bookings` gives products the entire money spine (transactions, commission snapshot, Connect payout, refunds, disputes) for free.

**The unified status lifecycle is DERIVED, not a new master enum.** The label a human sees (`draft → requested → quote_sent → accepted → paid → booked → fulfilled → cancelled → refunded → disputed`) is computed from the five enums that already exist:

| Unified label | inquiries | inquiry_offers | agency_bookings.status | payment_status | booking_transactions |
|---|---|---|---|---|---|
| requested | submitted | — / draft | — | — | — |
| quote_sent | offer_pending | sent | — | — | — |
| accepted | approved | accepted | tentative | unpaid | draft |
| paid (deposit) | booked | accepted | confirmed | partial | paid (deposit) |
| paid (full) | booked | accepted | confirmed | paid | paid (full) |
| booked | converted | accepted | confirmed→in_progress | paid | paid → payout |
| **fulfilled** | converted | accepted | **completed** (+ fulfillment row) | paid | payout_sent |
| cancelled | closed_lost | superseded/expired | cancelled | cancelled/refunded | cancelled/refunded |
| refunded | closed_lost | accepted | cancelled/completed | **refunded** | linked **refunded** row |
| disputed | (unchanged) | (unchanged) | in_progress/completed | paid | **disputed** |

The **one genuinely new** thing is fulfillment for products: keep `agency_bookings.status='completed'` as the fulfilled state for both, and store shipping specifics in a small sidecar. (Optionally add a `booking_status='fulfilled'` value later for visual distinction — additive, zero rows today.)

**What each role sees/does (all from the derived label + existing permission gates):**
- **Talent:** one **Orders queue** with a single button — **"Mark completed"** (service) or **"Mark shipped"** + a tracking field (product). Never touches commission, Connect, refunds, or the composer. A massage therapist and a jeweler use the *same* one-button queue; the sidecar quietly branches appointment vs. shipment.
- **Admin / coordinator (seller-of-record, the order desk):** the existing Messages/inquiry workspace + a fulfillment column — triage, compose custom quotes, collect balance, coordinate fulfillment, issue refunds, handle disputes.
- **Client (buyer, one-way):** order-status cards — for a service, date + provider + review prompt; for a product, "Preparing → Shipped (carrier/tracking) → Delivered." Never sees commission or the talent's net.

**Custom quotes & negotiation** ride existing rails: client requests → coordinator/talent composes an offer pre-filled from the listing → sends → client accepts / asks / declines → coordinator **supersedes** (a new immutable offer row; prior → `superseded`) → loop until accepted or expired → convert + charge. Custom variables (metal/stone/size, headcount/menu) live in `talent_offerings.attributes` jsonb and surface as composer pre-fill hints, then land on the offer line `notes`.

**Refunds / cancellations / disputes** reuse the verified transaction machine: cancellation before payment releases stock and closes the inquiry; a refund inserts a **linked `refunded` transaction** (never an in-place flip) and records the Stripe refund id; deposit and balance are refundable independently; a dispute holds the payout and resolves to re-capture or refund. A payout already fired is reversed via the existing ledger/reversal path.

**Statuses we need:** exactly the ones above — all existing except the optional `fulfilled`. We do **not** invent a parallel `draft/requested/quote_sent/...` enum; we derive it. This is what keeps the platform from re-forking the money spine.

---

## 6. Admin / Platform Management

- **Create/edit listings for a talent:** yes — the Storefront editor is the same component mounted in the admin profile drawer (exactly as the current services-menu card already is), so agency staff manage a talent's listings on their behalf.
- **Approve / reject / hide listings:** yes, via `moderation_state` (`pending/approved/rejected`, mirroring `media_approval_state`) — but **silently** (publish immediately, review async, pull down on violation). Admin gets a moderation queue; the talent never sees a "pending" badge on their own listing.
- **Categories:** admin-curated category vocabulary (optional) that talents pick from; drives the public category tabs. MVP auto-inherits the talent's discipline; explicit categories are Phase 2.
- **Orders / bookings / payments / disputes:** all visible in the existing admin Messages/booking workspace — because products ride `agency_bookings`, they appear in the same revenue, commission, and dispute views as services (one unified financial picture).
- **Commission:** identical for services and products — `resolveBookingCommissions` operates on offer *line items* and never inspects kind. `gross_charged = subtotal + client_surcharge + base_reservation_fee`; the `talent_net + workspace_fee + platform_fee === gross_charged` invariant holds for a ring exactly as for a massage.
- **Stripe/Connect:** unchanged. `transfers.ts` fans the collected gross to the **talent** leg (the maker/provider) and the **workspace** leg (agency margin) via separate-charges-and-transfers. The only product nuance: **payout timing** — a service pays out after `completed`; a physical product should pay out after **shipment confirmed**, implemented by gating the transfer on the fulfillment record for `booking_sub_type='product'` (deposit still collected up front).

---

## 7. Data Architecture

**Yes — create `talent_offerings`** (evolve `services_menu` into it). It is the *config/catalog* layer; it touches the money rail only through the pre-existing `inquiry_offer_line_items.source_service_id` stamp (repointed) and `inquiries.source_context`.

**How services, packages, and products are represented:** one row, discriminated by `kind`. A package is a listing with a flat price + a "what's included" description (MVP) or `bundle_items` (later). A product is a listing with `kind='product'` + inventory + fulfillment (Phase 3). **The talent experiences all three as "a listing."**

**MVP table (the form writes ~8 columns; the rest ship nullable + hidden):**

```sql
create table talent_offerings (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references talent_profiles(id) on delete cascade,
  tenant_id uuid,                                   -- roster scope (null = independent)
  kind text not null default 'service',             -- service|package|product (inferred; hidden in MVP)
  title text not null,
  description text,
  price_type text not null default 'flat_package',  -- == inquiry_offer_line_items.pricing_unit enum
  price_display text not null default 'exact',       -- exact | from | quote  (drives the CTA + gate)
  amount_cents bigint,                              -- null when price_display='quote'
  currency text not null default 'USD',
  status text not null default 'published',          -- shown as a visible/hidden toggle
  visibility text not null default 'public',         -- public|agency_only|on_request (hidden in MVP)
  moderation_state text not null default 'approved', -- silent; admin-only
  is_featured boolean not null default false,
  instant_bookable boolean not null default false,   -- hidden in MVP; off = safe inquiry path
  sort_order int not null default 0,
  -- deferred-but-present (nullable, absent from the MVP form):
  duration_minutes int, category text, deposit_pct int,
  amount_max_cents bigint, compare_at_cents bigint,
  min_quantity int, max_quantity int, inventory_qty int,
  fulfillment_type text, lead_time_days int,
  requires_consultation boolean not null default false,
  prerequisite_offering_id uuid references talent_offerings(id),
  attributes jsonb not null default '{}',            -- long-tail sink (compliance, personalization, quote vars)
  title_i18n jsonb, description_i18n jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- images from day one (single in the MVP form, gallery later); reuse media_assets wholesale
create table talent_offering_media (
  offering_id uuid references talent_offerings(id) on delete cascade,
  media_asset_id uuid references media_assets(id) on delete cascade,
  sort_order int not null default 0,
  primary key (offering_id, media_asset_id)
);
```

**Variations, add-ons, images, inventory, duration, pricing type, visibility — how each works:**
- **Pricing type** → `price_type` (1:1 with the `pricing_unit` enum) + `price_display` (exact/from/quote) — the pair the CTA and the charge-gate read.
- **Images** → `talent_offering_media` join to `media_assets` (hero = lowest sort; gallery + before/after via `media_assets.variant_kind`).
- **Duration** → `duration_minutes` (distinct from the billing unit).
- **Visibility** → `visibility` + `status` + silent `moderation_state`.
- **Variations / add-ons** → **MVP: none in the schema you must build** — a variation is "another listing." **Phase 3:** promote to `talent_offering_variants` (label, sku, amount_cents, compare_at, duration, inventory_qty, media_asset_id) + `talent_offering_addons` + `talent_offering_bundle_items`, only when real SKUs need per-variant stock/image. (Both independent architects agreed: don't build the child tables until a talent needs them.)
- **Inventory** → `inventory_qty` on offering/variant + a `talent_offering_stock_reservations` ledger + an atomic `reserve_offering_stock` RPC — **Phase 3 only**, the one genuinely new money-adjacent structure.

**How a listing connects to inquiry / offer / booking / checkout / order / payment:**
```
listing (talent_offerings)
  └─ selection → inquiries.source_context.offering   (provenance; existing jsonb)
  └─ id       → inquiry_offer_line_items.source_service_id   (existing stamp, repointed)
                     ↓ unit_price/units/total_price (units already exists → quantity #7)
             resolveBookingCommissions → booking_commission_snapshot (gross_charged)
                     ↓
             agency_bookings (booking_sub_type: service|product|package)
                     ↓
             booking_transactions → Stripe PaymentIntent (platform) → transfers.ts (Connect: talent + workspace)
                     ↓ products only
             booking_fulfillment (ship/pickup/digital sidecar)
```

**What to retire / merge (so we never build four pricing systems again):**
- **Retire** the legacy "Rates" accordion (`rates.cards`, `commercial.packageRates`, `commercial.rateTiers`) — 0 adoption, and `rateTiers` has no editor at all.
- **Retire** the standalone "Fixed rate" (`booking_terms.fixedRateCents`) as a pricing surface — instant-book reads the chosen listing's `amount_cents` instead (keep `booking_terms` only for deposit/refund prefs).
- **Retire** the read-only teaser cluster (`package_teasers`, `starting_from`, `booking_note`, `service_category_slug`) — fold into listings.
- **Keep** the current `services_menu` render as a **no-regression fallback** until `talent_offerings` lights up, then deprecate it.
- **The anti-fragmentation rule:** all pricing lives in `talent_offerings`; the offer line is the single chargeable representation; commission runs in exactly one place. One config table, one money rail — never a fifth surface.

---

## 8. User Permissions & Plans

- **Free talents:** today pricing is gated to `talent_pro`/`talent_portfolio`. **Recommendation:** let **free** talents *create and display* listings (a real activation hook — 0/121 adoption says the gate is hurting, not helping), but gate **transacting** (instant-book / direct product checkout, and eventually custom domain) to paid tiers, with the platform taking rate on any sale. "Display for everyone, sell-through for Pro" both drives adoption and monetizes. (This is a monetization call — flagged for your sign-off; the schema supports either.)
- **Agencies manage offerings for their talents:** yes — the same editor mounts in the admin drawer (roster-scoped, staff-gated), exactly like the current services-menu card.
- **Coordinators/admin create offers from a listing:** yes — the offer composer's service picker pre-fills a line from the listing (`source_service_id` stamp), including add-ons/tiers.
- **Who edits prices / publishes:** the talent (owner) and roster staff; changes are live immediately with **silent** async moderation (no approval friction on the talent). Agency **field-locks** already exist and apply (an agency can lock a talent's pricing).
- **Do changes require approval?** No up-front approval (that would recreate the friction that killed adoption). Post-publish moderation + violation takedown only.

---

## 9. Design / UX Recommendation (screens)

- **Talent dashboard — Storefront tab:** (1) list of calm rows + "Add listing"; (2) editorial empty state with profession starter chips; (3) the 4-field add sheet ("What do you offer?" → name, photo, price+mode, Add details → Save); (4) the segmented Fixed/From/Contact control + optional unit pills + live plain-English sentence; (5) row kebab for hide/feature/duplicate/delete + drag reorder; (6) mobile = full-height add sheet, stacked fields, Save pinned in thumb reach, camera-roll in one tap. *(A visual, screen-by-screen mockup in the repo's cool/New-Inquiry token palette was drafted during this plan and can be published on request.)*
- **Public profile — Storefront section:** kind-aware presenter (rows / cards / grid), featured rail + category tabs only at volume, lightbox reuse, adaptive heading, CTA matrix by behavior.
- **Client selection flow:** tap a listing → CTA resolves (Book / Book now / Request / Ask for quote / Buy) → carried into the existing chat launcher as a pinned "Requesting: *X · $Y*" chip (or straight to instant-book for fixed-price).
- **Inquiry/chat integration:** the listing rides in via `source_context` + a new `offering` chip → an `InquiryIntent.line_items[]` seed with `source_service_id`; the coordinator sees exactly which listing was clicked.
- **Admin/order management:** the existing Messages/booking workspace + a fulfillment column + a moderation queue.
- **Empty states:** editorial figure + starter chips (talent); `null` section (public, free/empty).
- **Error states:** persistent async tiles (upload), "sold out" abort (stock), inline validation (price required unless Contact), no silent failures.
- **Mobile experience:** primary target throughout — add sheet, wrapping pills, single-column store, no competing sticky bars.

---

## 10. Implementation Plan (phased)

### Phase 1 — Clean MVP storefront (services + packages, actionable, image-backed)
- **Build:** `talent_offerings` table + `talent_offering_media`; the 6-field "Storefront" editor tab (talent + admin-drawer mount); kind-aware public `<TalentStorefront>` (services as rows, packages as cards, single image, lightbox reuse); **actionable CTAs** that carry the listing into an inquiry (`source_context` + repoint `source_service_id` + `inquiry_source_channel += 'offering_request'`); generalize `createInstantBooking` to any fixed-price listing; retire/hide the legacy Rates accordion + fixed-rate + teasers; fix the audit's confirmed bugs (`conditions` drop, import blind spot, self-reltype mismatch, dup + free-plan leak).
- **Why:** turns a dormant, non-actionable price list into a real "present + get booked" surface — the smallest thing that delivers the whole promise for 80% of talents.
- **Files:** `web/src/lib/talent/offering-*.ts` (evolve `services-menu-*`), `web/src/app/(workspace)/[tenantSlug]/talent/settings/` (editor), `web/src/app/t/[profileCode]/_light/TalentStorefront.tsx` (+ `storefront/*`, evolve `ServiceMenuList`), `_chat/unified-inquiry-bridge.ts` + `guest-chat-contract.ts` (carry the listing), `web/src/lib/inquiry/instant-book-engine.ts` (generalize), `inquiry-intent.ts` (+`source_offering_id`).
- **DB:** `talent_offerings`, `talent_offering_media`, `inquiry_source_channel += 'offering_request'`. (Repoint `source_service_id` — no schema change.)
- **QA:** add a listing in <20s across 3 talent types; renders on all 4 layouts + mobile; CTA carries the listing into the thread; instant-book charges `gross_charged` (surcharge applied, snapshot-derived), never raw `amount_cents`; free-plan behavior per the plan; zero regression for talents with only legacy `services_menu`.
- **Risks:** the money invariant (test that every charge derives from a snapshot); over-scoping the form (hold the 6-field line); layout regressions (fallback path).

### Phase 2 — Richer editing + order/quote connection
- **Build:** derived unified-status resolver + a **talent Orders queue** (one-button) and an **admin order desk** column; offer composer pre-fill incl. add-ons/tiers; "from"/range pricing (`price_display`); image **gallery** + before/after; **featured** + **categories** UI; per-offering `deposit_pct`; negotiation/supersede polish; the silent moderation queue.
- **Why:** closes the loop from "listing clicked" to "managed order," and gives sellers the richness (galleries, packages, deposits) that converts.
- **Files:** offer composer (`machinery-11`, `line-service-picker`), a new Orders queue surface, admin Messages workspace extension, `commission`/`transactions` (read-only reuse).
- **DB:** none required beyond Phase 1 (statuses are derived); optional `category` vocabulary table.
- **QA:** custom-quote negotiation round-trips; deposit → balance; add-ons flow onto offer lines; status label matches records at every stage; moderation never blocks the talent.
- **Risks:** status-derivation correctness (unit-test the projection); composer flattening add-ons (carry them through).

### Phase 3 — Products, inventory, direct checkout, fulfillment
- **Build:** surface `kind='product'`; `inventory_qty` + `talent_offering_stock_reservations` + atomic `reserve/commit/release` RPCs; `agency_bookings.booking_sub_type` + `booking_fulfillment` sidecar; **direct "Buy"** via the generalized instant-book (`checkout_type='full'`); payout gated on shipment for products; `talent_offering_variants`/`_addons`/`_bundle_items` child tables (real SKUs); shipping/pickup/digital fulfillment UI; product grid + qty steppers.
- **Why:** unlocks the jewelry/product/retail talent types and true "buy now," the one place a genuinely new (but small, money-*adjacent* not money-*core*) primitive is justified.
- **Files:** stock RPCs (SQL), instant-book engine (product branch), Orders queue (fulfillment actions), public `ProductGrid`, editor product/variant controls, `transfers.ts` payout-timing gate.
- **DB:** `booking_sub_type` enum + column, `booking_fulfillment` table, `talent_offering_stock_reservations` + RPCs, `talent_offering_variants/_addons/_bundle_items`, optional `pricing_unit += 'per_unit'`, optional `booking_status += 'fulfilled'`.
- **QA:** concurrent buyers can't oversell (atomic decrement); abandoned reservations auto-release; refund reverses a fired transfer; product payout waits on shipped; commission identical to services; made-to-order routes to request, not instant.
- **Risks:** inventory races (the RPC is the guard); payout-before-shipment (gate it); scope creep into full ecommerce (hold the line at local pickup / arrange-in-chat; defer tax/returns).

### Phase 4 — Analytics, upsells, bundles, recommendations
- **Build:** per-listing revenue + convert dashboard (extend the existing `source_service_id` quoted/booked analytic); add-on upsells at checkout; a bundle builder; "clients also booked"; featured/merchandising experiments.
- **Why:** compounds seller success once listings and orders have volume.
- **Files:** analytics surface, offer composer upsell hooks, bundle UI.
- **DB:** none structural (bundles use `_bundle_items` from Phase 3); analytics are read-side.
- **QA:** analytics reconcile to bookings; upsells never break the commission invariant.
- **Risks:** premature — do not start before Phases 1–3 have real data.

---

## 11. Final Recommendation

- **Best architecture:** ONE config table `talent_offerings` (evolving `services_menu`) + an image join, connected to the **existing** `inquiry → offer → booking → transaction → Stripe/Connect` rail through primitives that already exist (`source_context`, `source_service_id`). Products ride `agency_bookings` (a `booking_sub_type` discriminator + a `booking_fulfillment` sidecar), never a parallel order/checkout stack. "Buy/Book now" is a generalization of `createInstantBooking`. **No money math is ever rewritten** — that is the whole safety case.
- **Best MVP scope:** the **6-field "listing"** form (Title · Photo · Price+mode · optional unit · Description · Show-on-profile) over the one table; kind-aware, image-backed, **actionable** public storefront for services + packages; instant-book for fixed-price listings; carry-into-inquiry for everything else. Ship the table; ship the *form* like Linktree, not Shopify.
- **Remove from the old rate system:** the "Rates" accordion (`rates.cards`/`packageRates`/`rateTiers`), the standalone `fixedRateCents` pricing surface, and the `package_teasers`/`starting_from`/`booking_note` teasers. Fix the confirmed data-loss bugs on the way out.
- **Keep from the current services menu:** the whole config foundation — the `pricing_unit`-identical price types, per-service currency, visibility, discipline scoping, instant-book bridge, and the live per-item quoted/booked/convert analytic. Evolve it into `talent_offerings`; keep its render as the no-regression fallback.
- **Do not build yet:** structured variants/add-ons/bundle child tables, product inventory + direct checkout + fulfillment, "from/range" pricing, categories, deposits-per-listing, and any analytics/upsells — all Phase 2–4, all nullable-in-schema so the form stays tiny.
- **Why this is simple for talents but scalable for the platform:** the talent fills in a name, a photo, and a price — one noun, one form — while behind it sits a full commerce engine (9 pricing units, quantity, deposits, commission, Connect payout, refunds, disputes, inventory, fulfillment) that already works and is never re-forked. Power lives in the rail, not in the form. **The 0/121 census is the whole lesson: the way to make talents sell is to ask them for less.**

---

*Plan only — no code changed. Recommended next step: confirm (a) MVP = the 6-field listing form, (b) free-talents-display / paid-to-transact monetization, (c) retire the three legacy surfaces — then Phase 1.*
