/**
 * Read-back checks for the failed-cards fixtures: what Verify will see, asserted inside the same
 * transaction right after the writes (selftest) or before COMMIT (apply). Counts and states only.
 */
import { fcId } from "./failed-cards-guards.mjs";
import { G6 } from "./failed-cards-ops.mjs";
import { G_EVENT_SEATS, G_PROMO_CODE } from "./failed-cards-plan-g.mjs";
import { G6_HIDDEN_KEY, G6_MAX_PER_ORDER, G7_DEPOSIT_CENTS_PER_PERSON, G7_DEPOSIT_FROM_PARTY, G7_DISPLAY_CURRENCY, G8_CANCEL_FREE_HOURS } from "./failed-cards-plan-g2.mjs";
import { CONCIERGE_SLUG, F3_DOMAIN_KEYS, F3_ROSTER_KEYS, F3_STUDIO_SERVICE_KEYS, LONG_TALENT_NAME } from "./failed-cards-plan-sites.mjs";

/**
 * SCOPING RULE: a read-back counts ITS OWN fixture ids, never "everything in the tenant / venue / workspace": several clusters
 * share the F3 studio (G1-G8), and a tenant-wide count moves the moment another cluster adds a row. The expected number is the
 * length of the id list, so it is derived from the plan's own keys and cannot drift from them.
 */
const F2_ROSTER_IDS = [fcId("roster:f2:t1:studio"), fcId("roster:f2:t1:studio2")];
const F3_ROSTER_IDS = F3_ROSTER_KEYS.map(fcId);
const F3_DOMAIN_IDS = F3_DOMAIN_KEYS.map(fcId);
const F3_SERVICE_IDS = F3_STUDIO_SERVICE_KEYS.map((k) => fcId(`offering:${k}`));

