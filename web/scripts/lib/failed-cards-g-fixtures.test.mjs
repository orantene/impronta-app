import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DB_FIXTURES, TEST_WORD_IN_COPY, fcId, parseFcArgs } from "./failed-cards-guards.mjs";
import { G6 } from "./failed-cards-ops.mjs";
import { G_EVENT_SEATS, G_FIXTURES, G_PASSWORD_ENV } from "./failed-cards-plan-g.mjs";
import { FIXTURE_CARDS, buildPlan, resolveFixtures, verifyPlan } from "./failed-cards-plan.mjs";

const SENTINEL = "Sentinel-Pw-9f3c1e7a2b4d";
const ctx = (now = new Date("2026-10-19T12:00:00Z")) => ({
  now,
  trees: { shell: (n) => [{ id: "s", kind: "container", props: { n } }], home: (n) => [{ id: "x", kind: "container", props: { n } }] },
  templatePayload: { shellTree: [], homeTree: [{ id: "c", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "{{displayName}}" } }] }] },
  housekeepingTermId: "243452c3-01ac-b167-ca0a-5101a29724b2",
});
const planOf = (only, now) => buildPlan(resolveFixtures(only), ctx(now));
const gOps = (ops) => ops.filter((o) => G_FIXTURES.includes(o.fx));
const byKey = (ops, key) => ops.find((o) => o.key === key);
const source = readFileSync(new URL("../seed-failed-cards-fixtures.mts", import.meta.url), "utf8");

test("G1-G5 are registered, name their cards, and pull the F3 studio in", () => {
  for (const g of G_FIXTURES) {
    assert.ok(DB_FIXTURES.includes(g), g);
    assert.ok(FIXTURE_CARDS[g]?.length, `${g} names its cards`);
    assert.deepEqual(resolveFixtures([g]), ["F3", g], `${g} needs the studio workspace`);
  }
  assert.deepEqual(resolveFixtures(["G4", "G1"]), ["F3", "G1", "G4"]);
  assert.deepEqual(parseFcArgs(["--only", "G1,G2,G3,G4,G5"]).errors, []);
  assert.ok(parseFcArgs(["--only", "G6"]).errors.length > 0, "unknown fixture refused");
  const ops = planOf(["G4"]);
  const ws = ops.findIndex((o) => o.key === "workspace:f3");
  assert.ok(ws >= 0 && ops.findIndex((o) => o.fx === "G4") > ws, "G ops come after the studio workspace");
});

test("ids are deterministic (fcId of the key) and never a Group-6 or F-fixture id", () => {
  const a = gOps(planOf(null));
  const b = gOps(planOf(null, new Date("2027-03-01T00:00:00Z")));
  assert.ok(a.length >= 18);
  assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id), "same ids on every run (idempotent re-run)");
  for (const o of a) if (o.id && o.kind !== "update" && o.kind !== "authUser") assert.equal(o.id, fcId(o.key), `${o.fx} ${o.key}`);
  const g6 = new Set(Object.values(G6));
  const fIds = new Set(planOf(null).filter((o) => !G_FIXTURES.includes(o.fx) && o.id).map((o) => o.id));
  const mine = a.filter((o) => o.id && o.kind !== "update").map((o) => o.id);
  assert.equal(new Set(mine).size, mine.length, "no id planned twice");
  assert.ok(mine.every((id) => !g6.has(id) && !fIds.has(id)), "no Group-6 or F-fixture id is inserted");
  assert.deepEqual(verifyPlan(planOf(null), []).problems, [], "the whole plan passes its own guards");
});

test("no title, name, label, description or category says QA / test / E2E", () => {
  const checked = [];
  for (const o of gOps(planOf(null))) {
    const r = o.row ?? {};
    for (const col of ["title", "description", "category", "label", "name", "display_name", "public_name", "tagline"]) if (typeof r[col] === "string") checked.push([`${o.key}.${col}`, r[col]]);
    for (const col of ["title_i18n", "description_i18n"]) if (typeof r[col] === "string") for (const v of Object.values(JSON.parse(r[col]))) checked.push([`${o.key}.${col}`, v]);
    for (const [k, v] of Object.entries(o.set ?? {})) if (typeof v === "string" && k === "display_name") checked.push([`${o.key}.${k}`, v]);
  }
  assert.ok(checked.length >= 20, "the scan reached the copy");
  for (const [where, v] of checked) assert.equal(TEST_WORD_IN_COPY.test(v), false, `${where}: ${v}`);
});

