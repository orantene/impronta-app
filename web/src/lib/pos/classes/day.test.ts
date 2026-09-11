import test from "node:test";
import assert from "node:assert/strict";

import {
  appointmentState,
  clampDayOffset,
  compareByStart,
  loadClassesDay,
  sumSeats,
  venueDayWindow,
} from "./day";

type Row = Record<string, unknown>;

/**
 * A fake PostgREST client: filters on eq/in/gte/lt over an in-memory store,
 * answers `capacity_remaining_public` from a map keyed by pool id. Enough to
 * prove the reader's RULES (which rows, which figures), not the transport.
 */
function fakeAdmin(store: Record<string, Row[]>, remaining: Record<string, number | Error>) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        filters.push((row) => row[k] === v);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        filters.push((row) => vals.includes(row[k]));
        return api;
      },
      gte: (k: string, v: string) => {
        filters.push((row) => typeof row[k] === "string" && String(row[k]) >= v);
        return api;
      },
      lt: (k: string, v: string) => {
        filters.push((row) => typeof row[k] === "string" && String(row[k]) < v);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: (store[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: (store[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
    };
    return api;
  };
  const rpc = async (fn: string, args: { p_pool_id: string }) => {
    assert.equal(fn, "capacity_remaining_public");
    const answer = remaining[args.p_pool_id];
    if (answer instanceof Error) return { data: null, error: { message: answer.message } };
    return { data: answer ?? null, error: null };
  };
  return { from, rpc };
}

const ZONE = "America/Mexico_City";
// 2026-09-10 20:00 in Mexico City = 2026-09-11T02:00Z: the venue's evening
// is already tomorrow in UTC, which is the whole reason the day is the
// venue's and not the clock's.
const NOW = new Date("2026-09-11T02:00:00.000Z");
const TENANT = "t1";

test("the venue day window is the venue's midnight to midnight, not UTC's", () => {
  const w = venueDayWindow(NOW, ZONE, 0);
  assert.ok(w);
  assert.equal(w.ymd, "2026-09-10");
  assert.equal(w.from.toISOString(), "2026-09-10T06:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-09-11T06:00:00.000Z");
  assert.equal(venueDayWindow(NOW, ZONE, 1)?.ymd, "2026-09-11");
  assert.equal(venueDayWindow(NOW, "Not/AZone", 0), null);
});

test("seats sum across a night's tiers; one unreadable tier poisons the sum; no pool is uncounted", () => {
  assert.deepEqual(
    sumSeats([
      { kind: "counted", total: 12, remaining: 1 },
      { kind: "counted", total: 1, remaining: 1 },
    ]),
    { kind: "counted", total: 13, remaining: 2 },
  );
  assert.deepEqual(sumSeats([{ kind: "counted", total: 2, remaining: 0 }, { kind: "unreadable", total: 3 }]), {
    kind: "unreadable",
    total: 5,
  });
  assert.deepEqual(sumSeats([]), { kind: "uncounted" });
  assert.deepEqual(sumSeats([{ kind: "uncounted" }]), { kind: "uncounted" });
});

test("arrival order is by start then id, and the day offset is clamped", () => {
  const rows = [
    { id: "b", startsAt: "2026-09-10T16:00:00.000Z" },
    { id: "a", startsAt: "2026-09-10T16:00:00.000Z" },
    { id: "c", startsAt: "2026-09-10T15:00:00.000Z" },
  ];
  assert.deepEqual([...rows].sort(compareByStart).map((r) => r.id), ["c", "a", "b"]);
  assert.equal(clampDayOffset("3"), 3);
  assert.equal(clampDayOffset("99"), 14);
  assert.equal(clampDayOffset("-99"), -14);
  assert.equal(clampDayOffset("x"), 0);
  assert.equal(clampDayOffset(undefined), 0);
  assert.equal(appointmentState("In_Progress"), "in_progress");
  assert.equal(appointmentState("weird"), "unknown");
});

test("the day reader: today's rows only, money by the counter's rule, roster named through the order, tiers with a pool, accepted queue on the roster", async () => {
  const store: Record<string, Row[]> = {
    agency_bookings: [
      // 10:00 venue time today, $50 with $20 already paid.
      { id: "bk-1", tenant_id: TENANT, title: "Gel manicure", status: "confirmed", starts_at: "2026-09-10T15:00:00.000Z", ends_at: "2026-09-10T15:45:00.000Z", contact_name: "Ana", client_account_name: null, order_id: "ord-1" },
      // 23:30 venue time today = 05:30Z tomorrow: still TODAY at the venue.
      { id: "bk-2", tenant_id: TENANT, title: "Massage", status: "in_progress", starts_at: "2026-09-11T05:30:00.000Z", ends_at: null, contact_name: null, client_account_name: "Beto SA", order_id: null },
      // 01:00Z today = yesterday evening at the venue: NOT today.
      { id: "bk-3", tenant_id: TENANT, title: "Yesterday", status: "confirmed", starts_at: "2026-09-10T01:00:00.000Z", ends_at: null, contact_name: "Old", client_account_name: null, order_id: null },
      // Another workspace's booking at the same time: never read.
      { id: "bk-4", tenant_id: "t2", title: "Foreign", status: "confirmed", starts_at: "2026-09-10T15:00:00.000Z", ends_at: null, contact_name: "X", client_account_name: null, order_id: null },
    ],
    orders: [
      { id: "ord-1", tenant_id: TENANT, version: 3, total_cents: 5000, currency: "USD", status: "pending_payment", customer_id: "cus-1" },
      { id: "ord-2", tenant_id: TENANT, version: 1, total_cents: 0, currency: "USD", status: "paid", customer_id: "cus-2" },
    ],
    booking_transactions: [
      { order_id: "ord-1", gross_amount_cents: 2000, status: "paid" },
      { order_id: "ord-1", gross_amount_cents: 3000, status: "pending" },
    ],
    sessions: [
      { id: "ses-1", tenant_id: TENANT, title: "Evening yoga", starts_at: "2026-09-11T01:00:00.000Z", ends_at: "2026-09-11T02:00:00.000Z", status: "scheduled", offering_id: "off-1" },
      { id: "ses-2", tenant_id: TENANT, title: "Tomorrow", starts_at: "2026-09-11T15:00:00.000Z", ends_at: "2026-09-11T16:00:00.000Z", status: "scheduled", offering_id: "off-1" },
    ],
    capacity_pools: [
      { id: "pool-seat", tenant_id: TENANT, subject_kind: "session_tier", subject_id: "ses-1", units_total: 3, pool_key: "seat" },
    ],
    admissions: [
      { id: "adm-1", tenant_id: TENANT, session_id: "ses-1", holder_name: null, party_size: 1, admitted_count: 0, status: "valid", order_line_id: "line-1", created_at: "2026-09-10T00:00:00.000Z" },
      { id: "adm-2", tenant_id: TENANT, session_id: "ses-1", holder_name: "Carla", party_size: 2, admitted_count: 2, status: "valid", order_line_id: null, created_at: "2026-09-10T00:00:01.000Z" },
    ],
    session_waitlist_entries: [
      { id: "wl-1", tenant_id: TENANT, session_id: "ses-1", customer_name: "Dana", customer_email: null, party_size: 1, status: "accepted", joined_at: "2026-09-10T00:00:00.000Z", offered_at: "2026-09-10T00:10:00.000Z", offer_expires_at: "2026-09-10T00:40:00.000Z" },
      { id: "wl-2", tenant_id: TENANT, session_id: "ses-1", customer_name: "Eli", customer_email: null, party_size: 1, status: "waiting", joined_at: "2026-09-10T00:01:00.000Z", offered_at: null, offer_expires_at: null },
    ],
    talent_offering_variants: [
      { id: "var-seat", offering_id: "off-1", label: "Seat", amount_cents: 0, pool_key: "seat", is_hidden: false },
      // A tier whose pool this night does not have: not offered for it.
      { id: "var-vip", offering_id: "off-1", label: "VIP", amount_cents: 5000, pool_key: "vip", is_hidden: false },
    ],
    talent_offerings: [{ id: "off-1", tenant_id: TENANT, title: "Yoga night" }],
    order_lines: [{ id: "line-1", order_id: "ord-2" }],
    customers: [{ id: "cus-2", tenant_id: TENANT, display_name: "Bruno", email: "b@x.test" }],
  };
  const admin = fakeAdmin(store, { "pool-seat": 0 });
  const result = await loadClassesDay(admin as never, { tenantId: TENANT, timeZone: ZONE, now: NOW, dayOffset: 0 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const day = result.day;
  assert.equal(day.ymd, "2026-09-10");

  // Today's two, in arrival order; yesterday's and the foreign one absent.
  assert.deepEqual(day.appointments.map((a) => a.id), ["bk-1", "bk-2"]);
  const first = day.appointments[0]!;
  // $50 total minus the $20 PAID leg (the pending $30 does not count): $30.
  assert.equal(first.outstandingCents, 3000);
  assert.equal(first.orderVersion, 3);
  assert.equal(first.collectable, true);
  assert.equal(first.customerName, "Ana");
  const second = day.appointments[1]!;
  assert.equal(second.state, "in_progress");
  assert.equal(second.customerName, "Beto SA");
  assert.equal(second.orderId, null);
  assert.equal(second.outstandingCents, 0);

  // Only today's session; seats from the engine; the roster.
  assert.deepEqual(day.sessions.map((s) => s.id), ["ses-1"]);
  const session = day.sessions[0]!;
  assert.deepEqual(session.seats, { kind: "counted", total: 3, remaining: 0 });
  assert.deepEqual(session.tiers.map((t) => t.variantId), ["var-seat"]);
  const roster = session.roster;
  assert.equal(roster.length, 3);
  // The counter-sold admission has no holder name: named through its order's customer.
  assert.deepEqual(roster[0], { kind: "admission", admissionId: "adm-1", name: "Bruno", partySize: 1, admittedCount: 0, status: "valid" });
  assert.equal(roster[1]!.kind === "admission" && roster[1].name, "Carla");
  // The accepted queue entry holds a seat and is on the roster; the waiting one is not.
  assert.deepEqual(roster[2], { kind: "waitlist_place", entryId: "wl-1", name: "Dana", partySize: 1 });
  assert.deepEqual(session.waitlist.map((w) => [w.id, w.state]), [["wl-1", "accepted"], ["wl-2", "waiting"]]);
  assert.equal(session.nextInLineId, "wl-2");
});

test("an unreadable seat count is said, never zero", async () => {
  const store: Record<string, Row[]> = {
    agency_bookings: [],
    sessions: [{ id: "ses-1", tenant_id: TENANT, title: "Class", starts_at: "2026-09-10T16:00:00.000Z", ends_at: "2026-09-10T17:00:00.000Z", status: "scheduled", offering_id: null }],
    capacity_pools: [{ id: "pool-1", tenant_id: TENANT, subject_kind: "session_tier", subject_id: "ses-1", units_total: 8, pool_key: "default" }],
    admissions: [],
    session_waitlist_entries: [],
  };
  const admin = fakeAdmin(store, { "pool-1": new Error("boom") });
  const result = await loadClassesDay(admin as never, { tenantId: TENANT, timeZone: ZONE, now: NOW, dayOffset: 0 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.day.sessions[0]!.seats, { kind: "unreadable", total: 8 });
});
