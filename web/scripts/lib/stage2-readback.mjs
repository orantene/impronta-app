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
