import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { holdTalentsForProject, loadProjectHolds, releaseProjectHold, type HoldDeps } from "./project-holds.server";

type Row = Record<string, unknown>;
type Err = { code?: string; message: string } | null;

function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, Err> = {}) {
  const from = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    let ins: string[] | null = null;
    let del = false;
    const match = (r: Row) => eqs.every(([k, v]) => r[k] === v) && (!ins || ins.includes(String(r.talent_profile_id)));
    const q: Record<string, unknown> = {
      select: () => q,
      delete: () => { del = true; return q; },
      eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; },
      in: (_k: string, v: string[]) => { ins = v; return q; },
      or: () => q,
      maybeSingle: async () => ({ data: (tables[table] ?? []).filter(match)[0] ?? null, error: errors[table] ?? null }),
      then: (resolve: (v: { data: Row[]; error: Err }) => unknown) => {
        const err = errors[table] ?? null;
        const hit = (tables[table] ?? []).filter(match);
        if (del && !err) tables[table] = (tables[table] ?? []).filter((r) => !match(r));
        return resolve({ data: err ? [] : hit, error: err });
      },
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const T = "t1", B = "b1", INQ = "i1", U = "u1";
const future = { starts_at: "2099-11-07T20:00:00Z", ends_at: "2099-11-08T02:00:00Z" };
const tables = (): Record<string, Row[]> => ({
  agency_bookings: [{ id: B, tenant_id: T, title: "Boda Ana", source_inquiry_id: INQ, ...future }],
  booking_talent: [{ booking_id: B, tenant_id: T, talent_profile_id: "on-job" }],
  agency_talent_roster: [
    { tenant_id: T, status: "active", talent_profile_id: "a" },
    { tenant_id: T, status: "active", talent_profile_id: "b" },
    { tenant_id: T, status: "active", talent_profile_id: "on-job" },
    { tenant_id: "other", status: "active", talent_profile_id: "foreign" },
  ],
  talent_holds: [],
});

function deps(taken: string[] = []) {
  const placed: Array<Record<string, unknown>> = [];
  const d: HoldDeps = {
    place: async (admin, input) => {
      if (taken.includes(input.talentProfileId)) return { ok: false, code: "slot_taken", error: "x" };
      placed.push({ ...input });
      (admin as unknown as { __t?: Record<string, Row[]> }).__t?.talent_holds?.push({ id: `h-${input.talentProfileId}` });
      return { ok: true, holdId: `h-${input.talentProfileId}`, expiresAt: String(input.expiresAt) };
    },
  };
  return { d, placed };
}
const input = { tenantId: T, userId: U, bookingId: B };

test("create: holds each picked roster person over the booking's own window, linked to the conversation", async () => {
  const { d, placed } = deps();
  const r = await holdTalentsForProject(fakeAdmin(tables()), { ...input, talentProfileIds: ["a", "b"] }, d);
  assert.ok(r.ok && r.held === 2);
  assert.equal(placed.length, 2);
  assert.equal(placed[0].inquiryId, INQ);
  assert.equal(placed[0].tenantId, T);
  assert.equal(placed[0].createdByUserId, U);
  assert.equal(placed[0].startsAt, "2099-11-07T20:00:00.000Z");
  assert.equal(placed[0].title, "Boda Ana");
});

test("create: off-roster (another workspace's person), already-on-job and already-held people are not held", async () => {
  const t = tables();
  t.talent_holds.push({ id: "h0", tenant_id: T, inquiry_id: INQ, talent_profile_id: "b", expires_at: null });
  const { d, placed } = deps();
  const r = await holdTalentsForProject(fakeAdmin(t), { ...input, talentProfileIds: ["a", "b", "on-job", "foreign"] }, d);
  assert.ok(r.ok);
  if (!r.ok) return;
  const by = Object.fromEntries(r.outcomes.map((o) => [o.talentProfileId, o.outcome]));
  assert.deepEqual(by, { a: "held", b: "already_held", "on-job": "already_assigned", foreign: "not_on_roster" });
  assert.deepEqual(placed.map((p) => p.talentProfileId), ["a"]);
});

test("create: a slot taken by someone else is reported per person and the others still hold", async () => {
  const { d } = deps(["a"]);
  const r = await holdTalentsForProject(fakeAdmin(tables()), { ...input, talentProfileIds: ["a", "b"] }, d);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.held, 1);
    assert.equal(r.outcomes.find((o) => o.talentProfileId === "a")?.outcome, "slot_taken");
  }
});

