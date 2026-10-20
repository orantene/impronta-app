# Services engine: full ticket plan (draft for PM, 2026-10-18)

Source: six read-only audits of origin/main @698f3c0 (talent services, business catalog and POS, page builder and service pages, SEO and AI, booking engine and data model, final gap pass), plus the DIS-5 plan (Business Wiki) and Oran's user stories in the consultant chat. Every ticket lands in **Status: Ready to start**, **Requested by: Claude audit**, with a Group Task parent. Items marked VERIFY came from reading code and need a failing test first. Items marked PLACEHOLDER need grooming before build.

Goal of the whole project: **one service engine for talents and businesses** (one record, one sellable rule, one price, one editor, one presentation system, one SEO/AI feed), with presentation per service (own page, quick view popup, expand, book direct) and a page-builder widget that respects it.

Already decided by Oran in chat: one engine (yes); plan gating (Free = quick view + share link; paid talent = own pages + SEO; business plans = everything + custom page per service); talents get classes/packs under "Más tipos"; Phase 0 sent to DEV.

Conventions per ticket below: **Type · Size · Priority · Area · Where**, then Problem (with evidence), Do, Done when, Related existing cards (do not duplicate; link instead), Depends on.

---

## G0 · Services Phase 0: safety and data loss (owned by Tulala DEV)

DEV was asked to create one card per item under the group "Services Phase 0" with PR links. PM: confirm the cards exist; if not, create them from the brief (9 items: checkout ignores visibility/moderation; hidden tiers readable by anon; JSON-LD escaping; talent save re-parents agency rows; silent data loss a-e; business appointment services missing from /book; delete without confirm; editor row-click lacks defaults; workspace /p/ canonical + sitemap). All later groups depend on G0 item 1.

---

## G1 · Services engine: foundation (one engine for talents and businesses)

Group goal: the data and rules under every service are shared, complete and enforced in one place.

### G1.1 One "can this be sold?" rule everywhere
Feature · L · 🔴 Now · Money, Agenda/booking · Both
- Problem: about 15 copies of the public/bookable predicate in three families (A: published+approved+public|on_request; B: strict public; C: status only). `on_request` handled three ways; `moderation_state` never written (dead); `visibility` mixes discoverability and price disclosure. Files: `lib/offerings/guest-sellable.ts`, `lib/talent/offerings-public.ts`, `site-admin/server/load-book-page-offerings.ts`, `directory/price-from.ts`, `scheduling/public-open-times.ts`, `storefront/catalog-grid.core.ts`, `storefront/package-selector.core.ts`, `booking/agent/catalog.ts`, `orders/purchase-policy.ts`, `visits/guest-order.ts`, `messages-v5/items-catalog.ts`.
- Do: one function `sellableState(offering, channel)` returning listed / price shown / instant allowed / request allowed; split "visibility" (where listed) from "price disclosure" (D-10a); moderation becomes platform-writable only; every reader and `createPurchase` call it.
- Done when: a single test matrix (status x moderation x visibility x channel) passes and every listed file imports the one function; grep shows no inline copies.
- Related: G0 item 1, D-10, D-10a, TUL-805. Depends on: G0.

### G1.2 One price calculation for checkout, display, POS, cart and offers
Feature · L · 🔴 Now · Money · Both
- Problem: server charge (`orders/purchase-pricing.ts`), display (`talent/public-price.ts`), POS (`pos/draft.ts`), cart, offers (NUMERIC major units), directory headline and promo display each compute price. Price phases never applied online; add-ons charged once per line; group extras unpriceable; `consumes_units` ignored; deposit rounding differs (floor vs round); multi-line deposit rule differs (min % orders vs max % offers); talent cost basis differs online vs POS.
- Do: one pricing module (cents) with variants, phases, add-ons (per unit or per booking flag), group extras, consumes_units, deposit rule; display, POS, cart, offers and checkout all call it.
- Done when: golden tests show identical totals across card, page, sheet, POS and charge for the same input; deposit rounding one rule.
- Related: TUL-791. Depends on: G1.1.

