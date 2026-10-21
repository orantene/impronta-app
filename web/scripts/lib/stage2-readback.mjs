/**
 * Read-back checks for the Stage 2 fixtures, run inside the same transaction right after the writes (selftest) or before COMMIT.
 * Counts and states only; never a credential.
 */
import { s2Id } from "./stage2-guards.mjs";
import { POSTS_HOST, POST_TOPICS, REVIEW_BOOKINGS, SLUG_ROWS, TALENT_SITE_SLUG } from "./stage2-plan-content.mjs";

const T1 = s2Id("workspace:t1");
const T2 = s2Id("workspace:t2");
const o = (k) => s2Id(`offering:${k}`);

export const CHECKS = {
  T1: [
    ["workspace: business type, website plan, MXN display currency, restaurant", "select count(*)::int n from public.agencies where id = $1 and workspace_type = 'business' and plan_tier = 'website' and settings->>'display_currency' = 'MXN' and settings->>'business_type_id' = 'restaurant'", [T1], 1],
    ["venues: A America/Cancun (default), B UTC default, C America/New_York", "select count(*)::int n from public.venues where tenant_id = $1 and ((id = $2 and timezone = 'America/Cancun' and is_default) or (id = $3 and timezone = 'UTC' and not is_default) or (id = $4 and timezone = 'America/New_York' and not is_default))", [T1, s2Id("venue:t1-a"), s2Id("venue:t1-b"), s2Id("venue:t1-c")], 3],
    ["reservation rules: deposit from party 6, 10000c per person, no-show fee, 24h free cancel", "select count(*)::int n from public.venue_service_rules where venue_id = $1 and is_active and deposit_from_party = 6 and deposit_cents_per_person = 10000 and no_show_fee_cents > 0 and free_cancel_hours = 24 and reservation_offering_id = $2", [s2Id("venue:t1-a"), o("t1-reserva")], 1],
    ["floor: tables T1-T4 + bar area, kitchen + bar stations", "select (select count(*) from public.spaces where tenant_id = $1 and venue_id = $2)::int + (select count(*) from public.prep_stations where tenant_id = $1 and kind in ('kitchen','bar'))::int n", [T1, s2Id("venue:t1-a")], 7],
    ["QR: 4 table codes + 1 generic menu code; 1 open and 1 closed visit", "select (select count(*) from public.links where tenant_id = $1 and code like 's2-cantina-%')::int + (select count(*) from public.visits where tenant_id = $1 and ((status = 'open') or (status = 'closed' and closed_at is not null)))::int n", [T1], 7],
    ["devices: 2 POS, 1 kitchen board, 2 door; one open cash shift of MXN 500", "select (select count(*) from public.pos_devices where tenant_id = $1)::int + (select count(*) from public.pos_shifts where tenant_id = $1 and status = 'open' and opening_cash_cents = 50000)::int n", [T1], 6],
    ["staff: 9 active (owner/admin/manager/editor/viewer + cashier/kitchen/door/host), 1 pending invitee, 1 suspended", "select (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'active')::int * 100 + (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'invited')::int * 10 + (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'suspended')::int n", [T1], 911],
    ["cashier holds no refund-capable role (editor)", "select count(*)::int n from public.agency_memberships where tenant_id = $1 and profile_id = $2 and role = 'editor'", [T1, s2Id("user:t1-cashier")], 1],
    ["manager PIN: one staff_pin_hashes row for the manager (made by pos_set_staff_pin), none for the cashier, no settings.people.pins key", "select (select count(*) from public.staff_pin_hashes where tenant_id = $1 and user_id = $2)::int * 10 + (select count(*) from public.staff_pin_hashes where tenant_id = $1 and user_id = $3)::int + (select count(*) from public.agencies where id = $1 and settings #> array['people','pins'] is not null)::int * 100 n", [T1, s2Id("user:t1-manager"), s2Id("user:t1-cashier")], 10, { requires: "public.staff_pin_hashes" }],
    ["role limits: 3 set rows (viewer/admin/owner unset)", "select count(*)::int n from public.role_limits where tenant_id = $1", [T1], 3],
    ["catalog: bar controls are alcoholic and excluded; 2 non-alcoholic deal items", "select (select count(*) from public.talent_offerings where tenant_id = $1 and attributes->>'alcohol' = 'true' and attributes->>'excluded_from_deals' = 'true')::int * 10 + (select count(*) from public.talent_offerings where tenant_id = $1 and attributes->>'deal' = 'true' and attributes->>'alcohol' = 'false')::int n", [T1], 32],
    ["stock: margarita pool 5, last piece 1, sold-out 0", "select count(*)::int n from public.talent_offerings o join public.capacity_pools p on p.id = o.capacity_pool_id where o.id = any($1::uuid[]) and p.units_total = o.inventory_qty and ((o.id = $2 and p.units_total = 5) or (o.id = $3 and p.units_total = 1) or (o.id = $4 and p.units_total = 0))", [[o("t1-margarita"), o("t1-ultima"), o("t1-agotado")], o("t1-margarita"), o("t1-ultima"), o("t1-agotado")], 3],
    ["sushi: 4 SKUs (1 premium), 8 piece variants, 1 add-on", "select (select count(*) from public.talent_offerings where tenant_id = $1 and category = 'Sushi')::int * 100 + (select count(*) from public.talent_offering_variants v join public.talent_offerings o on o.id = v.offering_id where o.tenant_id = $1 and o.category = 'Sushi')::int * 10 + (select count(*) from public.talent_offering_addons a join public.talent_offerings o on o.id = a.offering_id where o.tenant_id = $1 and o.category = 'Sushi')::int n", [T1], 481],
    ["hamburger: Grande option, 2 extras", "select (select count(*) from public.talent_offering_variants where offering_id = $1 and amount_cents = 15000)::int * 10 + (select count(*) from public.talent_offering_addons where offering_id = $1)::int n", [o("t1-hamburguesa")], 12],
    ["edge items: options-only null base, hidden option, on-request, draft", "select (select count(*) from public.talent_offerings where id = $1 and amount_cents is null)::int + (select count(*) from public.talent_offering_variants where offering_id = $2 and is_hidden)::int + (select count(*) from public.talent_offerings where id = $3 and visibility = 'on_request')::int + (select count(*) from public.talent_offerings where id = $4 and status = 'draft')::int n", [o("t1-opciones"), o("t1-pizza"), o("t1-banquete"), o("t1-borrador")], 4],
    ["Dinner + Show: 2 components, the event-backing package sits on a DRAFT event", "select (select count(*) from public.offering_components where offering_id = $1)::int + (select count(*) from public.events where id = $2 and status = 'draft' and offering_id = $3)::int n", [o("t1-cena-show"), s2Id("event:t1-show"), o("t1-show-evento")], 3],
  ],
  T2: [
    ["second restaurant: own workspace, 2 staff, 3 dishes, 3 QR codes, 1 open visit, promo FONDA10", "select (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'active')::int * 1000 + (select count(*) from public.talent_offerings where tenant_id = $1)::int * 100 + (select count(*) from public.links where tenant_id = $1)::int * 10 + (select count(*) from public.tenant_promo_codes where tenant_id = $1 and upper(code) = 'FONDA10')::int n", [T2], 2331],
    ["isolation: no T2 row points at a T1 station, space or venue", "select (select count(*) from public.talent_offerings o join public.prep_stations s on s.id = o.prep_station_id where o.tenant_id = $1 and s.tenant_id <> $1)::int + (select count(*) from public.links l where l.tenant_id = $1 and l.context ? 'space_id' and not exists (select 1 from public.spaces sp where sp.id = (l.context->>'space_id')::uuid and sp.tenant_id = $1))::int n", [T2], 0],
  ],
};

