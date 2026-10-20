import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TEST_WORD_IN_COPY, fcId } from "./failed-cards-guards.mjs";
import { G_FIXTURES } from "./failed-cards-plan-g.mjs";
import {
  G6_HIDDEN_KEY, G6_MAX_PER_ORDER, G6_TIERS, G7_DEPOSIT_CENTS_PER_PERSON, G7_DEPOSIT_FROM_PARTY, G7_DISPLAY_CURRENCY, G8_CANCEL_FREE_HOURS,
} from "./failed-cards-plan-g2.mjs";
import { buildPlan, resolveFixtures, verifyPlan } from "./failed-cards-plan.mjs";

const NOW = new Date("2026-10-20T12:00:00Z");
const ctx = (now = NOW) => ({
  now,
  trees: { shell: (n) => [{ id: "s", kind: "container", props: { n } }], home: (n) => [{ id: "x", kind: "container", props: { n } }] },
  templatePayload: { shellTree: [], homeTree: [{ id: "c", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "{{displayName}}" } }] }] },
  housekeepingTermId: "243452c3-01ac-b167-ca0a-5101a29724b2",
});
const planOf = (only, now) => buildPlan(resolveFixtures(only), ctx(now));
const byKey = (ops, key) => ops.find((o) => o.key === key);
const source = readFileSync(new URL("../seed-failed-cards-fixtures.mts", import.meta.url), "utf8");