### G1.3 Service content fields (address, SEO, presentation, type)
Feature · M · 🔴 Now · Platform & release · Both
- Problem: `talent_offerings` has no slug, slug history, summary, SEO title/description, OG image, presentation mode, linked page, service type or tags. Talent slug is derived (`servicio-<title>-<id8>`); rename keeps 200 with no redirect.
- Do: additive migration: `slug` (unique per owner scope), `slug_history`, `summary`, `seo_title`, `seo_description`, `og_media_id`, `presentation` (page | quick_view | expand | book_direct | null=inherit), `page_id` (linked builder page, events precedent), `service_type`, `tags text[]`; backfill slugs from titles; resolver honours history with 301.
- Done when: migration file in the release bundle; backfill dry run report; resolver tests (rename, collision, locale).
- Related: TUL-793, TUL-586. Depends on: none.

### G1.4 Photos for business services everywhere
Improvement · M · 🔴 Now · Workspace Admin, POS · Admin Workspace
- Problem: Catalog Details photo input always disabled ("gallery joins a talent profile"); POS counter, QR menu and menu board show no photos. `talent_offering_media`, `photo-ingest` and the `catalog_grid` reader already exist.
- Do: workspace-scoped media writer; photos on POS tiles, QR menu, menu board, services widget, page and quick view.
- Done when: a business item with 3 photos shows them on all six surfaces; alt text field present.
- Depends on: none.

### G1.5 Who performs it: services linked to people and rooms
Feature · XL · Next · Agenda/booking · Both
- Problem: an offering has exactly one owner; no offering-to-provider table; "Who" tab read-only and identical for every service; business ("house") services are not slot-bookable (`public-open-times.ts:112` returns `not_bookable_here`); hours exist only per talent profile; `staffMode` prop unused.
- Do: `offering_providers` (offering, provider profile or resource, price/duration override optional); "anyone available" assignment; per-provider hours; house services bookable by slot; talents = provider "me".
- Done when: a salon service with 2 stylists books either stylist or "anyone"; slots respect each person's hours; tests for both owner kinds.
- Related: Story B1 (salon). Depends on: G1.1.

### G1.6 Options that change duration, and option-level rules
Improvement · M · Next · Agenda/booking · Both
- Problem: variants have no duration; only add-ons lengthen a slot (`bookingDurationMinutes`).
- Do: variant duration and buffers; booking sheet and slots use them.
- Done when: "Cabello largo +15 min" lengthens the slot and the calendar block.
- Depends on: G1.2.

### G1.7 Stock and seats held on every sales path
Bug · M · Next · Money, POS · Both
- Problem (VERIFY): `submitMenuOrder` and `cart-checkout.core.ts` call `createPurchase` without capacity, so pool stock is not held; readers still use the stale `inventory_qty` mirror.
- Do: derive pools inside `createPurchase`; readers read the capacity engine.
- Done when: an online menu order for the last unit holds it; sold-out badges match the ledger.
- Depends on: G1.1.

### G1.8 No double orders on double tap
Bug · S · Next · Money · Both
- Problem (VERIFY): `clientOrderKey` is not persisted or checked (`storefront/idempotent.ts`); catalog sheet, menu, ticket and session actions are not wrapped in the command runner.
- Do: pipeline-level idempotency key stored and enforced.
- Done when: two rapid submits with the same key create one order (test).

### G1.9 A talent on several agencies without duplicate rows
Feature · L · Later · Talent Workspace · Both · PLACEHOLDER (needs design)
- Problem: one `tenant_id` per row; a talent on 3 rosters needs duplicated rows; hours and extras per talent not per tenant; platform host may show all tenants' rows together (INFERENCE).
- Do: link table with per-agency price/visibility overrides; shared calendar; scoped public loaders.
- Related: TUL-1070, promos tenant incident.