const T3 = s2Id("workspace:t3");
const T5 = s2Id("workspace:t5");
const ev = (k) => s2Id(`event:${k}`);

CHECKS.T3 = [
  ["agency: owner + manager, a roster talent with a login, a public talent-owned service next to a workspace-owned QR menu item", "select (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'active')::int * 1000 + (select count(*) from public.talent_profiles t join public.agency_talent_roster r on r.talent_profile_id = t.id and r.tenant_id = $1 where t.id = $2 and t.user_id is not null and t.profile_code = 'TAL-96201' and t.visibility = 'public')::int * 100 + (select count(*) from public.talent_offerings where id = $3 and owner_kind = 'talent' and talent_profile_id = $2 and visibility = 'public' and status = 'published')::int * 10 + (select count(*) from public.talent_offerings where tenant_id = $1 and owner_kind = 'workspace' and status = 'published')::int n", [T3, s2Id("talent:t3-valeria"), s2Id("offering:t3-sesion")], 2111],
  ["venue table QR: table code, generic menu code, one open visit", "select (select count(*) from public.links where tenant_id = $1)::int * 10 + (select count(*) from public.visits where tenant_id = $1 and status = 'open')::int n", [T3], 21],
  ["TAL-93900: the fixture package is a NEW row on the hub talent (nothing else of its own changed)", "select count(*)::int n from public.talent_offerings o join public.talent_profiles t on t.id = o.talent_profile_id where o.id = $1 and t.profile_code = 'TAL-93900' and o.kind = 'package' and o.status = 'published'", [s2Id("offering:t3-hub-paquete")], 1],
];
CHECKS.T5 = [
  ["studio: owner + instructor, weekly class with 8 nights, an instructor on each, 12 paid seats each", "select (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'active')::int * 1000 + (select count(*) from public.sessions where tenant_id = $1 and series_id = $2 and instructor_user_id = $3 and status = 'scheduled')::int * 10 + (select count(*) from public.capacity_pools p join public.sessions s on s.id = p.subject_id where s.series_id = $2 and p.units_total = 12 and p.pool_key = 'default')::int / 8 n", [T5, s2Id("series:clase"), s2Id("user:t5-instructor")], 2081],
];
const T4 = s2Id("workspace:t4");
CHECKS.T4 = [
  ["US salon: USD, New York, English first, owner + reception, 2 roster stylists (one with a login) with Mon-Sat hours", "select (select count(*) from public.agencies where id = $1 and default_currency = 'USD' and timezone = 'America/New_York' and settings->>'display_currency' = 'USD')::int * 10000 + (select count(*) from public.agency_memberships where tenant_id = $1 and status = 'active')::int * 1000 + (select count(*) from public.agency_talent_roster r join public.talent_profiles t on t.id = r.talent_profile_id where r.tenant_id = $1 and t.profile_code in ('TAL-96202','TAL-96203'))::int * 100 + (select count(*) from public.talent_booking_hours where tenant_id = $1 and timezone = 'America/New_York')::int * 10 + (select count(*) from public.talent_profiles where id = $2 and user_id is not null)::int n", [T4, s2Id("talent:t4-maya")], 12221],
  ["US salon: 5 public services priced in USD (4 exact + 1 from-price)", "select count(*)::int n from public.talent_offerings where tenant_id = $1 and owner_kind = 'talent' and currency = 'USD' and status = 'published' and visibility = 'public' and amount_cents > 0", [T4], 5],
  ["from-price service: price_display 'from', request booking (a CHECK forbids instant), USD 150", "select count(*)::int n from public.talent_offerings where id = $1 and price_display = 'from' and booking_mode = 'request' and amount_cents = 15000 and currency = 'USD'", [o("t4-bridal-trial")], 1],
];
CHECKS.T5X = [
  ["drink deal: 2 non-alcoholic deal items + the class + smoothie package with 2 components", "select (select count(*) from public.talent_offerings where tenant_id = $1 and attributes->>'deal' = 'true' and attributes->>'alcohol' = 'false')::int * 10 + (select count(*) from public.offering_components where offering_id = $2)::int n", [T5, s2Id("offering:clase-smoothie")], 32],
  ["tour: one departure, 12 seats, early-bird phase then regular phase on the tier", "select (select count(*) from public.capacity_pools p join public.sessions s on s.id = p.subject_id where s.event_id = $1 and p.units_total = 12)::int * 100 + (select count(*) from public.offering_price_phases where variant_id = $2 and price_cents = 75000 and ends_at is not null)::int * 10 + (select count(*) from public.offering_price_phases where variant_id = $2 and price_cents = 90000 and ends_at is null)::int n", [s2Id("event:tour"), s2Id("variant:tour-tier")], 111],
  ["beach club: 3 beds with a minimum spend, an assigned tier group holding all of them, one pool each", "select (select count(*) from public.spaces where venue_id = $1 and kind = 'bed' and min_spend_cents = 150000)::int * 100 + (select count(*) from public.space_group_members where group_id = $2)::int * 10 + (select count(*) from public.capacity_pools p join public.spaces s on s.id = p.subject_id where p.subject_kind = 'space' and s.venue_id = $1 and p.units_total = 1)::int n", [s2Id("venue:t5-playa"), s2Id("group:t5-camas")], 333],
];
CHECKS.T5.push(...CHECKS.T5X);
delete CHECKS.T5X;
CHECKS.EV = [
  ["DJ Fridays: 12 nights; per night a total of 100 with GA 80, VIP 20 and a hidden comp as child pools", "select (select count(*) from public.sessions where event_id = $1)::int * 1000 + (select count(*) from public.capacity_pools t where t.pool_key = 'total' and t.units_total = 100 and t.subject_id in (select id from public.sessions where event_id = $1))::int * 10 + (select count(*) from public.capacity_pools c join public.capacity_pools t on t.id = c.parent_pool_id where t.pool_key = 'total' and c.pool_key in ('ga','vip','cortesia_k4') and c.units_total in (80,20,10) and t.subject_id in (select id from public.sessions where event_id = $1))::int / 36 n", [ev("dj")], 12121],
  ["DJ Fridays: hidden comp tier, GA price phases free (0) then 8000", "select (select count(*) from public.talent_offering_variants where offering_id = $1 and is_hidden and amount_cents = 0)::int * 10 + (select count(*) from public.offering_price_phases where offering_id = $1 and ((price_cents = 0 and ends_at is not null) or (price_cents = 8000 and ends_at is null)))::int n", [s2Id("offering:dj-event")], 12],
  ["free event: 0-price tier, cap 50", "select count(*)::int n from public.talent_offering_variants v join public.sessions s on s.event_id = $1 join public.capacity_pools p on p.subject_id = s.id and p.pool_key = v.pool_key where v.offering_id = $2 and v.amount_cents = 0 and p.units_total = 50", [ev("libre"), s2Id("offering:libre-event")], 1],
  ["overnight: starts 22:00 local, ends 02:00 local (4 h)", "select count(*)::int n from public.sessions where event_id = $1 and extract(hour from starts_at at time zone 'America/Cancun') = 22 and extract(hour from ends_at at time zone 'America/Cancun') = 2 and ends_at - starts_at = interval '4 hours'", [ev("noche")], 1],
  ["pool-of-1: one tier, one seat", "select count(*)::int n from public.capacity_pools p join public.sessions s on s.id = p.subject_id where s.event_id = $1 and p.units_total = 1", [ev("chef")], 1],
  ["New York series: 6 Saturdays at 21:00 local, crossing 2026-11-01 (UTC hour moves from 01 to 02)", "select (select count(*) from public.sessions where event_id = $1 and extract(hour from starts_at at time zone 'America/New_York') = 21)::int * 10 + (select count(distinct extract(hour from starts_at at time zone 'UTC')) from public.sessions where event_id = $1)::int n", [ev("ny")], 62],
  ["event offerings are workspace-owned packages (never menu items)", "select count(*)::int n from public.events e join public.talent_offerings o on o.id = e.offering_id where e.tenant_id = $1 and e.status = 'published' and o.kind = 'package' and o.owner_kind = 'workspace'", [T1], 5],
];

