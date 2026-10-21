import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { s2Id } from "./stage2-guards.mjs";
import { NOT_FK, dependencies, forwardReferences, orderOps } from "./stage2-order.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const plan = (only = null) => buildStage2Plan(resolveStage2(only), { now: NOW, has: () => true, hub: HUB });

/**
 * Every column that holds another planned row's id, with the table it references. Maintained by hand from the FK constraints in
 * supabase/migrations on main (venue_service_rules_reservation_offering_id_fkey, capacity_pools.parent_pool_id, talent_offerings.capacity_pool_id,
 * events.series_id, sessions.event_id, space_group_members, visits.space_id RESTRICT, offering_components.component_offering_id RESTRICT, ...).
 * A new id-valued column that is not listed here fails the test below, which is the prompt to read its constraint and list it.
 */
const FK = {
  "public.agency_memberships.tenant_id": "public.agencies", "public.agency_memberships.profile_id": "auth.users",
  "public.agency_business_identity.tenant_id": "public.agencies", "public.agency_domains.tenant_id": "public.agencies",
  "public.role_limits.tenant_id": "public.agencies",
  "public.venues.tenant_id": "public.agencies",
  "public.venue_service_rules.venue_id": "public.venues", "public.venue_service_rules.tenant_id": "public.agencies",
  "public.venue_service_rules.reservation_offering_id": "public.talent_offerings",
  "public.venue_service_windows.tenant_id": "public.agencies", "public.venue_service_windows.venue_id": "public.venues",
  "public.space_groups.tenant_id": "public.agencies", "public.space_groups.venue_id": "public.venues",
  "public.spaces.tenant_id": "public.agencies", "public.spaces.venue_id": "public.venues",
  "public.space_group_members.group_id": "public.space_groups", "public.space_group_members.space_id": "public.spaces", "public.space_group_members.tenant_id": "public.agencies",
  "public.prep_stations.tenant_id": "public.agencies",
  "public.links.tenant_id": "public.agencies",
  "public.visits.tenant_id": "public.agencies", "public.visits.space_id": "public.spaces", "public.visits.opened_by": "auth.users",
  "public.pos_devices.tenant_id": "public.agencies", "public.pos_devices.registered_by": "auth.users",
  "public.pos_shifts.tenant_id": "public.agencies", "public.pos_shifts.opened_by": "auth.users",
  "public.capacity_pools.tenant_id": "public.agencies", "public.capacity_pools.parent_pool_id": "public.capacity_pools",
  "public.talent_offerings.tenant_id": "public.agencies", "public.talent_offerings.capacity_pool_id": "public.capacity_pools",
  "public.talent_offerings.prep_station_id": "public.prep_stations", "public.talent_offerings.talent_profile_id": "public.talent_profiles",
  "public.talent_offering_variants.offering_id": "public.talent_offerings", "public.talent_offering_addons.offering_id": "public.talent_offerings",
  "public.offering_components.tenant_id": "public.agencies", "public.offering_components.offering_id": "public.talent_offerings",
  "public.offering_components.component_offering_id": "public.talent_offerings",
  "public.offering_price_phases.tenant_id": "public.agencies", "public.offering_price_phases.offering_id": "public.talent_offerings",
  "public.events.tenant_id": "public.agencies", "public.events.offering_id": "public.talent_offerings", "public.events.venue_id": "public.venues",
  "public.events.series_id": "public.session_series",
  "public.session_series.tenant_id": "public.agencies", "public.session_series.venue_id": "public.venues", "public.session_series.offering_id": "public.talent_offerings",
  "public.session_series.instructor_user_id": "auth.users",
  "public.sessions.tenant_id": "public.agencies", "public.sessions.event_id": "public.events", "public.sessions.offering_id": "public.talent_offerings",
  "public.sessions.series_id": "public.session_series", "public.sessions.venue_id": "public.venues", "public.sessions.instructor_user_id": "auth.users",
  "public.tenant_promo_codes.tenant_id": "public.agencies",
  "public.talent_profiles.user_id": "auth.users", "public.talent_profiles.created_by_agency_id": "public.agencies",
  "public.agency_talent_roster.tenant_id": "public.agencies", "public.agency_talent_roster.talent_profile_id": "public.talent_profiles",
  "public.talent_booking_hours.talent_profile_id": "public.talent_profiles", "public.talent_booking_hours.tenant_id": "public.agencies",
  "public.payout_accounts.tenant_id": "public.agencies",
  "public.tenant_promo_codes.event_id": "public.events", "public.tenant_promo_codes.variant_id": "public.talent_offering_variants",
  "public.promo_targets.promo_id": "public.tenant_promo_codes",
  "public.customers.tenant_id": "public.agencies", "public.customers.user_id": "auth.users",
  "public.inquiries.tenant_id": "public.agencies", "public.inquiries.source_workspace_id": "public.agencies", "public.inquiries.client_user_id": "auth.users",
  "public.inquiries.owner_user_id": "auth.users", "public.inquiries.customer_id": "public.customers",
  "public.inquiry_requirement_groups.inquiry_id": "public.inquiries", "public.inquiry_requirement_groups.tenant_id": "public.agencies",
  "public.inquiry_participants.inquiry_id": "public.inquiries", "public.inquiry_participants.requirement_group_id": "public.inquiry_requirement_groups",
  "public.inquiry_participants.tenant_id": "public.agencies", "public.inquiry_participants.user_id": "auth.users",
  "public.inquiry_offers.inquiry_id": "public.inquiries", "public.inquiry_offers.created_by_user_id": "auth.users", "public.inquiry_offers.tenant_id": "public.agencies",
  "public.inquiry_offer_line_items.tenant_id": "public.agencies",
  "public.inquiry_offer_line_items.offer_id": "public.inquiry_offers", "public.inquiry_offer_line_items.owner_tenant_id": "public.agencies",
  "public.inquiry_offer_line_items.source_service_id": "public.talent_offerings",
  // Content (SL / RV / PO). Constraints: 20261231418800 (offering_slugs, _pending_pm), 20260603234910 (client_reviews), 20260411120000 (booking_talent),
  // 20261231400700 (cms_posts, cms_post_categories). offering_slugs.owner_scope is a "t:<uuid>"/"w:<uuid>" text with no FK, so it is never an id.
  "public.offering_slugs.offering_id": "public.talent_offerings",
  "public.talent_sites.talent_profile_id": "public.talent_profiles", "public.talent_pages.talent_profile_id": "public.talent_profiles",
  "public.agency_bookings.tenant_id": "public.agencies", "public.agency_bookings.client_user_id": "auth.users",
  "public.booking_talent.tenant_id": "public.agencies", "public.booking_talent.booking_id": "public.agency_bookings",
  "public.booking_talent.talent_profile_id": "public.talent_profiles",
  "public.client_reviews.tenant_id": "public.agencies", "public.client_reviews.booking_id": "public.agency_bookings",
  "public.client_reviews.author_user_id": "auth.users", "public.client_reviews.author_talent_profile_id": "public.talent_profiles",
  "public.client_reviews.client_user_id": "auth.users",
  "public.cms_post_categories.tenant_id": "public.agencies",
  "public.cms_posts.tenant_id": "public.agencies", "public.cms_posts.created_by": "auth.users", "public.cms_posts.updated_by": "auth.users",
  "public.cms_posts.author_profile_id": "auth.users", "public.cms_posts.category_id": "public.cms_post_categories",
  "public.cms_posts.translation_of": "public.cms_posts",
};
const CLUSTERS = [["T1"], ["T2"], ["T3"], ["T4"], ["T5"], ["EV"], ["PR"], ["CU"], ["MO"], ["SL"], ["RV"], ["PO"], null];