### G1.10 Channel switches separate from status
Improvement · S · Next · Workspace Admin · Admin Workspace
- Problem: turning POS off sets `status=draft`, so the item also vanishes from site, /book and QR; Tables, QR, profile, private link channel switches are drawn but disabled.
- Do: per-channel flags (site, directory, POS, QR, chat, private link, agency only); status stays independent.
- Done when: POS off leaves the site listing intact; each channel switch works.
- Depends on: G1.3.

---

## G2 · Services editor: one editor for talents and businesses

Group goal: one editor component with simple mode (talent default) and full mode (business), tabs shown by type. Retire the legacy `TalentOfferingsManager`.

### G2.1 Unified item editor (simple and full mode)
Feature · XL · 🔴 Now · Dashboard, Talent Workspace, Workspace Admin · Both
- Problem: three editors write the same table with different coverage (`components/talent/services/EditorScreen.tsx`, legacy `TalentOfferingsManager.tsx`, workspace `page-modules/catalog/CatalogItemEditor.tsx`).
- Do: one editor; simple mode = name, price, duration, photo, where, booking mode; "Más opciones" reveals the rest; tabs by type (Details, Price, Options, When, Who and where, How they book, Page, Channels, Policies).
- Done when: talent and business both edit every field from one component; legacy manager removed; parity checklist signed.
- Depends on: G1.1, G1.3.

### G2.2 Missing sale controls for talents
Improvement · M · Next · Talent Workspace · Talent
- Problem: talent editor lacks full/free payment, pay in person, require account/ID, visibility, featured, price units, options for services, per-service extras, explicit "no deposit" and "flexible" cancellation (null means inherit).
- Do: expose them in the unified editor (talent mode, behind "Más opciones").
- Done when: each control round-trips and the public booking sheet honours it.
- Depends on: G2.1.

### G2.3 Create flow: quick add, smart type picker, change type safely
Feature · M · Next · Dashboard · Both
- Do: 3-field quick add; "¿Qué vendes?" with search box and trade pre-select (DIS-5 cards); change type dialog (keeps / changes / drops) until first sale, "Copiar como…" after; "Vender también como…" grouping.
- Done when: stories B1, B7 and T1 can be completed end to end.

### G2.4 A real "ready to publish" check
Improvement · S · Next · Dashboard · Both
- Problem: checks only name, price, duration (talent) or title, price, deposit, identity, currency (business); ignores photo, category, translation, hours, actual bookability, plan downgrades.
- Do: one checklist for both: blockers vs warnings, including "not bookable online yet" (G0 item 6) and "your plan shows this as request".
- Done when: each check has a test; the checklist runs on Save for live items too.

### G2.5 Spanish and English for every text
Improvement · M · Next · Dashboard · Both
- Problem: workspace writes hard-coded `en` (G0 item 5d); options, extras and category names have no translation UI; missing-translation chip only checks titles with exactly two languages.
- Do: ES/EN tabs on every text field incl. options, extras, categories; AI translate; fix flow from the chip.

### G2.6 Draft, published, paused, archived (with restore)
Improvement · S · Next · Dashboard · Both
- Problem: business can only set draft/published; "Save draft" unpublishes a live item; no archive/restore; duplicate does not copy children (VERIFY).
- Do: four states with "Dejar de vender" (bookings honoured); archive/restore; duplicate copies options, extras, components, phases, photos.

### G2.7 Categories and tags manager
Improvement · M · Later · Dashboard, POS · Both
- Problem: free-text categories; rename edits every item; `category_i18n` never written by Catalog; Favorites and category are write-only against the POS counter; no tags/SKU/barcode.
- Do: managed categories (rename, merge, order, translate), tags, SKU/barcode (business); POS tabs and favorites read them.

### G2.8 Bulk edit, search, export and spreadsheet import
Feature · M · Later · Workspace Admin · Admin Workspace
- Problem: no search, bulk, sort, pagination or export; import accepts one vendor's JSON only.
- Do: search, filters, bulk (price %, channel, category, status), CSV export, CSV/Google Sheet import with a Type column and dry run (Kaan 40 tours).

