import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { ALCOHOL_WORD, TEST_WORD, alcoholDealProblems, isExampleTestEmail, s2Id, verifyS2Plan } from "./stage2-guards.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";
import { addDays } from "./stage2-time.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const ops = (only = null) => buildStage2Plan(resolveStage2(only), { now: NOW, has: () => true, hub: HUB }).ops;
const byKey = (list, key) => list.find((o) => o.key === key);
const rows = (list, table) => list.filter((o) => o.table === table).map((o) => o.row);
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

test("the whole 2b plan passes its guards; T4 is a cluster of its own", () => {
  assert.deepEqual(resolveStage2(["T4"]), ["T4"]);
  const all = ops();
  assert.deepEqual(verifyS2Plan(all, GUARD).problems, []);
  assert.ok(all.length > 330, `${all.length} ops`);
  assert.equal(all.filter((o) => o.kind === "update" && o.table !== "public.profiles" && o.table !== "public.inquiries" && o.kind !== "pin").length, 0, "no update besides the trigger-made profile rows (and the PIN on the seed's own workspace)");
});

test("T4 US salon: USD, New York, English first, staff, two stylists with hours, four USD services, no payout or Stripe row", () => {
  const list = ops(["T4"]);
  const ws = byKey(list, "workspace:t4").row;
  assert.deepEqual([ws.default_currency, ws.preferred_currency, ws.timezone, ws.settings.display_currency, ws.workspace_type], ["USD", "usd", "America/New_York", "USD", "talent"]);
  assert.deepEqual(ws.supported_locales, ["en", "es"]);
  assert.equal(ws.settings.business_type_id, "hair-salon");
  const emails = list.filter((o) => o.kind === "authUser").map((o) => o.row.email);
  assert.equal(emails.length, 3);
  assert.ok(emails.every(isExampleTestEmail));
  const talents = rows(list, "public.talent_profiles");
  assert.deepEqual(talents.map((t) => t.profile_code).sort(), ["TAL-96202", "TAL-96203"]);
  assert.ok(talents.every((t) => t.default_currency === "USD" && t.preferred_locale === "en" && t.is_test_account === false));
  assert.equal(talents.filter((t) => t.user_id).length, 1, "one stylist has a login");
  const hours = rows(list, "public.talent_booking_hours");
  assert.equal(hours.length, 2);
  assert.ok(hours.every((h) => h.timezone === "America/New_York"));
  const services = rows(list, "public.talent_offerings");
  assert.equal(services.length, 4);
  assert.deepEqual(services.map((s) => s.amount_cents).sort((a, b) => a - b), [3000, 3500, 4500, 12000]);
  assert.ok(services.every((s) => s.currency === "USD" && s.owner_kind === "talent" && s.status === "published" && s.visibility === "public" && s.tenant_id === s2Id("workspace:t4")));
  assert.ok(services.every((s) => !TEST_WORD.test(`${s.title} ${s.description} ${s.category}`)));
  assert.equal(list.some((o) => ["public.payout_accounts", "public.workspace_subscriptions", "public.talent_subscriptions"].includes(o.table)), false, "the Connect account is the --stripe step");
  assert.equal(list.filter((o) => o.table === "public.agency_memberships").map((o) => o.row.role).sort().join(), "editor,owner");
});

test("T5 drink deal: non-alcoholic items only; the package components are the class and the smoothie", () => {
  const list = ops(["T5"]);
  assert.deepEqual(alcoholDealProblems(list), []);
  const deals = list.filter((o) => o.table === "public.talent_offerings" && JSON.parse(o.row.attributes).deal === true);
  assert.equal(deals.length, 3);
  for (const d of deals) {
    const a = JSON.parse(d.row.attributes);
    assert.equal(a.alcohol, false);
    assert.equal(ALCOHOL_WORD.test(`${d.row.title} ${d.row.description} ${d.row.title_i18n}`), false, d.row.title);
  }
  const comps = rows(list, "public.offering_components").filter((c) => c.offering_id === s2Id("offering:clase-smoothie"));
  assert.deepEqual(comps.map((c) => c.component_offering_id).sort(), [s2Id("offering:clase-oferta"), s2Id("offering:smoothie")].sort());
  assert.equal(deals.filter((d) => JSON.parse(d.row.attributes).story === "2x1-happy-hour").length, 2, "the 2x1 / happy-hour story items");
  // the alcoholic control items live only on T1, never in a deal
  assert.equal(list.filter((o) => JSON.parse(o.row?.attributes ?? "{}").alcohol === true).length, 0);
});