test("cleanup covers every id the G fixtures insert", () => {
  const ops = planOf(null);
  // Mirrors cleanup() in the runner: roots = id-bearing inserts/clones except bookings and subdomain rows; users go via auth.users.
  const NO_DESCENT = new Set(["public.agency_domains"]);
  const roots = new Set(ops.filter((o) => o.id && (o.kind === "insert" || o.kind === "clone") && o.table !== "public.talent_bookings" && !NO_DESCENT.has(o.table)).map((o) => o.id));
  const users = new Set(ops.filter((o) => o.kind === "authUser").map((o) => o.id));
  const workspaces = new Set(ops.filter((o) => o.table === "public.agencies").map((o) => o.id));
  for (const o of gOps(ops)) {
    if (!o.id || o.kind === "update") continue;
    const covered = roots.has(o.id) || users.has(o.id) || (NO_DESCENT.has(o.table) && workspaces.has(o.row.tenant_id));
    assert.ok(covered, `${o.fx} ${o.table} ${o.key} is not reachable by --cleanup`);
  }
  // Every table the G fixtures write is counted by the selftest's row-drift check.
  const counted = source.slice(source.indexOf("const COUNT_TABLES"), source.indexOf("];", source.indexOf("const COUNT_TABLES")));
  for (const t of new Set(gOps(ops).filter((o) => o.kind !== "authUser" && o.kind !== "update").map((o) => o.table))) assert.ok(counted.includes(`"${t}"`), `${t} missing from COUNT_TABLES`);
  // The published event is demoted to draft before the purge, and sales history blocks the cleanup.
  assert.match(source, /update public\.events set status = 'draft'/);
  assert.match(source, /async function assertNoSalesHistory/);
  assert.ok(source.indexOf("await assertNoSalesHistory(ops)") < source.indexOf("update public.events set status = 'draft'"), "history guard runs before any delete");
});

test("the password never appears in the plan, a row, a backup or a log line", () => {
  process.env[G_PASSWORD_ENV] = SENTINEL;
  try {
    const ops = planOf(null);
    assert.equal(JSON.stringify(ops).includes(SENTINEL), false, "not in any planned row");
    const user = byKey(ops, "user:g3-manager");
    assert.equal(user.kind, "authUser");
    assert.equal(user.row.needsPassword, true, "the runner reads QA_FIXTURE_PASSWORD from the environment");
    assert.equal(Object.keys(user.row).filter((k) => k !== "needsPassword").some((k) => /pass|secret|token/i.test(k)), false, "no credential field on the row");
    assert.equal(ops.flatMap((o) => Object.keys(o.row ?? {})).some((k) => /^(encrypted_)?password$/i.test(k)), false);
  } finally {
    delete process.env[G_PASSWORD_ENV];
  }
  // No console call in the runner may mention the password value (the env NAME inside a message is fine).
  const lines = source.split("\n").filter((l) => /console\.(log|error|warn|info)\(/.test(l));
  for (const l of lines) assert.equal(/\$\{[^}]*password[^}]*\}|,\s*password\b|\bpassword\s*\)/i.test(l), false, `log line leaks the password: ${l.trim()}`);
  assert.equal(/backup\.(updated|deleted)\.push\([^)]*password/i.test(source), false);
  assert.equal(/writeFileSync\([^)]*password/i.test(source), false);
});

test("G1: a size-priced dish with no base price and two MXN prices", () => {
  const ops = planOf(["G1"]);
  const item = byKey(ops, "offering:g1-cafe").row;
  assert.equal(item.owner_kind, "workspace");
  assert.equal(item.talent_profile_id, null);
  assert.equal(item.kind, "product");
  assert.equal(item.amount_cents, null, "tier-only: the case TUL-1330 guards");
  assert.equal(item.price_display, "quote");
  assert.equal(item.booking_mode, "request", "instant booking needs a fixed price (talent_offerings_instant_needs_price)");
  assert.equal(item.currency, "MXN");
  assert.equal(item.status, "published");
  const sizes = ops.filter((o) => o.table === "public.talent_offering_variants" && o.fx === "G1").map((o) => o.row);
  assert.equal(sizes.length, 2);
  assert.equal(new Set(sizes.map((s) => s.amount_cents)).size, 2, "different prices");
  assert.ok(sizes.every((s) => s.offering_id === item.id && s.amount_cents > 0));
});

test("G2: stock of exactly 1, backed by a 1-unit pool created before the offering that points at it", () => {
  const ops = planOf(["G2"]);
  const poolIdx = ops.findIndex((o) => o.key === "pool:g2-pay");
  const itemIdx = ops.findIndex((o) => o.key === "offering:g2-pay");
  assert.ok(poolIdx >= 0 && poolIdx < itemIdx, "FK order: pool first");
  const pool = ops[poolIdx].row;
  const item = ops[itemIdx].row;
  assert.equal(item.inventory_qty, 1);
  assert.equal(pool.units_total, 1);
  assert.equal(item.capacity_pool_id, pool.id);
  assert.equal(pool.subject_kind, "offering");
  assert.equal(pool.subject_id, item.id);
  assert.equal(pool.tenant_id, item.tenant_id);
  assert.ok(item.amount_cents > 0 && item.price_display === "exact", "satisfies the instant-needs-price check");
});

