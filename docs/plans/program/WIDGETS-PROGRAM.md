# Storefront widgets program (page builder) — strategy, contracts, ownership. 2026-09-16

Goal: every engine that is proven (booking, reservations, sessions, events, catalog/orders, guest QR, payment links, messaging, people) gets a **door on a page**: a builder block a business places in the Website builder, that looks premium on a phone first and on desktop, and that calls the real engine. Today.

## Architecture (already in the repo; follow it, do not invent a second)
- Block kind registry: `web/src/lib/site-admin/builder-node/registry.ts` (`kind`, `label`, `description`, `children`, `propsSchema`); kind union in `builder-node/types.ts`; MVP allow-list `builder-node/mvp-allow-list.ts`; add-gallery card `lib/site-admin/add-gallery/registry-catalog-sections-connected.ts`; template composition `builder-core/site-templates/business-components.ts` (which pages of which business type carry which block by default).
- Render: `builder-node/render.tsx` `case "<kind>"` → a **client island** (`ReserveTableIsland` pattern, `render.tsx:5705`): props only, the island dynamically imports its UI, reads live data through a server action/route on mount (never bundles the engine), decays (price, stock, availability) are re-read client-side.
- Data seams: server actions already exist per engine (`lib/server-actions/scheduling-engine.ts`, `reservations*`, `messaging-engine.ts`, `lib/venues/*`, `lib/catalog/*`, `lib/orders/*`, `lib/payments/links.ts`, `lib/visits/*`). A widget island calls them via a thin `lib/storefront/<widget>.server.ts` reader/action pair (tenant-scoped by host, guest session cookie for identity).
- Missing kinds the builder must offer (`builder-node/required-widgets.ts`): appointment_picker, seat_map, service_collection, class_timetable, package_selector, catalog_grid, membership, gift_card, pickup_selector, cart_checkout, credit_wallet, order_lookup, portal_entry. Existing engine blocks: reserve_table, session_picker, ticket_picker, menu_board, form (inquiry), directory, featured_talent, location_map, qr_code, stats, social_feed, pricing_table.
- Design system: the site's Look tokens (`site-templates/looks/*`, `look-defaults.ts`); blocks use the Look's colour/type/radius, never hard-coded palettes. Mobile first: single column, 16px gutters, sticky bottom CTA, sheets not modals; desktop: 2-column (content + summary card), max-width 1120.
- Every widget has the same 6 states, designed and built: **empty** (nothing configured: builder-only hint, invisible on the live page), **loading** (skeleton in the Look), **ready**, **busy** (submitting, button locked, no double writes), **refused** (engine refusal text: full, past, over limit, "This just changed. Reload"), **done** (confirmation card with next step: add to calendar, manage link, receipt, share).
- Identity: guest session cookie (host-local) → name/phone/email captured in the widget's last step; a signed-in customer is prefilled. Money: USD display; deposit vs full from the offering's policy; payment via the existing checkout (mock provider on QA).

## Widget contracts (props the business sets in the builder → engine calls → what renders)