test("T5 tour: one departure, 12 seats, an early-bird phase that ends before the regular price starts", () => {
  const list = ops(["T5"]);
  const sessions = rows(list, "public.sessions").filter((s) => s.event_id === s2Id("event:tour"));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].starts_at.slice(0, 10) > addDays("2026-10-21", 28), true);
  const tier = byKey(list, "variant:tour-tier").row;
  assert.deepEqual([tier.amount_cents, tier.max_per_order, tier.is_hidden], [90000, 6, false]);
  const pool = rows(list, "public.capacity_pools").find((p) => p.subject_id === sessions[0].id);
  assert.equal(pool.units_total, 12);
  assert.equal(pool.pool_key, tier.pool_key);
  const early = byKey(list, "phase:tour-early").row;
  const regular = byKey(list, "phase:tour-regular").row;
  assert.ok(early.price_cents < regular.price_cents);
  assert.equal(early.ends_at, regular.starts_at);
  assert.equal(regular.ends_at, null);
  assert.ok(early.ends_at < sessions[0].starts_at, "the early bird closes before the departure");
  assert.equal(early.variant_id, tier.id);
  assert.equal(byKey(list, "event:tour").row.venue_id, null);
});

test("T5 beach club: beds with a minimum spend, an assigned tier group, one pool per bed, a non-default venue", () => {
  const list = ops(["T5"]);
  const venue = byKey(list, "venue:t5-playa").row;
  assert.equal(venue.is_default, false);
  const beds = rows(list, "public.spaces").filter((s) => s.venue_id === venue.id);
  assert.equal(beds.length, 3);
  assert.ok(beds.every((b) => b.kind === "bed" && b.min_spend_cents === 150000 && /^B\d$/.test(b.code)));
  const group = byKey(list, "group:t5-camas").row;
  assert.deepEqual([group.kind, group.sell_mode, group.min_spend_cents], ["tier", "assigned", 150000]);
  const members = rows(list, "public.space_group_members");
  assert.deepEqual(members.map((m) => m.space_id).sort(), beds.map((b) => b.id).sort());
  assert.ok(members.every((m) => m.group_id === group.id && m.tenant_id === s2Id("workspace:t5")));
  const pools = rows(list, "public.capacity_pools").filter((p) => p.subject_kind === "space");
  assert.equal(pools.length, 3);
  assert.ok(pools.every((p) => p.units_total === 1 && beds.some((b) => b.id === p.subject_id)));
  assert.equal(byKey(list, "offering:cama").row.amount_cents, 150000);
  assert.equal(list.filter((o) => o.table === "public.venue_service_rules").length, 0, "no reservation rules: bed sales are not wired to the table-reservation flow");
});

test("docs/plans/stage2-cron-triggers.md covers the five crons with their real paths and schedules, and holds no secret", () => {
  const doc = readFileSync(join(REPO, "docs/plans/stage2-cron-triggers.md"), "utf8");
  const vercel = JSON.parse(readFileSync(join(REPO, "web/vercel.json"), "utf8"));
  const sched = Object.fromEntries(vercel.crons.map((c) => [c.path, c.schedule]));
  for (const name of ["materialise-sessions", "ticket-refund-intents", "promo-hold-sweep", "booking-reminders", "expire-orders"]) {
    const path = `/api/cron/${name}`;
    assert.ok(sched[path], `${path} is in vercel.json`);
    assert.ok(doc.includes(`\`${path}\``), `${path} documented`);
    assert.ok(doc.includes(`\`${sched[path]}\``), `${path} schedule ${sched[path]} documented`);
    assert.ok(existsSync(join(REPO, `web/src/app/api/cron/${name}/route.ts`)), `${path} route exists`);
  }
  assert.match(doc, /CRON_SECRET/);
  assert.match(doc, /Authorization: Bearer/);
  // names only: every Bearer in the doc is followed by the variable or a placeholder, never a literal value
  for (const m of doc.matchAll(/Bearer\s+(\S+)/g)) assert.match(m[1], /^(\$CRON_SECRET|<value|\$CRON_SECRET")/, `literal after Bearer: ${m[1]}`);
  assert.equal(/(sk_(live|test)_|whsec_|eyJ[A-Za-z0-9_-]{20,}|[A-Za-z0-9+/]{40,}={0,2})/.test(doc), false, "no key-shaped string");
  assert.equal(/qa-[1-6]\.tulala/.test(doc.replace(/qa-1\.\.qa-6/g, "")), false);
});
