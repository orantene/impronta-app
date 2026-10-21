import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { checkS2Plan, s2Id, verifyS2Plan } from "./stage2-guards.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";
import { addDays, isoDow, nextDow, weekly, zonedWallToUtc } from "./stage2-time.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const plan = (only = null, hub = HUB, has = () => true) => buildStage2Plan(resolveStage2(only), { now: NOW, has, hub });
const ops = (...a) => plan(...a).ops;
const byKey = (list, key) => list.find((o) => o.key === key);
const where = (list, table) => list.filter((o) => o.table === table).map((o) => o.row);
const hoursUtc = (iso) => new Date(iso).getUTCHours();
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

test("wall clocks resolve per date: the New York offset moves on 2026-11-01, the Cancun offset never does", () => {
  assert.equal(zonedWallToUtc("2026-10-31", "21:00", "America/New_York"), "2026-11-01T01:00:00.000Z");
  assert.equal(zonedWallToUtc("2026-11-07", "21:00", "America/New_York"), "2026-11-08T02:00:00.000Z");
  assert.equal(zonedWallToUtc("2026-12-04", "21:00", "America/Cancun"), "2026-12-05T02:00:00.000Z");
  assert.equal(zonedWallToUtc("2026-07-04", "21:00", "America/Cancun"), "2026-07-05T02:00:00.000Z");
  assert.equal(isoDow("2026-10-24"), 6);
  assert.equal(nextDow("2026-10-21", 5), "2026-10-23");
  assert.deepEqual(weekly("2026-10-24", 3), ["2026-10-24", "2026-10-31", "2026-11-07"]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("EV cluster pulls T1 in; the whole 2a plan passes its own guards", () => {
  assert.deepEqual(resolveStage2(["EV"]), ["T1", "EV"]);
  const list = ops();
  assert.deepEqual(verifyS2Plan(list, GUARD).problems, []);
  assert.ok(list.length > 250, `${list.length} ops`);
});

test("DJ Fridays: a 12-week Friday series; weeks 1-3 free; GA 80 + VIP 20 as child pools under a total of 100; a hidden comp tier", () => {
  const list = ops(["EV"]);
  const series = byKey(list, "series:dj").row;
  assert.deepEqual(series.weekdays, [5]);
  assert.equal(series.timezone, "America/Cancun");
  assert.equal(series.local_time, "21:00");
  const sessions = where(list, "public.sessions").filter((s) => s.series_id === series.id);
  assert.equal(sessions.length, 12);
  assert.ok(sessions.every((s) => Date.parse(s.starts_at) > NOW.getTime()));
  assert.equal(new Set(sessions.map((s) => new Date(s.starts_at).getTime())).size, 12);
  // every night is a Friday at 21:00 Cancun
  assert.ok(sessions.every((s) => hoursUtc(s.starts_at) === 2 && isoDow(addDays(s.starts_at.slice(0, 10), -1)) === 5));
  const event = byKey(list, "event:dj").row;
  assert.equal(event.series_id, series.id);
  assert.ok(list.findIndex((o) => o.key === "series:dj") < list.findIndex((o) => o.key === "event:dj"), "series before the event that points at it");
  const pools = where(list, "public.capacity_pools");
  for (const s of sessions) {
    const mine = pools.filter((p) => p.subject_id === s.id);
    const total = mine.find((p) => p.pool_key === "total");
    assert.equal(total.units_total, 100);
    assert.equal(total.parent_pool_id, undefined);
    const kids = mine.filter((p) => p.pool_key !== "total");
    assert.deepEqual(kids.map((k) => [k.pool_key, k.units_total]).sort(), [["cortesia_k4", 10], ["ga", 80], ["vip", 20]]);
    assert.ok(kids.every((k) => k.parent_pool_id === total.id), "child pools hang under the total");
    assert.ok(list.findIndex((o) => o.row?.id === total.id) < Math.min(...kids.map((k) => list.findIndex((o) => o.row?.id === k.id))), "parents are inserted first");
  }
  const tiers = where(list, "public.talent_offering_variants").filter((v) => v.offering_id === s2Id("offering:dj-event"));
  assert.equal(tiers.length, 3);
  const hidden = tiers.filter((t) => t.is_hidden);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].amount_cents, 0);
  assert.equal(tiers.filter((t) => !t.is_hidden).length, 2);
  // weeks 1-3 free: GA is free until the 4th Friday, then 8000
  const phases = where(list, "public.offering_price_phases");
  const free = phases.find((p) => p.price_cents === 0);
  const paid = phases.find((p) => p.price_cents === 8000);
  assert.equal(free.variant_id, s2Id("variant:dj-ga"));
  assert.equal(free.ends_at, paid.starts_at);
  const sorted = sessions.map((s) => s.starts_at).sort();
  assert.ok(free.ends_at > sorted[2] && free.ends_at <= sorted[3], "the free phase covers weeks 1-3 and ends before week 4");
  assert.equal(paid.ends_at, null);
});

test("free event, overnight, pool-of-1", () => {
  const list = ops(["EV"]);
  const night = (k) => where(list, "public.sessions").filter((s) => s.event_id === s2Id(`event:${k}`));
  const tier = (k) => where(list, "public.talent_offering_variants").find((v) => v.offering_id === s2Id(`offering:${k}-event`));
  const pool = (k) => where(list, "public.capacity_pools").find((p) => p.subject_id === night(k)[0].id);
  assert.equal(tier("libre").amount_cents, 0);
  assert.equal(pool("libre").units_total, 50);
  assert.equal(byKey(list, "event:libre").row.admission_kind, "registration");
  const o = night("noche")[0];
  assert.equal(hoursUtc(o.starts_at), 3, "22:00 Cancun");
  assert.equal(hoursUtc(o.ends_at), 7, "02:00 Cancun the next day");
  assert.equal(Date.parse(o.ends_at) - Date.parse(o.starts_at), 4 * 3600000);
  assert.equal(o.ends_at.slice(0, 10), addDays(o.starts_at.slice(0, 10), 0), "both instants fall on the same UTC date, a local-midnight crossing");
  assert.equal(pool("chef").units_total, 1);
  assert.equal(tier("chef").max_per_order, 1);
  for (const k of ["libre", "noche", "chef"]) assert.equal(night(k).length, 1);
  assert.ok([...night("libre"), ...night("noche"), ...night("chef")].every((s) => Date.parse(s.starts_at) > NOW.getTime()));
});

test("New York series crosses 2026-11-01: the wall clock stays 21:00, the UTC hour moves 01 -> 02", () => {
  const list = ops(["EV"]);
  const series = byKey(list, "series:ny").row;
  assert.equal(series.timezone, "America/New_York");
  assert.deepEqual(series.weekdays, [6]);
  assert.equal(series.starts_on, "2026-10-24");
  const sessions = where(list, "public.sessions").filter((s) => s.series_id === series.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  assert.equal(sessions.length, 6);
  assert.deepEqual(sessions.map((s) => hoursUtc(s.starts_at)), [1, 1, 2, 2, 2, 2]);
  assert.ok(Date.parse(sessions[1].starts_at) < Date.parse("2026-11-01T06:00:00Z") && Date.parse(sessions[2].starts_at) > Date.parse("2026-11-01T06:00:00Z"));
  assert.equal(byKey(list, "event:ny").row.venue_id, s2Id("venue:t1-c"));
  assert.equal(byKey(list, "offering:ny-event").row.currency, "USD");
  assert.equal(where(list, "public.capacity_pools").filter((p) => sessions.some((s) => s.id === p.subject_id)).length, 6);
});

test("T5 weekly class: instructor on the series and every night, 12 paid seats each", () => {
  const list = ops(["T5"]);
  const instr = s2Id("user:t5-instructor");
  const series = byKey(list, "series:clase").row;
  assert.equal(series.instructor_user_id, instr);
  assert.deepEqual(series.weekdays, [3]);
  const sessions = where(list, "public.sessions").filter((s) => s.series_id === series.id);
  assert.equal(sessions.length, 8);
  assert.ok(sessions.every((s) => s.instructor_user_id === instr && s.series_id === series.id && hoursUtc(s.starts_at) === 13));
  assert.equal(where(list, "public.capacity_pools").filter((p) => p.units_total === 12 && p.pool_key === "default").length, 8);
  const offer = byKey(list, "offering:clase-oferta").row;
  assert.ok(offer.amount_cents > 0 && offer.kind === "service" && offer.currency === "MXN");
  assert.ok(list.some((o) => o.table === "public.agency_memberships" && o.row.profile_id === instr));
});

test("T3: seed-owned roster talent with a login, public talent service next to a workspace-owned QR menu (owner-leak setup)", () => {
  const list = ops(["T3"]);
  const talent = byKey(list, "talent:t3-valeria").row;
  assert.match(talent.profile_code, /^TAL-962\d\d$/);
  assert.equal(talent.user_id, s2Id("user:t3-talent"));
  assert.equal(talent.is_test_account, false);
  assert.equal(byKey(list, "profile:t3-talent").set.app_role, "talent");
  const service = byKey(list, "offering:t3-sesion").row;
  assert.deepEqual([service.owner_kind, service.visibility, service.status, service.tenant_id], ["talent", "public", "published", s2Id("workspace:t3")]);
  const menu = byKey(list, "offering:t3-cafe").row;
  assert.equal(menu.owner_kind, "workspace");
  assert.equal(menu.talent_profile_id, null);
  assert.equal(list.filter((o) => o.table === "public.links").map((o) => o.row.kind).sort().join(), "menu,table");
  assert.equal(list.filter((o) => o.table === "public.visits")[0].row.status, "open");
  assert.equal(byKey(list, "workspace:t3").row.workspace_type, "talent");
  assert.equal(list.filter((o) => o.table === "public.agency_memberships").map((o) => o.row.role).sort().join(), "manager,owner");
});

test("TAL-93900: only additive NEW rows, flagged, in the hub tenant; never an update, never unflagged", () => {
  const list = ops();
  const touching = list.filter((o) => o.touchesExisting);
  assert.deepEqual(touching.map((o) => `${o.table}:${o.key}`).sort(), ["public.payout_accounts:payout:t3-hub", "public.talent_offerings:offering:t3-hub-paquete"]);
  for (const o of touching) {
    assert.equal(o.touchesExisting, "TAL-93900");
    assert.equal(o.kind, "insert");
    assert.equal(o.row.tenant_id, HUB.tenantId);
    assert.equal(o.id, s2Id(o.key));
  }
  assert.equal(byKey(list, "offering:t3-hub-paquete").row.talent_profile_id, HUB.talentId);
  assert.equal(byKey(list, "payout:t3-hub").row.owner_id, HUB.talentId);
  assert.equal(list.filter((o) => !o.touchesExisting && JSON.stringify(o).includes(HUB.talentId)).length, 0, "no other op names the hub talent");
  assert.equal(list.filter((o) => o.table === "public.talent_profiles" && o.row.profile_code === "TAL-93900").length, 0);
  assert.equal(list.filter((o) => (o.kind === "update" || o.kind === "delete") && JSON.stringify(o).includes(HUB.talentId)).length, 0);
  // Guard negatives
  const flagged = byKey(list, "offering:t3-hub-paquete");
  const bad = (mutate) => verifyS2Plan(list.map((o) => (o === flagged ? mutate(o) : o)), GUARD);
  assert.equal(bad((o) => ({ ...o, touchesExisting: undefined })).ok, false, "unflagged reference to the hub talent");
  assert.equal(bad((o) => ({ ...o, kind: "update", set: {} })).ok, false, "an update to a pre-existing talent's rows");
  assert.equal(bad((o) => ({ ...o, touchesExisting: "TAL-93938" })).ok, false, "any other pre-existing talent");
  assert.equal(bad((o) => ({ ...o, row: { ...o.row, tenant_id: "00000000-0000-0000-0000-00000000beef" } })).ok, false, "a tenant other than the resolved hub tenant");
  assert.equal(checkS2Plan([{ fx: "X", kind: "insert", table: "public.talent_profiles", key: "t", id: s2Id("t"), row: { profile_code: "TAL-93900" } }], { fixtureIds: new Set([s2Id("t")]) }).ok, false, "never insert a profile with the hub code");
  assert.equal(checkS2Plan([{ fx: "X", kind: "insert", table: "public.talent_profiles", key: "t", id: s2Id("t"), row: { profile_code: "TAL-93938" } }], { fixtureIds: new Set([s2Id("t")]) }).ok, false);
  // Existing payout account: no payout row is added; a missing hub talent is reported, not guessed.
  assert.equal(ops(["T3"], { ...HUB, hasPayout: true }).some((o) => o.key === "payout:t3-hub"), false);
  const none = plan(["T3"], null);
  assert.equal(none.ops.some((o) => o.touchesExisting), false);
  assert.equal(none.blocked.length, 1);
});

test("nothing in 2a depends on a held migration column (all _pending_pm files scanned)", () => {
  const dir = join(REPO, "supabase/migrations/_pending_pm");
  const held = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const m of sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?public\.(\w+)([\s\S]*?);/gi)) {
      for (const c of m[2].matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)) (held[m[1]] ??= new Set()).add(c[1]);
    }
  }
  assert.ok(Object.keys(held).length >= 3);
  const list = ops(null, HUB, () => false); // pos_enabled is conditional on the live schema; everything else must not need a held column
  for (const o of list) {
    const table = o.table.replace("public.", "");
    for (const col of Object.keys({ ...(o.row ?? {}), ...(o.set ?? {}) })) assert.equal(held[table]?.has(col) ?? false, false, `${o.table}.${col} (${o.key}) is only in a held migration`);
  }
  assert.ok(held.talent_offerings.has("pos_enabled"));
});
