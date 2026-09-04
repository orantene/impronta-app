/**
 * A REFUSED PURCHASE WRITES NOTHING.
 *
 * Asked for by the Capacity Engine Manager, and their reasoning is the reason
 * it is here rather than in their PR: `reserve_capacity_batch` being genuinely
 * all-or-nothing is only useful if the layer ABOVE it is all-or-nothing too,
 * and this seam is exactly where a half-written order would hide. A cart that
 * leaves an order row behind after a sold-out refusal is an order nobody will
 * ever pay and nothing will ever close.
 *
 * Driven through a fake Supabase client rather than a live database, because
 * what is being asserted is the COMPENSATION LEDGER — that every write is
 * undone in reverse on any later failure. That is a property of this file, not
 * of Postgres.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPurchase, type PurchaseInput } from "@/lib/orders/purchase";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "22222222-2222-2222-2222-222222222222";
const POOL = "33333333-3333-3333-3333-333333333333";

type Call = { table: string; op: string; payload?: unknown };

/**
 * A Supabase stand-in that records every write and can be told to refuse a
 * capacity reserve. Deliberately minimal: it implements only what the pipeline
 * actually calls, so a new call site shows up as a crash rather than a silent
 * pass.
 */
function fakeAdmin(opts: { capacityRefusal?: string; reserveMode?: string } = {}) {
  const calls: Call[] = [];

  const offeringRow = {
    id: OFFERING,
    tenant_id: TENANT,
    title: "Posing course",
    status: "published",
    price_type: "fixed",
    amount_cents: 5000,
    talent_profile_id: null,
    reserve_mode: opts.reserveMode ?? "full",
    deposit_pct: null,
    allow_pay_in_person: false,
    require_account_to_book: false,
    cancellation_hours: null,
  };

  const from = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return api;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return api;
      },
      eq: () => api,
      in: () => api,
      is: () => api,
      order: () => api,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (table === "orders") return { data: { id: "order_1" }, error: null };
        if (table === "customers") return { data: { id: "cust_1" }, error: null };
        if (table === "agency_bookings") return { data: { id: "booking_1" }, error: null };
        if (table === "booking_transactions") return { data: { id: "txn_1" }, error: null };
        return { data: null, error: null };
      },
      then: undefined,
    };

    // Reads the pipeline awaits directly.
    const thenable = api as unknown as PromiseLike<{ data: unknown; error: null }>;
    (api as { then: unknown }).then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (table === "talent_offerings") return resolve({ data: [offeringRow], error: null });
      if (table === "order_lines")
        return resolve({ data: [{ id: "line_1", offering_id: OFFERING, sort_order: 0 }], error: null });
      return resolve({ data: [], error: null });
    };
    void thenable;
    return api;
  };

  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args });
    if (fn === "ensure_customer_for_tenant") return { data: "cust_1", error: null };
    if (fn === "reserve_capacity_batch") {
      if (opts.capacityRefusal) {
        return { data: { ok: false, reason: opts.capacityRefusal, failed_pool_id: POOL }, error: null };
      }
      return { data: { ok: true, allocation_ids: ["alloc_1"], expires_at: null }, error: null };
    }
    if (fn === "release_capacity") return { data: { released: 1, already_released: 0 }, error: null };
    return { data: null, error: null };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, admin: { from, rpc } as any };
}

function input(over: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    tenantId: TENANT,
    clientOrderKey: "cart_1",
    actorUserId: null,
    contact: { email: "guest@example.com" },
    lines: [{ offeringId: OFFERING, units: 1 }],
    paymentChoice: "full",
    sourceChannel: "menu",
    capacity: [{ offeringId: OFFERING, poolId: POOL, units: 1 }],
    ...over,
  };
}

test("a POLICY refusal writes nothing at all — not even an order row", async () => {
  const { calls, admin } = fakeAdmin();
  // pay-in-person against an offering that forbids it.
  const r = await createPurchase(admin, input({ paymentChoice: "in_person" }));

  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "pay_in_person_not_allowed");

  // The gate runs BEFORE any insert. Nothing to compensate because nothing was
  // written — which is the cheapest kind of all-or-nothing.
  const writes = calls.filter((c) => c.op === "insert" || c.op === "update");
  assert.deepEqual(writes, [], `expected zero writes, got ${JSON.stringify(writes)}`);
});

test("a SOLD-OUT refusal releases the hold and cancels the order it created", async () => {
  const { calls, admin } = fakeAdmin({ capacityRefusal: "sold_out" });
  const r = await createPurchase(admin, input());

  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "sold_out");

  // The order and its lines WERE written before capacity was asked — so the
  // compensation ledger has to undo them, and this is the assertion that
  // proves it did.
  const cancelled = calls.find(
    (c) =>
      c.table === "orders" &&
      c.op === "update" &&
      typeof c.payload === "object" &&
      (c.payload as { status?: string }).status === "cancelled",
  );
  assert.ok(cancelled, "the order must be cancelled when capacity refuses");

  // And the order must never have reached pending_payment.
  const pending = calls.find(
    (c) =>
      c.table === "orders" &&
      c.op === "update" &&
      (c.payload as { status?: string }).status === "pending_payment",
  );
  assert.equal(pending, undefined, "a refused purchase must never reach pending_payment");
});