const pr = (k) => s2Id(`promo:${k}`);
CHECKS.PR = [
  ["promos on T1: 15 rows, 10 with a code", "select (select count(*) from public.tenant_promo_codes where tenant_id = $1)::int * 100 + (select count(*) from public.tenant_promo_codes where tenant_id = $1 and code is not null)::int n", [T1], 1510],
  ["race codes: RACE1 capped at 1, RACE3 at 3", "select count(*)::int n from public.tenant_promo_codes where tenant_id = $1 and ((upper(code) = 'RACE1' and max_redemptions = 1) or (upper(code) = 'RACE3' and max_redemptions = 3))", [T1], 2],
  ["Monday burrito: fixed price 3000 on the burrito only, Mondays", "select count(*)::int n from public.tenant_promo_codes p join public.promo_targets t on t.promo_id = p.id where p.id = $1 and p.offer_kind = 'fixed_price' and p.value = 3000 and p.weekdays = array[1]::smallint[] and t.target_id = $2", [pr("t1-lunes-burrito"), s2Id("offering:t1-burrito")], 1],
  ["30% whole menu: cap 200, MXN 5,000 budget, targets present and none is alcoholic", "select (select count(*) from public.tenant_promo_codes where id = $1 and max_redemptions = 200 and budget_cap_cents = 500000)::int * 100 + (select (count(*) > 0)::int from public.promo_targets where promo_id = $1) * 10 + (select (count(*) = 0)::int from public.promo_targets t join public.talent_offerings o on o.id = t.target_id where t.promo_id = $1 and o.attributes->>'alcohol' = 'true') n", [pr("t1-menu30")], 111],
  ["happy hour (T1 + T5): 4 targets, every one non-alcoholic", "select (select count(*) from public.promo_targets where promo_id = any($1::uuid[]))::int * 10 + (select count(*) from public.promo_targets t join public.talent_offerings o on o.id = t.target_id where t.promo_id = any($1::uuid[]) and o.attributes->>'alcohol' <> 'false')::int n", [[pr("t1-happy"), pr("t5-happy")]], 40],
  ["states: paused, expired, paid-plan-only (audience, no end), variant-scoped, legacy event_id", "select (select count(*) from public.tenant_promo_codes where id = $1 and is_paused)::int + (select count(*) from public.tenant_promo_codes where id = $2 and ends_at < now())::int + (select count(*) from public.tenant_promo_codes where id = $3 and audience = 'new_clients' and unlock = 'auto' and ends_at is null)::int + (select count(*) from public.tenant_promo_codes where id = $4 and event_id is not null and variant_id is not null)::int + (select count(*) from public.tenant_promo_codes where id = $5 and event_id is not null and variant_id is null)::int n", [pr("t1-paused"), pr("t1-expired"), pr("t1-nuevos"), pr("t1-vip-dj"), pr("t1-legacy-event")], 5],
];
CHECKS.CU = [
  ["customers: T1 has 6, the shared email is in both the T3 agency and the T4 salon, the household phone sits on one row", "select (select count(*) from public.customers where tenant_id = $1)::int * 100 + (select count(*) from public.customers where tenant_id = any($2::uuid[]) and email = $3)::int * 10 + (select count(*) from public.customers where tenant_id = $1 and phone_e164 = $4)::int n", [T1, [T3, T4], "s2-c-shared@example.test", "+529981230001"], 621],
  ["unsubscribe: a guest_email_unsubscribes row (unsubscribed) plus the matching customer", "select count(*)::int n from public.guest_email_unsubscribes u join public.customers c on lower(c.email::text) = u.email_normalized where u.email_normalized = 's2-c-unsub@example.test' and u.unsubscribed_at is not null and c.tenant_id = $1", [T1], 1],
  ["account deletion: a confirmed login with a pending request already past its grace", "select count(*)::int n from public.account_deletion_requests r join auth.users u on u.id = r.user_id where r.id = $1 and r.status = 'pending' and r.scheduled_for < now() and u.email_confirmed_at is not null", [s2Id("deletion:c-delete")], 1],
  ["verified account: confirmed login linked to its customer row", "select count(*)::int n from public.customers c join auth.users u on u.id = c.user_id where c.id = $1 and u.email_confirmed_at is not null", [s2Id("customer:verified")], 1],
];
CHECKS.MO = [
  ["catering inquiry: offer sent with a 30% deposit, a catalog house line, a client and a house participant", "select (select count(*) from public.inquiries i join public.inquiry_offers o on o.id = i.current_offer_id where i.id = $1 and i.tenant_id = $2 and o.status = 'sent' and o.deposit_pct = 30 and o.deposit_amount_cents = 149400)::int * 100 + (select count(*) from public.inquiry_offer_line_items where offer_id = $3 and owner_tenant_id = $2 and talent_profile_id is null and source_service_id = $4)::int * 10 + (select count(*) from public.inquiry_participants where inquiry_id = $1 and role::text in ('house','client'))::int n", [s2Id("inquiry:t1-catering"), T1, s2Id("offer:t1-catering"), s2Id("offering:t1-tacos-exp")], 112],
];