const CHECKS = {
  F1: [
    ["guest offer thread: inquiry offer_pending with a sent $300 MXN offer",
      "select count(*)::int n from public.inquiries i join public.inquiry_offers o on o.id = i.current_offer_id where i.id = $1 and i.status = 'offer_pending' and o.status = 'sent' and o.total_client_price = 300 and o.currency_code = 'MXN' and i.client_user_id is null",
      [fcId("inquiry:f1")], 1],
    ["guest offer thread: 3 private messages incl. the offer card", "select count(*)::int n from public.inquiry_messages where inquiry_id = $1 and thread_type = 'private'", [fcId("inquiry:f1")], 3],
  ],
  F2: [
    ["group thread: 2 talent + 1 client + 1 coordinator participants", "select count(*)::int n from public.inquiry_participants where inquiry_id = $1 and status <> 'removed'", [fcId("inquiry:f2")], 4],
    ["group thread: T1 in 2 non-hub rosters (Agency filter)", "select count(*)::int n from public.agency_talent_roster where id = any($1::uuid[]) and talent_profile_id = $2 and status = 'active'", [F2_ROSTER_IDS, G6.t1], F2_ROSTER_IDS.length],
    ["group thread: original request text set", "select count(*)::int n from public.inquiries where id = $1 and length(trim(message)) > 0", [fcId("inquiry:f2")], 1],
  ],
  F3: [
    ["studio: plan_tier studio, MXN, ES identity", "select count(*)::int n from public.agencies a join public.agency_business_identity b on b.tenant_id = a.id where a.id = $1 and a.plan_tier = 'studio' and a.default_currency = 'MXN' and b.default_locale = 'es'", [fcId("workspace:f3")], 1],
    ["studio: 2 site-visible roster talents (F3's own roster rows)", "select count(*)::int n from public.agency_talent_roster r join public.talent_profiles t on t.id = r.talent_profile_id where r.id = any($1::uuid[]) and r.agency_visibility = 'site_visible' and r.status = 'active'", [F3_ROSTER_IDS], F3_ROSTER_IDS.length],
    ["studio: long-name talent present", "select count(*)::int n from public.talent_profiles where id = $1 and length(display_name) >= 40 and display_name = $2", [fcId("talent:f3-a"), LONG_TALENT_NAME], 1],
    // By F3's OWN service ids, never by tenant: G8 adds a 4th priced service with a photo to this studio and must not move F3's count.
    ["studio: F3's published priced services with a photo", "select count(distinct o.id)::int n from public.talent_offerings o join public.talent_offering_media m on m.offering_id = o.id where o.id = any($1::uuid[]) and o.status = 'published' and o.amount_cents > 0 and o.duration_minutes > 0", [F3_SERVICE_IDS], F3_SERVICE_IDS.length],
    ["studio: Mon-Sat hours rows for both roster talents", "select count(*)::int n from public.talent_booking_hours where talent_profile_id = any($1::uuid[]) and timezone = 'America/Cancun'", [[fcId("talent:f3-a"), fcId("talent:f3-b")]], 2],
    ["studio: subdomain (active) + custom domain (unverified)", "select count(*)::int n from public.agency_domains where id = any($1::uuid[]) and ((kind = 'subdomain' and status = 'active') or (kind = 'custom' and status = 'dns_verification_sent' and verified_at is null))", [F3_DOMAIN_IDS], F3_DOMAIN_IDS.length],
    ["studio: logo + accent", "select count(*)::int n from public.agency_branding where tenant_id = $1 and accent_color is not null and theme_json ? 'logo_url'", [fcId("workspace:f3")], 1],
    ["T1/T2 services pages with a services_catalog block", "select count(*)::int n from public.talent_pages where id = any($1::uuid[]) and status = 'published' and blocks_published::text like '%services_catalog%'", [[fcId("page:f3:t1:servicios"), fcId("page:f3:t2:servicios")]], 2],
    ["T2 non-QA services: one public priced with a photo, one on_request without price", "select count(*)::int n from public.talent_offerings o where o.id = any($1::uuid[]) and o.status = 'published' and ((o.visibility = 'public' and o.amount_cents > 0 and exists (select 1 from public.talent_offering_media m where m.offering_id = o.id)) or (o.visibility = 'on_request' and o.amount_cents is null))", [[fcId("offering:f3-t2-lampara"), fcId("offering:f3-t2-revision")]], 2],
    ["empty-state twin: published service, no hours row", "select (select count(*) from public.talent_offerings where id = $1 and status = 'published')::int - (select count(*) from public.talent_booking_hours where talent_profile_id = $2)::int n", [fcId("offering:f3-c-estandar"), fcId("talent:f3-c")], 1],
  ],
  F5: [
    ["promos: 6 on T1 (scoped by talent_profile_id)", "select count(*)::int n from public.tenant_promo_codes where talent_profile_id = $1 and id = any($2::uuid[])", [G6.t1, ["t1-public", "t1-code", "t1-new-clients", "t1-first3", "t1-countdown", "t1-expired"].map((k) => fcId(`promo:${k}`))], 6],
    ["promos: T2 promo is not on T1 (no bleed)", "select count(*)::int n from public.tenant_promo_codes where id = $1 and talent_profile_id = $2", [fcId("promo:t2-public"), G6.t2], 1],
    ["promos: page with promo blocks on T1", "select count(*)::int n from public.talent_pages where id = $1 and blocks_published::text like '%\"kind\": \"promo\"%'", [fcId("page:f5:promos")], 1],
  ],
  F6: [
    ["builder lab: 2 designs released v1 (published) with one open draft each", "select count(*)::int n from public.talent_theme_releases r join public.talent_theme_drafts d on d.design = r.design_slug and d.status = 'open' where r.id = any($1::uuid[]) and r.status = 'published' and r.to_version = 1", [[fcId("release:f6-copy"), fcId("release:f6-block")]], 2],
    ["builder lab: QA sites on the designs (non-demo)", "select count(*)::int n from public.talent_sites s join public.talent_profiles t on t.id = s.talent_profile_id where s.id = any($1::uuid[]) and s.theme_design_version = 1 and not t.is_demo", [[fcId("site:f6-copy"), fcId("site:f6-block")]], 2],
  ],
  F7: [
    ["padded + malformed recipients on 2 guest inquiries", "select count(*)::int n from public.inquiries where id = any($1::uuid[]) and (contact_email <> trim(contact_email) or position('@' in contact_email) = 0)", [[fcId("inquiry:f7a"), fcId("inquiry:f7b")]], 2],
  ],
  F8: [
    ["unverified client: email_confirmed_at NULL with a password", "select count(*)::int n from auth.users where id = $1 and email_confirmed_at is null and coalesce(encrypted_password, '') <> ''", [fcId("user:f8-unverified")], 1],
    ["blank-name client: profiles.display_name blank + client_profiles row", "select count(*)::int n from public.profiles p join public.client_profiles c on c.user_id = p.id where p.id = $1 and coalesce(trim(p.display_name), '') = ''", [fcId("user:f8-noname")], 1],
  ],
  F9: [["hidden service on T1 (draft)", "select count(*)::int n from public.talent_offerings where id = $1 and talent_profile_id = $2 and status = 'draft'", [fcId("offering:f9-hidden"), G6.t1], 1]],
  F10: [["area block with ES note + EN translation on T2", "select count(*)::int n from public.talent_pages where id = $1 and blocks_published::text like '%arrivalNote%' and blocks_published::text like '%\"en\"%'", [fcId("page:f10:zona")], 1]],
  F11: [["C1 hub booking on TAL-96003 linked to its inquiry", "select count(*)::int n from public.agency_bookings b join public.booking_talent bt on bt.booking_id = b.id where b.id = $1 and b.source_inquiry_id = $2 and bt.talent_profile_id = $3 and b.client_user_id = $4", [fcId("booking:f11"), fcId("inquiry:f11"), G6.tOwner, G6.uClient], 1]],
  F12: [
    ["taxonomy term Limpieza de casas", "select count(*)::int n from public.taxonomy_terms where id = $1 and name_i18n->>'es' = 'Limpieza de casas'", [fcId("term:f12")], 1],
    ["tagged talent is publicly listed", "select count(*)::int n from public.talent_profiles t join public.talent_profile_taxonomy x on x.talent_profile_id = t.id where t.id = $1 and x.taxonomy_term_id = $2 and t.is_publicly_listed", [fcId("talent:f12"), fcId("term:f12")], 1],
  ],
  F14: [
    ["concierge: one handoff then 3 guest follow-ups", "select count(*)::int n from public.inquiry_messages m where m.inquiry_id = $1 and m.sender_user_id is null and m.guest_session_id is not null and m.created_at > (select created_at from public.inquiry_messages where id = $2)", [fcId("inquiry:f14"), fcId("message:f14:handoff")], 3],
    ["concierge: the workspace's only active member is the bot mailbox", "select count(*)::int n from public.agency_memberships m join auth.users u on u.id = m.profile_id join public.agencies a on a.id = m.tenant_id where a.slug = $1 and m.status = 'active' and u.email like 'tulalaqa+qa-fixture-g6-%@mail.grokbot.com'", [CONCIERGE_SLUG], 1],
  ],
  S5: [["free-plan talent (talent_basic) with a site", "select count(*)::int n from public.talent_profiles t join public.talent_sites s on s.talent_profile_id = t.id where t.id = $1 and t.talent_plan_key = 'talent_basic'", [fcId("talent:s5-free")], 1]],
  S6: [["payout talents MX/US/CA", "select count(*)::int n from public.talent_profiles where id = any($1::uuid[]) and home_country_text in ('MX','US','CA')", [["mx", "us", "ca"].map((c) => fcId(`talent:s6-${c}`))], 3]],
  G1: [
    ["QR dish: published workspace product, no base price, 2 size options at different MXN prices", "select count(*)::int n from public.talent_offerings o where o.id = $1 and o.owner_kind = 'workspace' and o.status = 'published' and o.amount_cents is null and o.currency = 'MXN' and (select count(distinct v.amount_cents) from public.talent_offering_variants v where v.offering_id = o.id and v.amount_cents > 0) = 2", [fcId("offering:g1-cafe")], 1],
  ],
  G2: [
    ["last-piece product: stock 1, pool of 1 unit, nothing allocated", "select count(*)::int n from public.talent_offerings o join public.capacity_pools p on p.id = o.capacity_pool_id where o.id = $1 and o.inventory_qty = 1 and p.units_total = 1 and p.is_active and not exists (select 1 from public.capacity_allocations a where a.pool_id = p.id and a.state <> 'released')", [fcId("offering:g2-pay")], 1],
  ],
  G3: [
    ["second staff login: confirmed, manager membership on the studio (no refund capability), password set", "select count(*)::int n from public.agency_memberships m join auth.users u on u.id = m.profile_id where m.tenant_id = $1 and m.profile_id = $2 and m.role = 'manager' and m.status = 'active' and u.email_confirmed_at is not null and coalesce(u.encrypted_password, '') <> ''", [fcId("workspace:f3"), fcId("user:g3-manager")], 1],
    ["the studio's owner is still the F3 owner membership (the DB allows one active owner per workspace)", "select count(*)::int n from public.agency_memberships where id = $1 and role = 'owner' and status = 'active'", [fcId("membership:f3")], 1],
  ],
  G4: [
    ["event: published, one scheduled night, one visible tier with seats " + G_EVENT_SEATS, "select count(*)::int n from public.events e join public.sessions s on s.event_id = e.id and s.status = 'scheduled' join public.talent_offering_variants v on v.offering_id = e.offering_id and not v.is_hidden join public.capacity_pools p on p.subject_kind = 'session_tier' and p.subject_id = s.id and p.pool_key = v.pool_key where e.id = $1 and e.status = 'published' and p.units_total = $2 and p.is_active and s.starts_at > now()", [fcId("event:g4"), G_EVENT_SEATS], 1],
    ["promo " + G_PROMO_CODE + ": event-scoped, 1 use, unused", "select count(*)::int n from public.tenant_promo_codes c where c.id = $1 and c.event_id = $2 and c.max_redemptions = 1 and c.is_active and not c.is_draft and not c.is_paused and not exists (select 1 from public.tenant_promo_redemptions r where r.promo_code_id = c.id)", [fcId("promo:g4-salsa"), fcId("event:g4")], 1],
  ],
  G5: [
    ["free-plan workspace: owner is the studio owner, no workspace_subscriptions row", "select count(*)::int n from public.agencies a join public.agency_memberships m on m.tenant_id = a.id and m.role = 'owner' and m.status = 'active' where a.id = $1 and a.plan_tier = 'free' and m.profile_id = $2 and not exists (select 1 from public.workspace_subscriptions w where w.tenant_id = a.id)", [fcId("workspace:g5-free"), fcId("user:f3-owner")], 1],
  ],
  G6: [
    ["tiered event: published, 2 scheduled nights, 2 public tiers + 1 hidden tier (max/order >= 4)", "select count(*)::int n from public.events e where e.id = $1 and e.status = 'published' and (select count(*) from public.sessions s where s.event_id = e.id and s.status = 'scheduled' and s.starts_at > now()) = 2 and (select count(*) from public.talent_offering_variants v where v.offering_id = e.offering_id and not v.is_hidden and v.max_per_order >= $2) = 2 and (select count(*) from public.talent_offering_variants v where v.offering_id = e.offering_id and v.is_hidden and v.pool_key = $3 and v.amount_cents = 0) = 1", [fcId("event:g6"), G6_MAX_PER_ORDER, G6_HIDDEN_KEY], 1],
    ["tiered event: 6 active pools (3 tiers x 2 nights), each public tier holds >= 6 seats", "select count(*)::int n from public.capacity_pools p join public.sessions s on s.id = p.subject_id where p.subject_kind = 'session_tier' and s.event_id = $1 and p.is_active and p.units_total >= 4 and (p.pool_key = $2 or p.units_total >= 6)", [fcId("event:g6"), G6_HIDDEN_KEY], 6],
  ],
  G7: [
    ["reservations on: default venue, rules active, MXN 100/person from a party of 6, offering linked", "select count(*)::int n from public.venues v join public.venue_service_rules r on r.venue_id = v.id where v.id = $1 and v.is_default and r.is_active and r.deposit_from_party = $2 and r.deposit_cents_per_person = $3 and r.reservation_offering_id = $4", [fcId("venue:g7"), G7_DEPOSIT_FROM_PARTY, G7_DEPOSIT_CENTS_PER_PERSON, fcId("offering:g7-mesa")], 1],
    ["reservations: a dinner window and a pooled party band that seats 6", "select count(distinct g.id)::int n from public.venue_service_windows w join public.space_groups g on g.venue_id = w.venue_id and g.party_min <= 6 and g.party_max >= 6 and g.kind = 'party_band' and g.sell_mode = 'band' join public.capacity_pools p on p.subject_kind = 'space_group' and p.subject_id = g.id and p.is_active and p.units_total > 0 where w.venue_id = $1 and w.is_active", [fcId("venue:g7")], 1],
    ["workspace display currency is MXN (settings.display_currency)", "select count(*)::int n from public.agencies where id = $1 and settings->>'display_currency' = $2", [fcId("workspace:f3"), G7_DISPLAY_CURRENCY], 1],
  ],
  G8: [
    ["prepaid instant service: published, priced, 48 h free cancel, on a roster talent with hours", "select count(*)::int n from public.talent_offerings o join public.talent_booking_hours h on h.talent_profile_id = o.talent_profile_id where o.id = $1 and o.status = 'published' and o.booking_mode = 'instant' and o.reserve_mode = 'full' and o.amount_cents > 0 and o.cancellation_hours = $2", [fcId("offering:g8-expres"), G8_CANCEL_FREE_HOURS], 1],
  ],
};

export async function readBack(q, fixtures) {
  const lines = [];
  let failures = 0;
  for (const f of fixtures) {
    for (const [label, sql, params, want] of CHECKS[f] ?? []) {
      const n = (await q(sql, params)).rows[0]?.n ?? 0;
      const ok = n === want;
      if (!ok) failures += 1;
      lines.push(`${ok ? "PASS" : "FAIL"} ${f.padEnd(3)} ${label} (${n}/${want})`);
    }
  }
  return { lines, failures };
}

export const READBACK_FIXTURES = Object.keys(CHECKS);
/** For tests: the checks as [label, sql, params, want] per fixture. */
export const READBACK_CHECKS = CHECKS;
