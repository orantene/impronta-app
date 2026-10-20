/**
 * Read-back checks for the Stage 2 fixtures, run inside the same transaction right after the writes (selftest) or before COMMIT.
 * Counts and states only; never a credential.
 */
import { s2Id } from "./stage2-guards.mjs";

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
    ["cashier holds no refund-capable role (editor), manager has a PIN hash", "select count(*)::int n from public.agency_memberships m join public.agencies a on a.id = m.tenant_id where m.tenant_id = $1 and m.profile_id = $2 and m.role = 'editor' and a.settings #>> array['people','pins', $3::text] is null and a.settings #>> array['people','pins', $4::text] is not null", [T1, s2Id("user:t1-cashier"), s2Id("user:t1-cashier"), s2Id("user:t1-manager")], 1],
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
CHECKS.EV = [
  ["DJ Fridays: 12 nights; per night a total of 100 with GA 80, VIP 20 and a hidden comp as child pools", "select (select count(*) from public.sessions where event_id = $1)::int * 1000 + (select count(*) from public.capacity_pools t where t.pool_key = 'total' and t.units_total = 100 and t.subject_id in (select id from public.sessions where event_id = $1))::int * 10 + (select count(*) from public.capacity_pools c join public.capacity_pools t on t.id = c.parent_pool_id where t.pool_key = 'total' and c.pool_key in ('ga','vip','cortesia_k4') and c.units_total in (80,20,10) and t.subject_id in (select id from public.sessions where event_id = $1))::int / 36 n", [ev("dj")], 12121],
  ["DJ Fridays: hidden comp tier, GA price phases free (0) then 8000", "select (select count(*) from public.talent_offering_variants where offering_id = $1 and is_hidden and amount_cents = 0)::int * 10 + (select count(*) from public.offering_price_phases where offering_id = $1 and ((price_cents = 0 and ends_at is not null) or (price_cents = 8000 and ends_at is null)))::int n", [s2Id("offering:dj-event")], 12],
  ["free event: 0-price tier, cap 50", "select count(*)::int n from public.talent_offering_variants v join public.sessions s on s.event_id = $1 join public.capacity_pools p on p.subject_id = s.id and p.pool_key = v.pool_key where v.offering_id = $2 and v.amount_cents = 0 and p.units_total = 50", [ev("libre"), s2Id("offering:libre-event")], 1],
  ["overnight: starts 22:00 local, ends 02:00 local (4 h)", "select count(*)::int n from public.sessions where event_id = $1 and extract(hour from starts_at at time zone 'America/Cancun') = 22 and extract(hour from ends_at at time zone 'America/Cancun') = 2 and ends_at - starts_at = interval '4 hours'", [ev("noche")], 1],
  ["pool-of-1: one tier, one seat", "select count(*)::int n from public.capacity_pools p join public.sessions s on s.id = p.subject_id where s.event_id = $1 and p.units_total = 1", [ev("chef")], 1],
  ["New York series: 6 Saturdays at 21:00 local, crossing 2026-11-01 (UTC hour moves from 01 to 02)", "select (select count(*) from public.sessions where event_id = $1 and extract(hour from starts_at at time zone 'America/New_York') = 21)::int * 10 + (select count(distinct extract(hour from starts_at at time zone 'UTC')) from public.sessions where event_id = $1)::int n", [ev("ny")], 62],
  ["event offerings are workspace-owned packages (never menu items)", "select count(*)::int n from public.events e join public.talent_offerings o on o.id = e.offering_id where e.tenant_id = $1 and e.status = 'published' and o.kind = 'package' and o.owner_kind = 'workspace'", [T1], 5],
];

export async function readBack(q, sets) {
  const lines = [];
  let failures = 0;
  for (const f of sets) {
    for (const [label, sql, params, want] of CHECKS[f] ?? []) {
      const n = (await q(sql, params)).rows[0]?.n ?? 0;
      const ok = n === want;
      if (!ok) failures += 1;
      lines.push(`${ok ? "PASS" : "FAIL"} ${f.padEnd(3)} ${label} (${n}/${want})`);
    }
  }
  return { lines, failures };
}