| # | Kind | Builder props | Engine seam (read / write) | Mobile → desktop |
|---|---|---|---|---|
| 1 | `reserve_table` (exists; place it + polish) | venueName, ctaVerb, partyMin/Max, cardNotice, notesEnabled | reads service windows/availability; `reserve` action → order + hold; confirmation + manage link | party pills → date strip → time chips → details → done card; desktop: form left, "your table" summary right |
| 2 | `appointment_picker` (new) | offeringIds[] or "all services", staffMode (any/pick), showPrices, depositNotice | `scheduling-engine`: services, people & place, slots, `createBooking` w/ deposit; manage token e-mail | 5 steps as sheets (service → person/place → day+time → details → deposit/confirm); desktop: stepper left, summary right |
| 3 | `class_timetable` (new) | seriesIds[] or all, weekView/list, showSpots, waitlist on | sessions reader (series, capacity left), `session_picker` book action, waitlist join/offer accept | day tabs + session cards with spots-left; desktop: week grid |
| 4 | `session_picker` (exists) | offeringId, title | as today | single session card → seat → details |
| 5 | `ticket_picker` (exists) + `seat_map` (new) | eventId/all events, tiers shown, seatMap on | admissions: tiers, hold timer, checkout, `/ticket/<code>` | event card → tier qty → (seat map pinch-zoom) → checkout; desktop: map left, order right |
| 6 | `event_list` (new, light) | filter (upcoming/all/tag), layout (cards/list), count | events reader | cards with date badge; desktop 3-up |
| 7 | `menu_board` (exists) + `catalog_grid` (new) | sections/collections, showPhotos, showPhases, orderable on/off | catalog reader (items, options, packages, live phases, promotions); add-to-order → `cart_checkout` | photo cards 1-up → 2-up → desktop 4-up; sticky "View order (n)" |
| 8 | `cart_checkout` (new) | pickup/delivery/at-table modes, tip presets, promo on | orders: identity-before-payment, `pickup_selector`, promo (`posReprice`), payment → receipt | bottom sheet cart → full-screen checkout; desktop side panel |
| 9 | `service_collection` (new) | serviceIds/all, layout, showFrom price | catalog services reader; CTA → appointment_picker | cards with "from $" and Book |
| 10 | `package_selector` (new) | packageIds | packages + components (WIRE-2.11) → order | comparison cards; desktop table |
| 11 | `order_lookup` (new) | title | order/ticket lookup by code+e-mail; `/ticket/<code>` actions (transfer/resend) | code + e-mail → status card |
| 12 | `pay_link_landing` (route exists `/pay/<code>`; block = "Pay a link" CTA) | none | payments links | amount card → pay |
| 13 | `chat_with_us` (new) | greeting, hours, channels (thread/WhatsApp link) | messaging-engine: create thread → `/c/t/<token>`; payment request card renders | floating button → sheet thread; desktop docked panel |
| 14 | `form` (exists; "Contact / inquiry") | fields | `submitInquiry` | stacked fields, one CTA |
| 15 | `project_brief` (new, = form preset) | brief fields, budget range | inquiry → project (agreement/milestones later) | wizard 3 steps |
| 16 | `team` / `featured_talent` / `directory` (exist) | as today + "Book with" CTA → appointment_picker with staff preselected | people reader | avatar grid 2-up → 4-up |
| 17 | `reviews` (new, light) | source (workspace reviews), count, layout | reviews reader | carousel → grid |
| 18 | `location_hours` / `location_map` (exist) | multi-location | locations/zones/service periods (WIRE-3.1/3.4) | stacked cards → map + list |
| 19 | `qr_code` (exists) | target | links engine | — |
| 20 | `portal_entry` (new) | label | customer sign-in → my bookings/tickets/orders | button → sheet |
| 21 | `membership` / `gift_card` / `credit_wallet` | **do not ship** (engine partial) | — | design only, flagged "coming soon" in builder |
| 22 | `guest_order` (at-table) | reached by QR `/visit/<token>` not a page block; the block is `qr_code` pointing at the table | visits engine | — |

## Ownership and order (today)
- **Mockups/templates agent** ("Tulala workspace admin dashboard mockups on boarding"): visual design + island UI for 2, 3, 5-seat_map, 7-catalog_grid, 8, 13, then 6/9/10/11/17/20; registry entries + propsSchema + add-gallery cards + business-components defaults (so new sites get the blocks by business type); Look-token compliance; mobile + desktop screenshots per state.
- **Program session (me)**: `lib/storefront/*.server.ts` reader/action seams per widget with unit tests; guest identity + refusal mapping; QA proof on the isolated host (Playwright row per widget: place through the builder on El Paisa/fixture, use it on a phone viewport, DB ground truth). Branch `work/storefront-seams`. Contract per seam: `read<Widget>(tenantId, props) → {ok, data} | {ok:false, reason}`; `act<Widget>(input, expectedVersion?) → {ok, …} | {ok:false, reason: "full"|"past"|"conflict"|"identity_required"|"refused", message}`.
- Merge rule: PR → four green checks → normal merge; the seams PR lands first, the UI PR rebases on it. Never admin-merge; never `db:push`; never the shared checkout.