### G2.9 Share a service: permanent link, QR and WhatsApp preview
Feature · S · Next · Talent Workspace · Both
- Problem: dashboard Share copies the profile root; `?service=` links expire after 30 minutes; no QR.
- Do: permanent link (own page URL, or quick view link with canonical to the list); QR download; preview image.
- Related: TUL-938 (promo sharing kit).

### G2.10 Tell the owner what their plan changes
Improvement · S · Next · Talent Workspace · Talent
- Problem: instant booking is Web Office only but the editor lets Free pick it and the public site silently shows request; other silent downgrades (no hours, no duration, no checkout).
- Do: inline notice with one-tap upgrade; list downgrades in the checklist (G2.4).

### G2.11 Fast services screens
Improvement · M · Next · Dashboard · Both
- Problem: whole-catalog reload for one-row actions; N sequential writes to reorder; workspace editor skips the server seed; settings saves do not bust the public cache (120 s TTL).
- Do: per-row actions, batch reorder, server seed for both, cache bust on save.
- Done when: list paints under 2 s on staging (TUL-1113 budget).
- Related: TUL-824, TUL-1113.

### G2.12 Edit existing extras, with translations and photos
Bug · S · Next · Talent Workspace · Talent
- Problem: `ExtraScreen` gets no `existing` prop; names not translatable; `loadAddonGroups` returns `mediaUrl: null`.

---

## G3 · Services presentation: page, popup and widget

Group goal: every service can be shown as its own page, a quick view popup, an inline expand or straight to booking; the page builder widget follows each service's setting by default; one site-level service page design; optional custom page per service.

### G3.1 Service detail as page, quick view or inline (one model)
Feature · L · 🔴 Now · Public site, Page builder · Both
- Problem: no quick view exists; `detailPresentation` (modal | sheet_mobile | inline) is a dead prop (`builder-node/registry.ts:1107`); the booking sheet has no photos, FAQ, reviews or policy text.
- Do: one service detail model rendered three ways; quick view = popup (desktop) / bottom sheet (phone) with photos, options, price, policy, Reservar and "Ver página completa" when a page exists.
- Done when: the same service shows identical facts in all three; share link opens the popup.
- Depends on: G1.3.

### G3.2 Clean service addresses for talents
Improvement · S · Next · Public site · Talent
- Problem: `/servicio-<title>-<id8>` at site root, Spanish prefix in English, no 301 on rename.
- Do: `/servicios/<slug>` (ES) and `/en/services/<slug>` with 301 from old forms and from slug history.
- Related: TUL-793, TUL-586. Depends on: G1.3.

### G3.3 Service pages for businesses
Feature · L · Next · Public site, Website · Admin Workspace
- Problem: no route, slug, sitemap or SEO for workspace services; `/servicio-…` on agency hosts falls to CMS rewrite (INFERENCE 404).
- Do: `/<catalog-slug>/<slug>` with the trade word (servicios, tours, menu) and ES/EN mirror like `event-page-paths.ts`; sitemap, JSON-LD, hreflang.
- Depends on: G1.3, G3.1.

### G3.4 The Services widget on business sites
Feature · M · 🔴 Now · Page builder, Website · Admin Workspace
- Problem: `services_catalog` renders empty on workspace pages (data source talent-only, `homepage-cms-data-sources.ts:375-400`); businesses get the fixed "Live services" band; Looks never compose the widget.
- Do: workspace data source (`workspace-offering-scope.ts`); Looks use the widget; band retired or kept as a preset.
- Done when: a business site shows its catalog in all 8 layouts.

### G3.5 Widget "on tap" setting that follows each service
Feature · S · Next · Page builder · Both
- Do: options "Según cada servicio" (default), "Siempre página", "Siempre vista rápida", "Ir directo a reservar". Every card is a real link; popup items' facts are in the HTML; share links canonical to the list.
- Done when: SEO test confirms crawlable links and no indexable parameter URLs.
- Depends on: G3.1.