test("every cluster, alone and together, inserts the row a foreign key points at BEFORE the row that points at it", () => {
  for (const only of CLUSTERS) {
    const { rawOps } = plan(only);
    assert.ok(rawOps.length > 20);
    assert.deepEqual(forwardReferences(rawOps), [], `forward references in ${only ? only.join() : "all"}`);
  }
});

test("the FK map covers every id-valued column in the plan, and each points at the table that created that id", () => {
  const { rawOps } = plan();
  const made = new Map(rawOps.filter((o) => o.id && o.kind !== "update" && o.kind !== "pin").map((o) => [o.id, o.table]));
  const seen = new Set();
  for (const op of rawOps) {
    for (const [col, v] of Object.entries(op.row ?? {})) {
      if (typeof v !== "string" || !made.has(v) || v === op.id) continue;
      const k = `${op.table}.${col}`;
      if (NOT_FK.has(k)) continue;
      seen.add(k);
      assert.ok(FK[k], `${k} holds a planned id but is not in the FK map: read its constraint in supabase/migrations and list it`);
      assert.equal(made.get(v), FK[k], `${k} points at ${made.get(v)}, the map says ${FK[k]}`);
    }
  }
  assert.ok(seen.size >= 60, `${seen.size} FK columns exercised`);
  for (const k of NOT_FK) assert.match(k, /^public\./);
});

