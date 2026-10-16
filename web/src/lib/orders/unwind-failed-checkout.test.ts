import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwindClosedCheckoutSession, unwindFailedCheckout } from "./unwind-failed-checkout";

type Write = { table: string; payload: Record<string, unknown>; eq: [string, unknown][]; inStatus: string[] };

function fakeAdmin(writes: Write[]) {
  return {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq: () => chain,
            in: () => Promise.resolve({ data: [{ id: "b3", source_inquiry_id: "i3" }], error: null }),
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          const w: Write = { table, payload, eq: [], inStatus: [] };
          writes.push(w);
          const chain = {
            eq(col: string, v: unknown) {
              w.eq.push([col, v]);
              return chain;
            },
            in(_col: string, vals: string[]) {
              w.inStatus = vals;
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("failed checkout releases slot and capacity, fails txn, cancels order (guarded on unpaid)", async () => {
  const writes: Write[] = [];
  const calls: string[] = [];
  const res = await unwindFailedCheckout(
    fakeAdmin(writes),
    {
      orderId: "o1",
      transactionId: "t1",
      allocationIds: ["a1", "a2"],
      reservationHoldId: "h1",
      why: "checkout_session_failed",
    },
    {
      releaseHold: async (_a, id) => {
        calls.push(`hold:${id}`);
        return { ok: true };
      },
      releaseAllocations: async (ids) => {
        calls.push(`cap:${ids.join(",")}`);
        return { ok: true, released: ids.length, alreadyReleased: 0 } as never;
      },
    },
  );
  assert.equal(res.ok, true);
  assert.deepEqual(calls, ["hold:h1", "cap:a1,a2"]);
  assert.deepEqual(writes.map((w) => w.table), ["booking_transactions", "orders"]);
  assert.equal(writes[0].payload.status, "failed");
  assert.ok(!writes[0].inStatus.includes("paid"));
  assert.equal(writes[1].payload.status, "cancelled");
  assert.deepEqual(writes[1].inStatus, ["draft", "pending_payment"]);
});

test("no hold and no transaction still cancels the order", async () => {
  const writes: Write[] = [];
  await unwindFailedCheckout(
    fakeAdmin(writes),
    { orderId: "o2", transactionId: null, allocationIds: [], reservationHoldId: null, why: "x" },
    {
      releaseHold: async () => {
        throw new Error("should not run");
      },
      releaseAllocations: async () => {
        throw new Error("should not run");
      },
    },
  );
  assert.deepEqual(writes.map((w) => w.table), ["orders"]);
});

test("TUL-714: a failed checkout also cancels the unpaid booking it placed (never a paid one)", async () => {
  const writes: Write[] = [];
  await unwindFailedCheckout(
    fakeAdmin(writes),
    { orderId: "o3", transactionId: "t3", bookingId: "b3", allocationIds: [], reservationHoldId: null, why: "checkout_session_refused" },
    {
      releaseHold: async () => ({ ok: true }),
      releaseAllocations: async () => ({ ok: true }) as never,
    },
  );
  const tables = writes.map((w) => w.table);
  assert.ok(tables.includes("agency_bookings"));
  assert.ok(tables.includes("talent_bookings"));
  const agency = writes.find((w) => w.table === "agency_bookings");
  assert.equal(agency?.payload.status, "cancelled");
  assert.deepEqual(agency?.eq.find(([c]) => c === "payment_status"), ["payment_status", "unpaid"]);
  assert.deepEqual(agency?.inStatus, ["b3"]);
});

type TxnRow = { id: string; status: string; order_id: string | null; booking_id: string | null; metadata: unknown };

function fakeAdminWithTxn(writes: Write[], txn: TxnRow | null) {
  const base = fakeAdmin(writes) as unknown as { from: (t: string) => Record<string, unknown> };
  return {
    from(table: string) {
      if (table !== "booking_transactions") return base.from(table);
      const inner = base.from(table);
      return {
        ...inner,
        select() {
          const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: txn, error: null }) };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("TUL-706 (b): an expired Stripe session for an instant order runs the same unwind", async () => {
  const writes: Write[] = [];
  const res = await unwindClosedCheckoutSession(
    fakeAdminWithTxn(writes, { id: "t4", status: "pending", order_id: "o4", booking_id: "b3", metadata: {} }),
    { transactionId: "00000000-0000-4000-8000-000000000004", reason: "expired" },
  );
  assert.equal(res.outcome, "unwound");
  const tables = writes.map((w) => w.table);
  assert.ok(tables.includes("agency_bookings"));
  assert.ok(tables.includes("orders"));
  const agency = writes.find((w) => w.table === "agency_bookings");
  assert.deepEqual(agency?.eq.find(([c]) => c === "payment_status"), ["payment_status", "unpaid"]);
});

test("TUL-706 (b): a paid, link or foreign transaction is left alone", async () => {
  for (const txn of [
    { id: "t5", status: "paid", order_id: "o5", booking_id: "b5", metadata: {} },
    { id: "t6", status: "pending", order_id: "o6", booking_id: "b6", metadata: { payment_link_id: "l1" } },
    null,
  ]) {
    const writes: Write[] = [];
    const res = await unwindClosedCheckoutSession(fakeAdminWithTxn(writes, txn), {
      transactionId: "00000000-0000-4000-8000-000000000005",
      reason: "expired",
    });
    assert.equal(res.outcome, "skipped");
    assert.equal(writes.length, 0);
  }
});