### G3.6 One service page design per site (in the page builder)
Feature · L · Next · Page builder, Themes · Both
- Problem: the service page is one hand-coded inline-styled component for every design (`talent-site/server/service-main.tsx`); no per-business design.
- Do: "Diseño de páginas de servicio" in the builder from service widgets (gallery, price, duration, included, itinerary, FAQ, reviews, related) plus protected booking panel, price/CTA and policies; theme defaults; `service-main.tsx` stays the engine fallback.
- Depends on: G3.1.

### G3.7 Custom page for one service ("Diseñar esta página")
Feature · M · Later · Page builder · Both (top plans)
- Do: copy the events model (`events.page_id`, `resolveLinkedBuilderPage`, 308 from the builder URL, `?edit=1` exemption, Page tab).
- Depends on: G1.3, G3.6.

### G3.8 Edit and view buttons where people expect them
Improvement · S · Next · Talent Workspace · Both
- Problem: no "Edit this page" on talent hosts (edit chrome mounts only on agency/hub hosts); no "Ver página" from the editor.

### G3.9 Richer service pages
Improvement · M · Next · Public site · Both
- Problem: no options, extras, deposit, service area or intake shown; description capped at 280 in the editor (2000 in the type); max 6 raw `<img>`; talent-level reviews only; non-ES/EN locales fall back to Spanish.
- Related: TUL-795. Depends on: G3.6.

### G3.10 "Book" from a service page always opens the right service
Bug · S · Next · Agenda/booking · Both
- Problem (VERIFY): service CTA goes to `/?book=<id>#book`, which resolves only via `registerBookableOffering`; catalog-based sites register nothing, so it may fall back to another service; packages excluded.
- Do: mount the booking sheet on the service page; register every catalog row.

### G3.11 Built-in designs and Looks show real services
Improvement · M · Later · Themes · Both
- Problem: default, bold, editorial, minimal, portfolio show static name-only cards; business Looks use a fixed band.

### G3.12 Posts link to services
Improvement · S · Later · Website · Both
- Problem: Posts "Servicio" block has no link, hides quote services; `book_button` on workspace posts goes to `/?book=` which nothing consumes (INFERENCE); "Posts sobre este servicio" unbuilt.

### G3.13 Hub profile services link to their pages
Improvement · S · Later · Public site · Talent
- Problem: hub "View details" needs an absolute `siteUrl`; no hub service route.

---

## G4 · SEO and AI engine (world-class)

Group goal: every service is readable, citable and bookable by Google and AI engines, generated from one structured source.

### G4.1 One structured "offering contract" feeding every channel
Feature · L · Next · Platform & release · Both
- Do: versioned JSON contract per offering; page HTML, JSON-LD, markdown, llms.txt, feeds, API, MCP and chat generated from it.
- Depends on: G1.1, G1.2, G1.3.

### G4.2 Complete, shared structured data
Improvement · M · Next · Public site · Both
- Problem: many separate builders (2 LocalBusiness, 3 FAQ, 2 Article, 2 Breadcrumb); offers lack availability, url, seller, areaServed; no AggregateOffer; offers emitted twice with different provider ids; LocalBusiness generic without geo/hours; no Product/TouristTrip/Event-with-offers; hub Person lacks sameAs; platform Organization graph likely on every talent page (INFERENCE).
- Related: TUL-794. Depends on: G0 item 3.

### G4.3 llms.txt with services and prices on every site
Bug · S · Next · Public site · Both
- Problem (VERIFY): on talent hosts `app/llms.txt/route.ts` answers with the posts-only file, shadowing the services file; workspace hosts have no services section; `lib/booking/agent/llms-txt.ts` builder is dead code.
- Related: TUL-589.

### G4.4 Markdown version of every page
Feature · S · Later · Public site · Both
- Do: `Accept: text/markdown` and `.md` alternates from the contract.

### G4.5 Catalog API and AI agent access for businesses too
Feature · M · Later · Platform & release · Both
- Problem: public booking API and MCP are talent-scoped; `/api/` disallowed for every crawler incl. named AI agents; not discoverable; the AI toggle blocks some AI search bots but not others and does not gate the API.
- Do: workspace catalog endpoint and MCP; allow `/api/public` for AI search agents; `.well-known` discovery; one consistent toggle.

