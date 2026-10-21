import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { movePayoutForReplacement, payoutMoveKey, readShowWho, replaceTalentOnProject, type ReplaceDeps } from "./replace-with-notice.server";

type Row = Record<string, unknown>;
type Err = { code?: string; message: string } | null;

function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, Err> = {}) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: errors[table] ?? null }),
      then: (resolve: (v: { data: Row[]; error: Err }) => unknown) => resolve({ data: rows(), error: errors[table] ?? null }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const T = "t1"; const B = "b1"; const FROM = "p-from"; const TO = "p-to";
const baseTables = (showWho: string): Record<string, Row[]> => ({
  workspace_service_listings: [{ tenant_id: T, talent_profile_id: FROM, status: "accepted", show_who: showWho }],
  agency_bookings: [{ id: B, tenant_id: T, title: "Boda Ana", starts_at: "2026-11-07T20:00:00Z", timezone: "America/Cancun", currency_code: "USD" }],
  booking_talent: [{ id: "seat1", booking_id: B, tenant_id: T, talent_profile_id: TO, role_label: "Waiter", talent_cost_total: 150, units: 1 }],
});

function deps(over: Partial<ReplaceDeps> = {}) {
  const notified: Array<Record<string, unknown>> = [];
  const d: ReplaceDeps = {
    replace: async () => ({ ok: true, bookingId: B }),
    notify: async (p) => { notified.push({ ...p, admin: undefined }); return true; },
    ...over,
  };
  return { d, notified };
}
const input = { tenantId: T, bookingId: B, fromTalentId: FROM, toTalentId: TO, operationKey: "replace-12345678" };

test("show_who: name wins, then portfolio; no listing is hidden; any read error is unknown", async () => {
  assert.equal(await readShowWho(fakeAdmin(baseTables("name")), T, FROM), "name");
  assert.equal(await readShowWho(fakeAdmin(baseTables("portfolio")), T, FROM), "portfolio");
  assert.equal(await readShowWho(fakeAdmin({}), T, FROM), "hidden");
  assert.equal(await readShowWho(fakeAdmin(baseTables("name"), { workspace_service_listings: { code: "57014", message: "x" } }), T, FROM), "unknown");
  assert.equal(await readShowWho(fakeAdmin(baseTables("name"), { workspace_service_listings: { code: "42P01", message: "x" } }), T, FROM), "unknown");
});

test("replacing tells the client only when the dropped person was shown by name", async () => {
  const named = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, deps().d);
  assert.ok(named.ok);
  assert.equal(named.clientNotice, "person_changed");
  for (const sw of ["portfolio", "hidden"]) {
    const r = await replaceTalentOnProject(fakeAdmin(baseTables(sw)), input, deps().d);
    assert.ok(r.ok);
    assert.equal(r.clientNotice, "none");
  }
  const unknown = await replaceTalentOnProject(fakeAdmin(baseTables("name"), { workspace_service_listings: { code: "57014", message: "x" } }), input, deps().d);
  assert.ok(unknown.ok);
  assert.equal(unknown.clientNotice, "none");
});

test("only the changed seat is re-sent, and the new person (not the dropped one) gets their own bell", async () => {
  const { d, notified } = deps();
  const r = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, d);
  assert.ok(r.ok);
  assert.deepEqual(r.changedSeatIds, ["seat1"]);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].talentProfileId, TO);
  assert.equal(notified[0].roleId, "seat1");
  assert.equal(notified[0].role, "Waiter");
  assert.equal(notified[0].eventTitle, "Boda Ana");
  assert.equal(notified[0].timeZone, "America/Cancun");
});

test("a refused replacement (unavailable, already started) writes and notifies nothing", async () => {
  const { d, notified } = deps({ replace: async () => ({ ok: false, reason: "talent_unavailable" }) });
  const r = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, d);
  assert.deepEqual(r, { ok: false, reason: "talent_unavailable" });
  assert.equal(notified.length, 0);
});

test("when the follow-up context cannot be read the swap still stands, nobody is notified, client is not told", async () => {
  const { d, notified } = deps();
  const r = await replaceTalentOnProject(fakeAdmin(baseTables("name"), { agency_bookings: { code: "57014", message: "x" } }), input, d);
  assert.ok(r.ok);
  assert.equal(r.clientNotice, "none");
  assert.equal(notified.length, 0);
});

test("a notify that throws never fails the replacement", async () => {
  const { d } = deps({ notify: async () => { throw new Error("boom"); } });
  const r = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, d);
  assert.ok(r.ok);
});

test("the payout seam is not wired: it moves nothing, with a stable key, however often it is called", async () => {
  const move = { tenantId: T, bookingId: B, operationKey: "replace-12345678", moves: [{ talentProfileId: FROM, deltaCents: -15000 }, { talentProfileId: TO, deltaCents: 15000 }] };
  assert.deepEqual(await movePayoutForReplacement(move), { ok: false, reason: "not_wired" });
  assert.deepEqual(await movePayoutForReplacement(move), { ok: false, reason: "not_wired" });
  assert.equal(payoutMoveKey(move), payoutMoveKey({ ...move }));
  assert.notEqual(payoutMoveKey(move), payoutMoveKey({ ...move, operationKey: "replace-99999999" }));
});

test("a repeated replacement (same key) reports the plan with one stable key and never a second move", async () => {
  let attempts = 0;
  const { d } = deps({ movePayout: async () => { attempts++; return { ok: false, reason: "not_wired" }; } });
  const a = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, d);
  const b = await replaceTalentOnProject(fakeAdmin(baseTables("name")), input, d);
  assert.ok(a.ok && b.ok);
  const key = payoutMoveKey({ tenantId: T, bookingId: B, operationKey: input.operationKey });
  assert.deepEqual(a.payout, { status: "not_wired", key });
  assert.deepEqual(b.payout, a.payout);
  assert.deepEqual(a.payoutPlan, [{ talentProfileId: FROM, deltaCents: -15000 }, { talentProfileId: TO, deltaCents: 15000 }]);
  assert.equal(attempts, 2); // asked per call, refused both times: nothing moved
});