test("create: refusals - other workspace's booking, no conversation, no window, unreadable reads", async () => {
  const { d, placed } = deps();
  assert.deepEqual(await holdTalentsForProject(fakeAdmin(tables()), { ...input, tenantId: "other", talentProfileIds: ["a"] }, d), { ok: false, reason: "not_found" });
  const noInq = tables();
  noInq.agency_bookings[0].source_inquiry_id = null;
  assert.deepEqual(await holdTalentsForProject(fakeAdmin(noInq), { ...input, talentProfileIds: ["a"] }, d), { ok: false, reason: "no_inquiry" });
  const noWin = tables();
  noWin.agency_bookings[0].starts_at = null;
  assert.deepEqual(await holdTalentsForProject(fakeAdmin(noWin), { ...input, talentProfileIds: ["a"] }, d), { ok: false, reason: "no_window" });
  assert.deepEqual(await holdTalentsForProject(fakeAdmin(tables(), { agency_talent_roster: { message: "boom" } }), { ...input, talentProfileIds: ["a"] }, d), { ok: false, reason: "unavailable" });
  assert.deepEqual(await holdTalentsForProject(fakeAdmin(tables(), { talent_holds: { message: "boom" } }), { ...input, talentProfileIds: ["a"] }, d), { ok: false, reason: "unavailable" });
  assert.equal(placed.length, 0);
});

test("load: only this workspace's holds for the job's conversation; unreadable is not 'none'", async () => {
  const t = tables();
  t.talent_holds.push(
    { id: "h1", tenant_id: T, inquiry_id: INQ, talent_profile_id: "a", expires_at: null },
    { id: "h2", tenant_id: "other", inquiry_id: INQ, talent_profile_id: "a", expires_at: null },
    { id: "h3", tenant_id: T, inquiry_id: "i2", talent_profile_id: "a", expires_at: null },
  );
  assert.deepEqual((await loadProjectHolds(fakeAdmin(t), T, INQ) as unknown[]).length, 1);
  assert.deepEqual(await loadProjectHolds(fakeAdmin(t), T, null), []);
  assert.equal(await loadProjectHolds(fakeAdmin(t, { talent_holds: { message: "x" } }), T, INQ), "unreadable");
});

test("release: removes this job's hold; another workspace's hold or another job's hold is not found", async () => {
  const t = tables();
  t.talent_holds.push(
    { id: "mine", tenant_id: T, inquiry_id: INQ, talent_profile_id: "a" },
    { id: "foreign", tenant_id: "other", inquiry_id: INQ, talent_profile_id: "a" },
    { id: "elsewhere", tenant_id: T, inquiry_id: "i2", talent_profile_id: "a" },
  );
  const admin = fakeAdmin(t);
  assert.deepEqual(await releaseProjectHold(admin, { tenantId: T, bookingId: B, holdId: "foreign" }), { ok: false, reason: "not_found" });
  assert.deepEqual(await releaseProjectHold(admin, { tenantId: T, bookingId: B, holdId: "elsewhere" }), { ok: false, reason: "not_found" });
  assert.deepEqual(await releaseProjectHold(admin, { tenantId: T, bookingId: B, holdId: "mine" }), { ok: true });
  assert.deepEqual(t.talent_holds.map((h) => h.id).sort(), ["elsewhere", "foreign"]);
  assert.deepEqual(await releaseProjectHold(admin, { tenantId: "other", bookingId: B, holdId: "foreign" }), { ok: false, reason: "not_found" });
  assert.deepEqual(await releaseProjectHold(fakeAdmin(t, { talent_holds: { message: "x" } }), { tenantId: T, bookingId: B, holdId: "elsewhere" }), { ok: false, reason: "unavailable" });
});