### G4.6 Make services searchable
Feature · M · Next · Public site · Both
- Problem: `ai_search_document`, embeddings and FTS contain no offerings; directory search cannot find a service name.
- Do: offerings in the search document, FTS and embeddings; service search in the directory and Concierge.

### G4.7 Address and sitemap hygiene
Chore · M · Next · Public site · Both
- Problem: lastmod not truthful; sitemaps capped at 5000 with no index; locale redirects are 302; `/book`, `/contact`, `/models`, `/directory` have no canonical/hreflang; `/directory?page=n` canonical to page 1; gone service slug likely 200+noindex (INFERENCE); `/w/<slug>/sitemap.xml` not in robots (INFERENCE).

### G4.8 Events show up on Google
Improvement · M · Later · Public site · Admin Workspace
- Problem: events not in sitemap; no Event JSON-LD with offers; English list title; no description or OG.

### G4.9 Share images that work on WhatsApp
Improvement · S · Later · Public site · Both
- Problem: service OG is a raw storage URL (INFERENCE: may exceed WhatsApp size).

### G4.10 Speed for SEO
Improvement · M · Next · Public site · Both
- Problem: service and blog photos are plain `<img>`; about 100 KB of messages inlined per locale on every page; hub profile uncached; root layout force-dynamic; no LCP/INP gate in CI.
- Related: TUL-871, TUL-1156, TUL-1181.

### G4.11 Measure AI and search traffic
Feature · S · Later · Dashboard · Both
- Do: AI-referrer classification, server-side AI bot logging, Search Console connection.
- Related: TUL-583 (blocked), TUL-581.

### G4.12 Private links never indexed
Chore · XS · Next · Platform & release · Internal
- Problem: `/manage`, `/pay`, `/c/t`, `/ticket`, `/visit`, `/r`, `/link` have no noindex and are not disallowed.

### G4.13 Product and experience feeds (Google, OpenAI, Things to do)
Research · M · Later · Platform & release · Both · PLACEHOLDER (decision needed)

---

## G5 · New service types and business needs

### G5.1 Tour / experience type (Kaan first)
Feature · XL · Next · Agenda/booking · Admin Workspace
- Do: DIS-5 v1 slice: departures with seats (sessions engine), adult/child tiers, pickup zones, itinerary, included/not included, private on request; publish checks.
- Related: DIS-5, Kaan CLI-4, TUL-1199. Depends on: G1.3, G3.3.

### G5.2 Services directory with filters
Feature · L · Later · Public site · Admin Workspace
- Do: `/tours` (or trade word) with category, zone, date, duration, price, kid-friendly; grid/list. Depends on: G5.1, G4.6.

### G5.3 One workspace, two brands (Idan: DMC + Kaan)
Feature · M · Later · Website · Admin Workspace
- Do: brand tag per item; per-site catalog filter and navigation. Related: TUL-1193.

### G5.4 Restaurant options carried end to end
Feature · L · Next · POS · Admin Workspace
- Problem: `catalog_modifier_groups` unused; cashier never offers add-ons; online menu orders drop variants and add-ons; QR menu has no categories, photos, variants or order; `prep_station_id` exists but Catalog says it does not.
- Related: Namaste TUL-1210/1211.

### G5.5 Passes, memberships and gift cards
Decision · M · Later · Money · Both · PLACEHOLDER (Oran decision: scope and timing)
- Problem: cards disabled in Catalog; `entitlement_credits` has no writer.

### G5.6 Packages sold as real bundles
Improvement · M · Later · Money · Both
- Problem: package sold as one line; components not expanded into holds or prices.

### G5.7 Transfers type (zones, rates, vehicles)
Feature · XL · Later · Agenda/booking · Admin Workspace · PLACEHOLDER
- Related: Idan TUL-1200.