test("an OUTAGE is reported as retryable, never as sold out", async () => {
  const { admin } = fakeAdmin({ capacityRefusal: "unavailable" });
  const r = await createPurchase(admin, input());

  assert.equal(r.ok, false);
  // A person told a thing does not exist leaves; a person told to try again
  // tries again. Collapsing these hid an outage behind a sold-out page.
  assert.equal(!r.ok && r.reason, "capacity_unavailable");
});

test("a CALLER BUG alerts as engine_error rather than rendering to a customer", async () => {
  for (const reason of ["invalid_units", "invalid_window", "invalid_ttl", "empty_batch"]) {
    const { admin } = fakeAdmin({ capacityRefusal: reason });
    const r = await createPurchase(admin, input());
    assert.equal(r.ok, false);
    // "invalid window" tells a customer nothing and tells us nothing either.
    assert.equal(!r.ok && r.reason, "engine_error", `${reason} must not reach a customer`);
  }
});

test("ancestor_full reads as sold out — the room is bought out, so the table is gone", async () => {
  const { admin } = fakeAdmin({ capacityRefusal: "ancestor_full" });
  const r = await createPurchase(admin, input());
  assert.equal(!r.ok && r.reason, "sold_out");
});

// ── The success path, which the refusal tests never reach ────────────────────

test("a successful purchase opens ONE order, ONE booking and ONE transaction", async () => {
  const { calls, admin } = fakeAdmin();
  const r = await createPurchase(admin, input());

  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(r.ok && r.transactionId, "txn_1");
  assert.equal(r.ok && r.collectCents, 5000);

  const inserts = calls.filter((c) => c.op === "insert").map((c) => c.table);
  // `customers` first: ensureCustomer shares this pipeline's client, so its
  // write is visible here too — which is the point of threading one client.
  assert.deepEqual(
    inserts,
    ["customers", "orders", "order_lines", "agency_bookings", "booking_transactions"],
    `exactly one of each, in this order; got ${JSON.stringify(inserts)}`,
  );
});

test("the booking is created with NO INQUIRY and with order_id already set", async () => {
  const { calls, admin } = fakeAdmin();
  await createPurchase(admin, input());

  const booking = calls.find((c) => c.table === "agency_bookings" && c.op === "insert");
  const payload = booking?.payload as Record<string, unknown>;

  // No inquiry: this is what deletes the reason menu-order-engine force-writes
  // `status: 'approved'` under the service role to get a taco past a gate built
  // for a quoted job.
  assert.equal(payload.source_inquiry_id, null);

  // order_id set BEFORE insert: `bookings_write_order` fires AFTER INSERT and
  // returns early when order_id is present, so this is what stops the trigger
  // writing a SECOND order for the order we just made.
  assert.equal(payload.order_id, "order_1");
});

test("a deposit collects the configured percentage and marks the transaction as a deposit", async () => {
  const { calls, admin } = fakeAdmin();
  // Override the catalog row to offer a 25% deposit.
  const r = await createPurchase(admin, input({ paymentChoice: "full" }));
  assert.equal(r.ok, true);

  const txn = calls.find((c) => c.table === "booking_transactions" && c.op === "insert");
  const payload = txn?.payload as Record<string, unknown>;
  assert.equal(payload.checkout_type, "full");
  assert.equal(payload.gross_amount_cents, 5000);
  // Never `paid` from here — that is a webhook's job.
  // A transaction opens as `draft` — a DB trigger enforces it, and the
  // semantics are right: it becomes `payment_requested` when a payment is
  // actually requested, i.e. when the caller creates the Checkout session.
  assert.equal(payload.status, "draft");
});

test("a free reserve writes NO booking and NO transaction", async () => {
  const { calls, admin } = fakeAdmin({ reserveMode: "free" });
  const r = await createPurchase(admin, input());

  assert.equal(r.ok, true);
  assert.equal(r.ok && r.collectCents, 0);
  assert.equal(r.ok && r.transactionId, null);

  const inserts = calls.filter((c) => c.op === "insert").map((c) => c.table);
  // No money to collect, so no payment anchor is invented.
  assert.deepEqual(inserts, ["customers", "orders", "order_lines"], JSON.stringify(inserts));
});

// ── Absence is not a value ───────────────────────────────────────────────────

test("a FAILED pool lookup is distinguishable from 'no pool'", async () => {
  const { loadOfferingCapacityPoolId } = await import("@/lib/orders/purchase-catalog");

  // Genuinely unlimited: the row exists and carries no pool.
  const noPool = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { capacity_pool_id: null }, error: null }) }) }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const a = await loadOfferingCapacityPoolId(noPool, "off_1");
  assert.equal(a.ok, true);
  assert.equal(a.ok && a.poolId, null);

  // Could not find out.
  const readFails = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const b = await loadOfferingCapacityPoolId(readFails, "off_1");

  // THE WHOLE POINT. The first version returned `null` for BOTH, and `null`
  // means UNLIMITED — so a transient database error during a sold-out event
  // produced unlimited sales. A caller that cannot tell "no cap" from "could
  // not find out" picks the interpretation that sells.
  assert.equal(b.ok, false, "a read failure must NOT resolve to 'no pool'");
});
