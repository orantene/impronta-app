import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwindFailedCheckout } from "./unwind-failed-checkout";

type Write = { table: string; payload: Record<string, unknown>; eq: [string, unknown][]; inStatus: string[] };

function fakeAdmin(writes: Write[]) {
  return {
    from(table: string) {
      return {
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