### G5.8 Locations: catalog and price per location
Feature · M · Later · Workspace Admin · Admin Workspace · PLACEHOLDER

### G5.9 Tax on sales (POS and online)
Decision · S · Later · Money · Both · PLACEHOLDER (CFDI skipped by decision; revisit 2026-12-01)

---

## G6 · Commerce and money integrity (found next to services)

### G6.1 Show the client fee before Stripe
Bug · S · Next · Money · Both
- Problem: the pass-through surcharge appears first on the Stripe page; the booking sheet never shows it.

### G6.2 Same payout basis online and in POS
Bug · M · Next · Money · Both
- Problem (VERIFY): online uses base `amount_cents x units`, POS uses effective variant/phase price; payouts diverge.
- Depends on: G1.2.

### G6.3 One money model for offers and orders
Improvement · L · Later · Money · Both · PLACEHOLDER
- Problem: offers in NUMERIC major units, orders in cents; different deposit rules.

### G6.4 Check zero-decimal currencies against Stripe
Chore · XS · Next · Money · Internal
- Problem (VERIFY): `money-format.ts` marks COP as zero-decimal.

### G6.5 One home for deposit and cancellation rules
Bug · S · Next · Money · Admin Workspace
- Problem (VERIFY): per-item overrides in Settings (`booking_policy_overrides`) outrank the Catalog fields silently.

### G6.6 Online orders visible for stores and rentals
Bug · XS · Next · Workspace Admin · Admin Workspace
- Problem: Orders rail row hidden outside counterOps presets although `rentals`/`workshop_print` sell online.

### G6.7 Event and reservation backing items leak into POS and QR
Bug · S · Next · POS · Admin Workspace
- Problem: counter and QR readers do not exclude event-backing packages and the reservation offering.

### G6.8 Charge the travel fee for home visits
Feature · S · Later · Money · Talent
- Problem: `selling_defaults.travelFeeCents` and service-area fees are stored but never priced.

---

## G7 · Platform hygiene

### G7.1 Database types and placeholder migrations
Chore · M · Next · Platform & release · Internal
- Problem: `database.types.ts` behind migrations (missing several tables/columns); 21 placeholder migrations + 1 empty stub; schema not rebuildable from repo.

### G7.2 Public sessions respect the service's visibility
Bug · XS · Next · Platform & release · Internal
- Problem: `sessions_select_public` ignores offering visibility.

### G7.3 Caching strategy for public pages
Research · S · Later · Platform & release · Internal · PLACEHOLDER
- Problem: root layout force-dynamic; hub profile force-no-store.

---

## G8 · Notifications, promos, chat, onboarding, reporting, accessibility, translations, reviews

Filled from the final gap audit (pending). Placeholder group.

---

## G9 · Client projects hygiene (from the Services backlog audit)

### G9.1 Idan Offer DMC: scope one-pager and card hygiene
Task · S · 🔴 Now · Onboarding & clients · Internal · PLACEHOLDER
- Do: two-step launch scope (site + RFP + transfers as quote first; transfer booking next); link Idan cards in order; owners for TUL-1198/1199; merge duplicate GBP/Search Console asks (1197/1201/1203); add Kaan Mexico build cards; Drive folder re-share.

### G9.2 Namaste Tacos: one live test-run card
Task · XS · Next · Onboarding & clients · Internal
- Do: merge TUL-1213 + 1214 into one results-table card; park TUL-1217 behind TUL-47; preload menu into a test workspace; fix status mismatch hub vs cards.

### G9.3 Talent exclusivity needs explicit consent before recruiting at scale
Decision · S · Next · Talent Workspace · Both · PLACEHOLDER (Oran + Ale)
- Problem: `agency/exclusivity-resolver.ts` auto-assigns exclusivity on some plans pending opt-out (from TUL-1265 notes); legal/trust risk.

### G9.4 Approve DIS-5 and the client onboarding template
Decision · XS · Next · Product & UX · Internal
- Do: log DIS-5 as a Decision with the note "talent per-service pages exist; business pages reuse the same design"; approve TUL-1204 template.
