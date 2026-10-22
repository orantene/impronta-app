/**
 * TUL-1757: no-show and cancel for a table reservation (an `admissions` row).
 *
 * The properties that matter: the counter moves ONLY when this call flipped the row (a lost race
 * counts nothing), the hold goes back through `release_capacity` (never a hand edit that could
 * break `capacity_allocations_released_stamp`), the clock is the server's, another workspace's
 * row is invisible, and a party that was already seated can be neither no-showed nor cancelled.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cancelReservation, markReservationNoShow } from "./reservation-ops";

type Row = {
  id: string;
  tenant_id: string;
  status: string;
  starts_at: string | null;
  admitted_count: number;
  seated_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  customer_id: string | null;
  allocation_id: string | null;
};

type Call = { fn: string; args: Record<string, unknown> };
type Result = { data: unknown; error: unknown };

function makeAdmin(rows: Row[], opts: { rpcError?: string; forceZeroRows?: boolean } = {}) {
  const calls: Call[] = [];
  const store = rows;

  class Query implements PromiseLike<Result> {
    private filters: Array<(r: Row) => boolean> = [];
    private patch: Partial<Row> | null = null;
    constructor(private readonly table: string) {}
    select() {
      return this;
    }
    update(patch: Partial<Row>) {
      this.patch = patch;
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => (r as Record<string, unknown>)[col] === val);
      return this;
    }
    is(col: string, val: null) {
      this.filters.push((r) => (r as Record<string, unknown>)[col] === val);
      return this;
    }
    private matched(): Row[] {
      return store.filter((r) => this.filters.every((f) => f(r)));
    }
    maybeSingle(): Promise<Result> {
      assert.equal(this.table, "admissions");
      return Promise.resolve({ data: this.matched()[0] ?? null, error: null });
    }
    then<A, B>(onF?: (v: Result) => A | PromiseLike<A>, onR?: (e: unknown) => B | PromiseLike<B>): PromiseLike<A | B> {
      const hit = opts.forceZeroRows ? [] : this.matched();
      if (this.patch) for (const r of hit) Object.assign(r, this.patch);
      return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(onF, onR);
    }
  }

  return {
    calls,
    admin: {
      from: (table: string) => new Query(table),
      rpc: (fn: string, args: Record<string, unknown>): PromiseLike<Result> => {
        calls.push({ fn, args });
        return Promise.resolve({ data: null, error: opts.rpcError ? { message: opts.rpcError } : null });
      },
    },
  };
}

const T = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-21T20:09:00.000Z");

function row(over: Partial<Row> = {}): Row {
  return {
    id: "a1",
    tenant_id: T,
    status: "valid",
    starts_at: "2026-10-21T20:00:00.000Z",
    admitted_count: 0,
    seated_at: null,
    completed_at: null,
    no_show_at: null,
    customer_id: "c1",
    allocation_id: "alloc1",
    ...over,
  };
}

describe("markReservationNoShow", () => {
  it("stamps no_show_at, releases the hold through release_capacity and bumps the counter once", async () => {
    const rows = [row()];
    const { admin, calls } = makeAdmin(rows);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: true, customerId: "c1" });
    assert.equal(rows[0]?.no_show_at, NOW.toISOString());
    assert.deepEqual(calls, [
      { fn: "release_capacity", args: { p_allocation_ids: ["alloc1"] } },
      { fn: "increment_customer_no_shows", args: { p_customer_id: "c1" } },
    ]);
  });

  it("a second mark (double click) writes nothing and counts nothing", async () => {
    const rows = [row()];
    const first = makeAdmin(rows);
    await markReservationNoShow(first.admin, { tenantId: T, admissionId: "a1", now: NOW });
    const second = makeAdmin(rows);
    const r = await markReservationNoShow(second.admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: true, already: true });
    assert.equal(second.calls.length, 0);
  });

  it("losing the race (guarded update matched 0 rows) counts nothing and releases nothing: the TUL-1757 defect", async () => {
    const { admin, calls } = makeAdmin([row()], { forceZeroRows: true });
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: true, already: true });
    assert.equal(calls.length, 0);
  });

  it("refuses before the booked time, with the server clock", async () => {
    const rows = [row({ starts_at: "2026-10-21T20:30:00.000Z" })];
    const { admin, calls } = makeAdmin(rows);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: false, reason: "reservation_not_late" });
    assert.equal(rows[0]?.no_show_at, null);
    assert.equal(calls.length, 0);
  });

  it("refuses a party that was already seated", async () => {
    const { admin } = makeAdmin([row({ admitted_count: 2, seated_at: "2026-10-21T20:02:00.000Z" })]);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: false, reason: "reservation_already_seated" });
  });

  it("refuses a cancelled reservation", async () => {
    const { admin } = makeAdmin([row({ status: "void" })]);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: false, reason: "reservation_not_valid" });
  });

  it("another workspace's reservation is not found", async () => {
    const { admin, calls } = makeAdmin([row({ tenant_id: "22222222-2222-4222-8222-222222222222" })]);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: false, reason: "reservation_not_found" });
    assert.equal(calls.length, 0);
  });

  it("a reservation with no customer and no hold still saves the no-show and touches no counter", async () => {
    const rows = [row({ customer_id: null, allocation_id: null })];
    const { admin, calls } = makeAdmin(rows);
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.deepEqual(r, { ok: true, customerId: null });
    assert.equal(calls.length, 0);
    assert.equal(rows[0]?.no_show_at, NOW.toISOString());
  });

  it("a failing counter RPC never fails the saved no-show", async () => {
    const rows = [row()];
    const { admin } = makeAdmin(rows, { rpcError: "boom" });
    const r = await markReservationNoShow(admin, { tenantId: T, admissionId: "a1", now: NOW });
    assert.equal(r.ok, true);
    assert.equal(rows[0]?.no_show_at, NOW.toISOString());
  });
});

describe("cancelReservation", () => {
  it("voids the row and releases its hold", async () => {
    const rows = [row()];
    const { admin, calls } = makeAdmin(rows);
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: true });
    assert.equal(rows[0]?.status, "void");
    assert.deepEqual(calls, [{ fn: "release_capacity", args: { p_allocation_ids: ["alloc1"] } }]);
  });

  it("cancelling twice is one cancel", async () => {
    const rows = [row({ status: "void" })];
    const { admin, calls } = makeAdmin(rows);
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: true, already: true });
    assert.equal(calls.length, 0);
  });

  it("lost race: guarded update matched 0 rows, hold left alone", async () => {
    const { admin, calls } = makeAdmin([row()], { forceZeroRows: true });
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: true, already: true });
    assert.equal(calls.length, 0);
  });

  it("never cancels a party that is already at the table", async () => {
    const rows = [row({ admitted_count: 2, seated_at: "2026-10-21T20:02:00.000Z" })];
    const { admin } = makeAdmin(rows);
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: false, reason: "reservation_already_seated" });
    assert.equal(rows[0]?.status, "valid");
  });

  it("a refunded reservation is not valid to cancel", async () => {
    const { admin } = makeAdmin([row({ status: "refunded" })]);
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: false, reason: "reservation_not_valid" });
  });

  it("another workspace's reservation is not found", async () => {
    const { admin } = makeAdmin([row({ tenant_id: "22222222-2222-4222-8222-222222222222" })]);
    const r = await cancelReservation(admin, { tenantId: T, admissionId: "a1" });
    assert.deepEqual(r, { ok: false, reason: "reservation_not_found" });
  });
});