test("RESTRICT foreign keys: the referencing row is deleted first by cleanup (cleanup runs the plan in reverse)", () => {
  const { ops } = plan();
  const index = new Map(ops.filter((o) => o.id).map((o, _i) => [o.id, ops.indexOf(o)]));
  for (const k of ["public.visits.space_id", "public.offering_components.component_offering_id", "public.capacity_pools.parent_pool_id", "public.talent_offerings.capacity_pool_id"]) {
    const [table, col] = [k.slice(0, k.lastIndexOf(".")), k.slice(k.lastIndexOf(".") + 1)];
    const rows = ops.filter((o) => o.table === table && typeof o.row?.[col] === "string" && index.has(o.row[col]));
    assert.ok(rows.length > 0, k);
    for (const o of rows) assert.ok(index.get(o.row[col]) < ops.indexOf(o), `${k}: ${o.key} must come after its target so reverse order deletes it first`);
  }
  const source = readFileSync(new URL("../seed-stage2-fixtures.mts", import.meta.url), "utf8");
  assert.match(source, /const roots = \[\.\.\.ops\]\.reverse\(\)/, "cleanup walks the plan in reverse");
  assert.match(source, /const ops = plan\.ops as Op\[\]/, "the runner executes the dependency-ordered plan");
});

test("orderOps fixes a forward reference without moving anything else, and refuses a cycle", () => {
  const raw = plan(["T1"]).rawOps;
  const rulesAt = raw.findIndex((o) => o.key === "rules:t1-a");
  const offeringAt = raw.findIndex((o) => o.key === "offering:t1-reserva");
  assert.ok(offeringAt < rulesAt, "the builder already writes the offering first");
  assert.deepEqual(orderOps(raw).map((o) => o.key), raw.map((o) => o.key), "a valid order is left untouched (stable)");
  // The exact bug the selftest hit: the rules row ahead of the offering it points at.
  const broken = [...raw];
  const [rules] = broken.splice(rulesAt, 1);
  broken.splice(offeringAt, 0, rules);
  assert.ok(forwardReferences(broken).some((f) => f.key === "rules:t1-a" && f.needs === "offering:t1-reserva"));
  const fixed = orderOps(broken);
  assert.deepEqual(forwardReferences(fixed), []);
  assert.ok(fixed.findIndex((o) => o.key === "offering:t1-reserva") < fixed.findIndex((o) => o.key === "rules:t1-a"));
  // A shuffled plan sorts into a valid one, parents before children (pool parents, event after series, users before their profile updates).
  const shuffled = [...raw].reverse();
  assert.deepEqual(forwardReferences(orderOps(shuffled)), []);
  const a = { fx: "X", kind: "insert", table: "public.talent_offerings", key: "a", id: s2Id("a"), row: { id: s2Id("a"), capacity_pool_id: s2Id("b") } };
  const b = { fx: "X", kind: "insert", table: "public.capacity_pools", key: "b", id: s2Id("b"), row: { id: s2Id("b"), parent_pool_id: s2Id("a") } };
  assert.throws(() => orderOps([a, b]), /cycle/);
  assert.equal(dependencies([a, b])[0].length, 1);
});

test("the stock pool does not create a cycle: its subject_id is not a foreign key", () => {
  const { rawOps } = plan(["T1"]);
  const margarita = rawOps.find((o) => o.key === "offering:t1-margarita");
  const pool = rawOps.find((o) => o.key === "pool:t1-margarita");
  assert.equal(margarita.row.capacity_pool_id, pool.id);
  assert.equal(pool.row.subject_id, margarita.id);
  assert.ok(rawOps.indexOf(pool) < rawOps.indexOf(margarita));
  assert.ok(NOT_FK.has("public.capacity_pools.subject_id"));
});
