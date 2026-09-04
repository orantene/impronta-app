/**
 * THE COMPLETION PATH — and the lesson that made it necessary.
 *
 * Every test I wrote for `createPurchase` asserts what it WRITES: the order,
 * the lines, the booking, the transaction, the compensation on each refusal.
 * All green. **None of them asked what completes an order**, so a pipeline
 * shipped whose orders could reach `pending_payment` and never leave it, and
 * the manager who needed the completion found it rather than the person who
 * built it.
 *
 * A suite that only asserts what a function writes cannot see a missing
 * successor. These tests assert TRANSITIONS, not rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { completeOrderForTransaction } from "@/lib/orders/complete-order";

type Row = Record<string, unknown>;

function fakeAdmin(opts: {
  order?: Row | null;
  orderId?: string | null;
  paidTxns?: number[];
  allocations?: string[];
  commitFails?: string;
} = {}) {
  const updates: Row[] = [];
  const rpcs: Array<{ fn: string; args?: Row }> = [];

  const from = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      update: (payload: Row) => {
        updates.push({ table, ...payload });
        return api;
      },
      maybeSingle: async () => {
        if (table === "booking_transactions") {
          return { data: { id: "t1", order_id: opts.orderId ?? null }, error: null };
        }
        if (table === "orders") return { data: opts.order ?? null, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (table === "booking_transactions") {
          return resolve({
            data: (opts.paidTxns ?? []).map((c) => ({ gross_amount_cents: c })),
            error: null,
          });
        }
        if (table === "order_lines") {
          // `units` as a STRING is not laziness in the fake — NUMERIC(12,3)
          // really arrives that way from PostgREST, and a subscriber minting
          // one admission per unit would iterate the characters of "4.000".
          return resolve({
            data: [{ id: "line_1", units: "4.000", session_id: "s1", variant_id: "v1" }],
            error: null,
          });
        }
        if (table === "capacity_allocations") {
          return resolve({
            data: (opts.allocations ?? []).map((id) => ({ id, order_line_id: "line_1" })),
            error: null,
          });
        }
        return resolve({ data: [], error: null });
      },
    };
    return api;
  };

  const rpc = async (fn: string, args?: Row) => {
    rpcs.push({ fn, args });
    if (fn === "commit_capacity") {
      if (opts.commitFails) {
        return { data: { ok: false, reason: opts.commitFails, allocation_id: "a1" }, error: null };
      }
      return { data: { ok: true, committed: (opts.allocations ?? []).length }, error: null };
    }
    return { data: null, error: null };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { updates, rpcs, admin: { from, rpc } as any };
}

const order = (over: Row = {}) => ({
  id: "o1", status: "pending_payment", total_cents: 10000, version: 1, ...over,
});

test("a fully-paid order becomes paid", async () => {
  const { updates, admin } = fakeAdmin({ orderId: "o1", order: order(), paidTxns: [10000] });
  const r = await completeOrderForTransaction(admin, "t1");

  assert.equal(r.ok && r.status, "paid");
  const flip = updates.find((u) => u.table === "orders");
  assert.equal(flip?.status, "paid");
  // The hold is cleared: an order that is paid is not waiting on a payment.
  assert.equal(flip?.hold_expires_at, null);
});

test("A DEPOSIT DOES NOT COMPLETE A SALE", async () => {
  // The failure this guards: flipping on any paid transaction would mark a
  // 25%-deposit order as paid in full and stop anyone chasing the balance.
  const { updates, admin } = fakeAdmin({ orderId: "o1", order: order(), paidTxns: [2500] });
  const r = await completeOrderForTransaction(admin, "t1");

  assert.equal(r.ok && r.status, "pending_payment");
  assert.equal(updates.find((u) => u.table === "orders"), undefined, "must not flip");
});

test("a deposit PLUS its balance completes it", async () => {
  const { admin } = fakeAdmin({ orderId: "o1", order: order(), paidTxns: [2500, 7500] });
  const r = await completeOrderForTransaction(admin, "t1");
  assert.equal(r.ok && r.status, "paid");
});

test("overpayment still completes — it is a refund problem, not a blocker", async () => {
  const { admin } = fakeAdmin({ orderId: "o1", order: order(), paidTxns: [12000] });
  const r = await completeOrderForTransaction(admin, "t1");
  assert.equal(r.ok && r.status, "paid");
});

test("MONEY LANDED BUT THE HOLD LAPSED: the order STILL becomes paid", async () => {
  // `commit_capacity` refuses an expired hold rather than reviving it, because
  // those units may already belong to whoever reserved after the lapse. A
  // charge has completed; rolling it back to fix a seat problem would take
  // money from a customer to tidy a ledger.
  const { updates, admin } = fakeAdmin({
    orderId: "o1", order: order(), paidTxns: [10000],
    allocations: ["a1"], commitFails: "expired",
  });
  const r = await completeOrderForTransaction(admin, "t1");

  assert.equal(r.ok, true);
  assert.equal(r.ok && r.status, "paid");
  assert.equal(r.ok && r.committed, 0);
  assert.equal(updates.find((u) => u.table === "orders")?.status, "paid");
});

test("capacity is committed when the hold is still live", async () => {
  const { rpcs, admin } = fakeAdmin({
    orderId: "o1", order: order(), paidTxns: [10000], allocations: ["a1", "a2"],
  });
  const r = await completeOrderForTransaction(admin, "t1");
  assert.equal(r.ok && r.committed, 2);
  assert.ok(rpcs.some((c) => c.fn === "commit_capacity"));
});

test("REDELIVERY is idempotent — a webhook fires twice", async () => {
  const { updates, rpcs, admin } = fakeAdmin({
    orderId: "o1", order: order({ status: "paid" }), paidTxns: [10000], allocations: ["a1"],
  });
  const r = await completeOrderForTransaction(admin, "t1");

  assert.equal(r.ok && r.status, "paid");
  // No second commit, no second flip. Webhooks redeliver by design.
  assert.deepEqual(updates, []);
  assert.deepEqual(rpcs, []);
});

test("a transaction with NO order is not an error", async () => {
  // Every quoted job before 0.5 has one. They settle through the booking spine
  // exactly as before, and treating that as a failure would alarm on normal.
  const { admin } = fakeAdmin({ orderId: null });
  const r = await completeOrderForTransaction(admin, "t1");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "no_order");
});

test("the flip is version-guarded, so a concurrent write cannot be clobbered", async () => {
  const { updates, admin } = fakeAdmin({ orderId: "o1", order: order({ version: 7 }), paidTxns: [10000] });
  await completeOrderForTransaction(admin, "t1");
  assert.equal(updates.find((u) => u.table === "orders")?.version, 8);
});


// ── The onOrderPaid seam ────────────────────────────────────────────────────

test("onOrderPaid fires after the flip, with numeric units", async () => {
  const seen: Array<{ orderId: string; tenantId: string; lines: unknown[] }> = [];
  const { admin } = fakeAdmin({
    orderId: "o1",
    order: { id: "o1", status: "pending_payment", total_cents: 1000, version: 1, tenant_id: "t9" },
    paidTxns: [1000],
  });
  const r = await completeOrderForTransaction(admin, "t1", {
    onOrderPaid: async (ctx) => { seen.push(ctx); },
  });
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1, "the seam must fire exactly once on a settle");
  assert.equal(seen[0]?.tenantId, "t9");
  const line = seen[0]?.lines[0] as { units: number; sessionId: string | null };
  assert.equal(line.units, 4, "units must be a NUMBER, not the string PostgREST sends");
  assert.equal(typeof line.units, "number");
  assert.equal(line.sessionId, "s1");
});

test("a THROWING subscriber cannot un-settle the order", async () => {
  // The whole contract. A ticketing failure must not turn a completed payment
  // into a failed webhook that Stripe retries against work already done.
  const { admin } = fakeAdmin({
    orderId: "o1",
    order: { id: "o1", status: "pending_payment", total_cents: 1000, version: 1, tenant_id: "t9" },
    paidTxns: [1000],
  });
  const r = await completeOrderForTransaction(admin, "t1", {
    onOrderPaid: async () => { throw new Error("minting exploded"); },
  });
  assert.equal(r.ok, true, "a subscriber's failure must not fail the settle");
  if (r.ok) assert.equal(r.status, "paid");
});

test("onOrderPaid does NOT fire when the order did not settle", async () => {
  // A deposit does not complete a sale, so nothing downstream should think it
  // did. Minting tickets for a part-paid order is the mirror of the bug this
  // whole seam exists to avoid.
  let fired = 0;
  const { admin } = fakeAdmin({
    orderId: "o1",
    order: { id: "o1", status: "pending_payment", total_cents: 5000, version: 1, tenant_id: "t9" },
    paidTxns: [1000],
  });
  const r = await completeOrderForTransaction(admin, "t1", {
    onOrderPaid: async () => { fired += 1; },
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.status, "pending_payment");
  assert.equal(fired, 0, "a part-paid order must not mint anything");
});
