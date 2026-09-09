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
import {
  completeOrderForTransaction,
  completeZeroTotalOrder,
} from "@/lib/orders/complete-order";

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
      upsert: (payload: unknown) => {
        updates.push({ table, upsert: payload });
        return Promise.resolve({ data: payload, error: null });
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
  assert.ok(
    updates.some((u) => u.table === "ticket_refund_intents"),
    "a paid order with no seat must leave a compensation row",
  );
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


// ── A free sale keeps what it reserved ───────────────────────────────────────
//
// The order side of this was right from the start: `hold_expires_at` is
// cleared, so the ORDER is settled. The capacity side was not. An allocation
// left as a `hold` counts towards `remaining()` only while
// `expires_at > now()`, so a free class registration taken at the till stopped
// holding its place fifteen minutes later and `reap_capacity_allocations`
// released it — silently, with nothing failing and nothing logged.

const freeOrder = (over: Row = {}) => ({
  id: "o1", status: "pending_payment", total_cents: 0, version: 1, tenant_id: "t9", ...over,
});

test("a free sale commits its places rather than leaving them on a payment TTL", async () => {
  const { updates, rpcs, admin } = fakeAdmin({ order: freeOrder(), allocations: ["a1", "a2"] });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });

  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(r.ok && r.committed, 2);

  const commit = rpcs.find((c) => c.fn === "commit_capacity");
  assert.ok(commit, "settling the order is not enough — the hold has its own clock");
  assert.deepEqual((commit.args as { p_allocation_ids?: string[] })?.p_allocation_ids, ["a1", "a2"]);

  const flip = updates.find((u) => u.table === "orders");
  assert.equal(flip?.status, "paid");
  assert.equal(flip?.hold_expires_at, null);
});

test("a free sale whose places have already lapsed is REFUSED, not completed", async () => {
  const { updates, admin } = fakeAdmin({
    order: freeOrder(), allocations: ["a1"], commitFails: "expired",
  });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });

  // No money moved, so refusing is honest and cheap. Completing instead would
  // hand the operator a registration for a place somebody else can now buy.
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "Those places are no longer held.");
  assert.equal(updates.find((u) => u.table === "orders"), undefined, "must not flip");
});

test("a free sale holding no capacity still completes", async () => {
  // A $0 retail line reserves nothing. Requiring a commit here would refuse
  // every free sale that is not a seat.
  const { rpcs, admin } = fakeAdmin({ order: freeOrder(), allocations: [] });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.committed, 0);
  assert.equal(rpcs.some((c) => c.fn === "commit_capacity"), false);
});

test("a free sale refuses another workspace's order", async () => {
  const { admin } = fakeAdmin({ order: freeOrder({ tenant_id: "someone-else" }) });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "not_found");
});

test("a free sale is idempotent, and re-committing is not attempted", async () => {
  const { rpcs, updates, admin } = fakeAdmin({
    order: freeOrder({ status: "paid" }), allocations: ["a1"],
  });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });
  assert.equal(r.ok && r.status, "paid");
  assert.deepEqual(updates, []);
  assert.deepEqual(rpcs, []);
});

test("a sale that is NOT free is refused here — this path fabricates no charge", async () => {
  const { admin } = fakeAdmin({ order: freeOrder({ total_cents: 1800 }) });
  const r = await completeZeroTotalOrder(admin, { tenantId: "t9", orderId: "o1" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "This sale is not free.");
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