test("G1-G8 are all registered and each pulls the studio in", () => {
  assert.deepEqual(G_FIXTURES, ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
  for (const g of ["G6", "G7", "G8"]) assert.deepEqual(resolveFixtures([g]), ["F3", g]);
  assert.deepEqual(verifyPlan(planOf(null), []).problems, []);
});

test("G6: published tiered event; the hidden tier is flagged hidden and absent from the public tier list", () => {
  const ops = planOf(["G6"]);
  const event = byKey(ops, "event:g6").row;
  const offering = byKey(ops, "offering:g6-event").row;
  assert.equal(event.status, "published");
  assert.match(event.slug, /^qa-fixture-g6-/);
  assert.equal(offering.price_type, "flat_package");
  assert.equal(offering.booking_mode, "request");
  assert.equal(offering.owner_kind, "workspace");
  const tiers = ops.filter((o) => o.table === "public.talent_offering_variants").map((o) => o.row);
  assert.equal(tiers.length, 3);
  assert.ok(tiers.every((t) => t.offering_id === offering.id));
  const publicTiers = tiers.filter((t) => !t.is_hidden);
  const hidden = tiers.filter((t) => t.is_hidden);
  assert.equal(publicTiers.length, 2, "at least 2 public tiers");
  assert.equal(hidden.length, 1, "exactly 1 hidden comp / guest-list tier");
  assert.equal(hidden[0].pool_key, G6_HIDDEN_KEY);
  assert.equal(hidden[0].amount_cents, 0, "a comp is a hidden tier at zero");
  assert.equal(publicTiers.some((t) => t.pool_key === G6_HIDDEN_KEY || t.label === hidden[0].label), false, "the hidden tier is not in the public list");
  assert.equal(["comp", "vip", "guest", "invitados", "lista", "hidden", "free"].includes(G6_HIDDEN_KEY), false, "its key is not guessable");
  assert.match(G6_HIDDEN_KEY, /^[a-z0-9][a-z0-9_-]{0,48}$/);
  assert.equal(new Set(tiers.map((t) => t.pool_key)).size, 3, "pool keys are unique per offering");
  assert.ok(tiers.every((t) => t.max_per_order >= 4 && t.max_per_order === G6_MAX_PER_ORDER), "a 4-ticket order is allowed on every tier");
  assert.ok(publicTiers[0].amount_cents < publicTiers[1].amount_cents && publicTiers.every((t) => t.amount_cents > 0), "a cheaper public tier exists as an exchange target");
});

test("G6: two nights, a pool per tier per night, every public tier holds >= 6 seats", () => {
  const ops = planOf(["G6"]);
  const sessions = ops.filter((o) => o.table === "public.sessions").map((o) => o.row);
  assert.equal(sessions.length, 2, "a second night is the exchange target");
  assert.ok(sessions.every((s) => s.event_id === fcId("event:g6") && s.status === "scheduled" && Date.parse(s.starts_at) > NOW.getTime()));
  assert.notEqual(sessions[0].starts_at, sessions[1].starts_at);
  const pools = ops.filter((o) => o.table === "public.capacity_pools").map((o) => o.row);
  assert.equal(pools.length, 6);
  for (const s of sessions) {
    for (const t of G6_TIERS) {
      const p = pools.find((x) => x.subject_id === s.id && x.pool_key === t.key);
      assert.ok(p, `${t.key} has a pool on night ${s.id}`);
      assert.equal(p.subject_kind, "session_tier");
      assert.equal(p.units_total, t.seats);
      if (!t.hidden) assert.ok(p.units_total >= 6, `${t.key} capacity >= 6`);
    }
  }
});

test("G6-G8 pre-make no order, ticket, redemption or held seat: testers buy live in Stripe TEST", () => {
  const sales = new Set(["public.orders", "public.order_lines", "public.admissions", "public.tenant_promo_redemptions", "public.capacity_allocations", "public.agency_bookings", "public.talent_bookings", "public.booking_talent"]);
  const ops = planOf(["G6", "G7", "G8"]).filter((o) => ["G6", "G7", "G8"].includes(o.fx));
  assert.deepEqual(ops.filter((o) => sales.has(o.table)), []);
});

test("G7: MXN 100 per person from a party of 6 = MXN 600, display currency MXN merged additively", () => {
  const ops = planOf(["G7"]);
  const rules = byKey(ops, "rules:g7").row;
  assert.equal(rules.deposit_cents_per_person, 10000);
  assert.equal(G7_DEPOSIT_CENTS_PER_PERSON, 10000);
  assert.equal(rules.deposit_from_party, G7_DEPOSIT_FROM_PARTY);
  assert.ok(6 >= rules.deposit_from_party);
  assert.equal(rules.deposit_cents_per_person * 6, 60000, "depositCentsForParty(rules, 6) = 60000 cents = MXN 600");
  assert.equal(rules.is_active, true);
  assert.equal(rules.venue_id, fcId("venue:g7"));
  assert.equal(rules.reservation_offering_id, fcId("offering:g7-mesa"));
  assert.ok(rules.party_size_max >= 6);
  const venue = byKey(ops, "venue:g7").row;
  assert.equal(venue.is_default, true);
  assert.match(venue.slug, /^qa-fixture-g6-/);
  const offering = byKey(ops, "offering:g7-mesa").row;
  assert.equal(offering.currency, "MXN");
  assert.equal(offering.status, "published");
  const win = byKey(ops, "window:g7-cena").row;
  assert.deepEqual(win.weekdays, [1, 2, 3, 4, 5, 6, 7]);
  const band = ops.filter((o) => o.table === "public.space_groups").map((o) => o.row).find((g) => g.party_min <= 6 && g.party_max >= 6);
  assert.ok(band, "a band seats a party of 6");
  assert.ok(ops.some((o) => o.table === "public.capacity_pools" && o.row.subject_kind === "space_group" && o.row.subject_id === band.id && o.row.units_total > 0));
  // The one write to a shared (studio) row: an additive settings key, never a replace.
  const upd = ops.filter((o) => o.kind === "update" && o.table === "public.agencies");
  assert.equal(upd.length, 1);
  assert.equal(upd[0].id, fcId("workspace:f3"));
  assert.deepEqual(upd[0].merge, { settings: { display_currency: G7_DISPLAY_CURRENCY } });
  assert.equal(upd[0].set, undefined, "no whole-column set that could drop other settings keys");
  assert.equal(G7_DISPLAY_CURRENCY, "MXN");
  // The runner merges (keeps every other key), records the pre-image first, and is a no-op when already MXN.
  assert.match(source, /async function mergeOwned/);
  assert.match(source, /next\[col\] = \{ \.\.\.base, \.\.\.\(patch as Row\) \}/);
  assert.match(source, /backup\.updated\.push\(\{ table, id, before \}\)/);
  assert.match(source, /if \(!differs\) \{\s*bump\(table, "existed"\);\s*return;/);
  assert.match(source, /op\.kind === "update" && op\.merge/);
});

test("G8: a prepaid instant service with a free-cancel window longer than the 24 h platform default", () => {
  const ops = planOf(["G8"]);
  const svc = byKey(ops, "offering:g8-expres").row;
  assert.equal(svc.cancellation_hours, G8_CANCEL_FREE_HOURS);
  assert.ok(svc.cancellation_hours >= 24);
  assert.equal(svc.booking_mode, "instant");
  assert.equal(svc.reserve_mode, "full", "paid in full at booking, so there is something to refund on cancel");
  assert.ok(svc.amount_cents > 0 && svc.price_display === "exact");
  assert.equal(svc.status, "published");
  assert.equal(svc.talent_profile_id, fcId("talent:f3-b"));
  assert.ok(ops.some((o) => o.key === "talent:f3-b") && ops.some((o) => o.key === "hours:f3-b"), "the talent has hours in the same plan (F3)");
  assert.ok(ops.some((o) => o.key === "media:f3-b-oficina"), "the photo it links exists in the plan");
  assert.equal(TEST_WORD_IN_COPY.test(`${svc.title} ${svc.description} ${svc.category}`), false);
});

test("the sales-history refusal covers the G6-G8 rows (offerings, sessions, pools)", () => {
  const body = source.slice(source.indexOf("async function assertNoSalesHistory"), source.indexOf("async function cleanup"));
  for (const frag of ["public.order_lines", "public.admissions", "public.tenant_promo_redemptions", "committed", "public.talent_offerings", "public.sessions", "public.capacity_pools"]) assert.ok(body.includes(frag), frag);
});