test("G3: a second, confirmed staff login that cannot refund, on the studio", () => {
  const ops = planOf(["G3"]);
  const user = byKey(ops, "user:g3-manager");
  assert.equal(user.row.confirmed, true);
  assert.match(user.row.email, /^qa-fixture-g6-[a-z0-9-]+@impronta\.test$/);
  assert.notEqual(user.row.email, G6.clientEmail);
  const m = byKey(ops, "membership:g3-manager");
  assert.equal(m.row.role, "manager", "manager is not owner/admin: no manage_billing, so no refund");
  assert.equal(m.row.tenant_id, fcId("workspace:f3"));
  assert.equal(m.row.profile_id, user.id);
  assert.equal(m.template.id, G6.membership, "cloned FROM the Group-6 membership, which is read, never changed");
  assert.equal(ops.filter((o) => o.kind === "update" && o.id === user.id).length, 1, "only its own profile is updated");
  assert.equal(ops.some((o) => o.fx === "G3" && o.row?.role === "owner" && o.table === "public.agency_memberships"), false);
});

test("G4: a published one-night event with 2 seats, one visible tier, and a 1-use event promo", () => {
  const ops = planOf(["G4"], new Date("2026-10-19T12:00:00Z"));
  const event = byKey(ops, "event:g4").row;
  const session = byKey(ops, "session:g4").row;
  const tier = byKey(ops, "variant:g4-general").row;
  const pool = byKey(ops, "pool:g4-general").row;
  const promo = byKey(ops, "promo:g4-salsa").row;
  const offering = byKey(ops, "offering:g4-event").row;
  assert.equal(event.status, "published");
  assert.ok(event.published_at);
  assert.match(event.slug, /^qa-fixture-g6-/);
  assert.equal(event.offering_id, offering.id);
  assert.equal(session.event_id, event.id);
  assert.ok(Date.parse(session.starts_at) > Date.parse("2026-10-19T12:00:00Z") && Date.parse(session.ends_at) > Date.parse(session.starts_at));
  assert.equal(offering.owner_kind, "workspace");
  assert.equal(offering.kind, "package");
  assert.equal(tier.offering_id, offering.id);
  assert.equal(tier.is_hidden, false);
  assert.equal(tier.capacity_pool_id, undefined, "an event tier never stores a pool id (the pool is resolved per night)");
  assert.equal(pool.subject_kind, "session_tier");
  assert.equal(pool.subject_id, session.id);
  assert.equal(pool.pool_key, tier.pool_key);
  assert.equal(pool.units_total, G_EVENT_SEATS);
  assert.equal(G_EVENT_SEATS, 2);
  assert.ok(tier.max_per_order <= pool.units_total);
  assert.equal(promo.event_id, event.id);
  assert.equal(promo.max_redemptions, 1);
  assert.equal(promo.kind, "percent");
  assert.ok(promo.value >= 1 && promo.value <= 100);
  assert.equal(promo.talent_profile_id, undefined, "workspace promo, not a hub talent promo");
  const order = ["offering:g4-event", "event:g4", "session:g4", "variant:g4-general", "pool:g4-general", "promo:g4-salsa"].map((k) => ops.findIndex((o) => o.key === k));
  assert.deepEqual([...order].sort((x, y) => x - y), order, "parents are inserted before their children");
});

test("G5: a free-plan workspace owned by the studio owner, with no subscription row planned", () => {
  const ops = planOf(["G5"]);
  const ws = byKey(ops, "workspace:g5-free");
  assert.equal(ws.row.plan_tier, "free");
  assert.match(ws.row.slug, /^qa-fixture-g6-/);
  assert.notEqual(ws.row.slug, byKey(ops, "workspace:f3").row.slug);
  assert.equal(byKey(ops, "membership:g5-free").row.profile_id, fcId("user:f3-owner"));
  assert.equal(byKey(ops, "membership:g5-free").row.role, "owner");
  assert.equal(ops.some((o) => o.table === "public.workspace_subscriptions" || o.table === "public.talent_subscriptions"), false, "Stripe-side state is created by Checkout, never seeded");
  assert.equal(byKey(ops, "domain:g5-free:sub").row.status, "active");
});

test("the G fixtures write nothing outside their own ids and never touch Group-6 rows or the forbidden talents", () => {
  const ops = gOps(planOf(null));
  const text = JSON.stringify(ops);
  for (const bad of ["TAL-93938", "TAL-93940", "pluhdapdnuiulvxmyspd", "TUL-52\""]) assert.equal(text.includes(bad), false, bad);
  const g6 = new Set(Object.values(G6));
  for (const o of ops) {
    if (o.kind === "update") assert.ok(!g6.has(o.id), `${o.key} updates a Group-6 row`);
    assert.ok(!Object.entries(o.row ?? {}).some(([k, v]) => /_id$/.test(k) && g6.has(v) && k !== "talent_profile_id"), `${o.key} references a Group-6 row`);
  }
});