const ids = (prefix, keys) => keys.map((k) => s2Id(`${prefix}:${k}`));
const slugIds = ids("slug", SLUG_ROWS.map((r) => r.key));
const postIds = POST_TOPICS.flatMap((t) => ["es", "en"].map((l) => s2Id(`post:${t.key}:${l}`)));
const enPostIds = POST_TOPICS.map((t) => s2Id(`post:${t.key}:en`));
const bookingIds = ids("booking", REVIEW_BOOKINGS.map((b) => b.key));
const reviewIds = ids("review", REVIEW_BOOKINGS.map((b) => b.key));
const HISTORY = SLUG_ROWS.filter((r) => r.current === false).length;
const SLUGS_HELD = { requires: "public.offering_slugs", migration: "20261231418800" };

// Every content check is scoped to this seed's own ids (never "all rows of the tenant"), so a tester's extra row cannot move a count.
CHECKS.SL = [
  ["service slugs: every seeded row exists (current + one history row)", "select count(*)::int n from public.offering_slugs where id = any($1::uuid[])", [slugIds], SLUG_ROWS.length, SLUGS_HELD],
  ["service slugs: two history (not current) rows, the rest current", "select (select count(*) from public.offering_slugs where id = any($1::uuid[]) and not is_current)::int * 100 + (select count(*) from public.offering_slugs where id = any($1::uuid[]) and is_current)::int n", [slugIds], HISTORY * 100 + SLUG_ROWS.length - HISTORY, SLUGS_HELD],
  ["talent site: Valeria Costa's site resolves through talent_site_subdomain_lookup (published, visible talent), non-demo", `select count(*)::int n from public.talent_site_subdomain_lookup('${TALENT_SITE_SLUG}') l where l.talent_profile_id = $1 and l.is_demo = false`, [s2Id("talent:t3-valeria")], 1, SLUGS_HELD],
  ["talent site: a published home page and the old slug has a current slug to redirect to", "select (select count(*) from public.talent_pages where talent_profile_id = $1 and slug = 'home' and status = 'published')::int * 10 + (select count(*) from public.offering_slugs o join public.offering_slugs c on c.offering_id = o.offering_id and c.locale = o.locale and c.is_current where o.id = $2 and not o.is_current and c.slug = 'sesion-de-fotos')::int n", [s2Id("talent:t3-valeria"), s2Id("slug:t3-sesion-old")], 11, SLUGS_HELD],
  ["service slugs: each row's scope is the owner of the service it points at", "select count(*)::int n from public.offering_slugs s join public.talent_offerings o on o.id = s.offering_id where s.id = any($1::uuid[]) and (s.owner_scope = 't:' || o.talent_profile_id::text or s.owner_scope = 'w:' || o.tenant_id::text)", [slugIds], SLUG_ROWS.length, SLUGS_HELD],
];
CHECKS.RV = [
  ["history bookings: 3 completed + paid, marked pre-made, no source inquiry, no order", "select count(*)::int n from public.agency_bookings where id = any($1::uuid[]) and tenant_id = $2 and status = 'completed' and payment_status = 'paid' and source_inquiry_id is null and order_id is null and internal_notes like 'Pre-made history%'", [bookingIds, T4], 3],
  ["history bookings carry no payment or transaction row", "select count(*)::int n from public.booking_transactions where booking_id = any($1::uuid[])", [bookingIds], 0],
  ["client reviews: 3 published (ratings 5, 4, 5), written by the stylist's login about the seed client", "select (select count(*) from public.client_reviews where id = any($1::uuid[]) and status = 'published' and author_user_id = $2 and author_talent_profile_id = $3 and client_user_id = $4)::int * 100 + (select coalesce(sum(rating), 0) from public.client_reviews where id = any($1::uuid[]))::int n", [reviewIds, s2Id("user:t4-stylist"), s2Id("talent:t4-maya"), s2Id("user:rv-client")], 314],
  ["client reviews: each history booking has exactly one booking_talent line for the reviewed stylist", "select count(*)::int n from public.booking_talent where booking_id = any($1::uuid[]) and talent_profile_id = $2", [bookingIds, s2Id("talent:t4-maya")], 3],
];
CHECKS.PO = [
  ["blog posts: 8 published on T1 (4 ES + 4 EN), listed, not taken down, and T1 has its active staging host", `select (select count(*) from public.cms_posts where id = any($1::uuid[]) and tenant_id = $2 and status = 'published' and taken_down_at is null and not is_unlisted and published_at <= now())::int * 10 + (select count(*) from public.agency_domains where tenant_id = $2 and hostname = '${POSTS_HOST}' and status = 'active')::int n`, [postIds, T1], 81],
  ["blog posts: each EN twin links to its ES original (hreflang)", "select count(*)::int n from public.cms_posts p join public.cms_posts es on es.id = p.translation_of where p.id = any($1::uuid[]) and p.locale = 'en' and es.locale = 'es' and es.tenant_id = p.tenant_id", [enPostIds], 4],
  ["blog posts: an FAQ block in each booking-guide post, a service block in each music post", `select (select count(*) from public.cms_posts where id = any($1::uuid[]) and body_blocks @> '[{"type":"faq"}]'::jsonb)::int * 10 + (select count(*) from public.cms_posts where id = any($1::uuid[]) and body_blocks @> '[{"type":"service"}]'::jsonb)::int n`, [postIds], 22],
  ["blog posts: every post has a category and tags; no slug says QA / test / E2E", "select count(*)::int n from public.cms_posts where id = any($1::uuid[]) and category_id is not null and cardinality(tags) > 0 and slug !~* '(qa|test|e2e)'", [postIds], 8],
];

export async function readBack(q, sets) {
  const lines = [];
  let failures = 0;
  for (const f of sets) {
    for (const [label, sql, params, want, opts] of CHECKS[f] ?? []) {
      if (opts?.requires && !(await q("select to_regclass($1) is not null e", [opts.requires])).rows[0].e) {
        lines.push(`SKIP ${f.padEnd(3)} ${label} (${opts.requires} does not exist on this database: migration ${opts.migration ?? "20261231423900"} not applied)`);
        continue;
      }
      const n = (await q(sql, params)).rows[0]?.n ?? 0;
      const ok = n === want;
      if (!ok) failures += 1;
      lines.push(`${ok ? "PASS" : "FAIL"} ${f.padEnd(3)} ${label} (${n}/${want})`);
    }
  }
  return { lines, failures };
}
