/**
 * Promos v1: the webhook seam confirms the order's held promo, on EVERY
 * delivery (a redelivery retries a confirm that failed), and never for a
 * transaction with no order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { completeOrderForTransaction } from "@/lib/orders/complete-order";

type Result = { data: unknown; error: null };

function admin(orderId: string | null, orderStatus: string): SupabaseClient {
  const from = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      update: () => q,
      maybeSingle: async (): Promise<Result> => {
        if (table === "booking_transactions") return { data: { id: "t1", order_id: orderId }, error: null };
        if (table === "orders") {
          return { data: { id: orderId, status: orderStatus, total_cents: 40000, version: 1, tenant_id: "ten", hold_expires_at: null }, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (v: Result) => unknown) =>
        resolve({ data: table === "booking_transactions" ? [{ gross_amount_cents: 40000, net_amount_cents: 40000, status: "paid", refund_of_transaction_id: null }] : [], error: null }),
    };
    return q;
  };
  const rpc = async (): Promise<Result> => ({ data: { ok: true, committed: 0 }, error: null });
  return { from, rpc } as unknown as SupabaseClient;
}

test("a paid transaction confirms its order's promo", async () => {
  const seen: string[] = [];
  const r = await completeOrderForTransaction(admin("o1", "pending_payment"), "t1", {
    confirmPromos: async (_db, orderId) => {
      seen.push(orderId);
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(seen, ["o1"]);
});

test("a redelivery for an already-paid order still runs the (idempotent) confirm", async () => {
  const seen: string[] = [];
  const r = await completeOrderForTransaction(admin("o1", "paid"), "t1", {
    confirmPromos: async (_db, orderId) => {
      seen.push(orderId);
    },
  });
  assert.deepEqual(r, { ok: true, orderId: "o1", status: "paid", committed: 0 });
  assert.deepEqual(seen, ["o1"]);
});

test("a transaction with no order confirms nothing", async () => {
  const seen: string[] = [];
  await completeOrderForTransaction(admin(null, "paid"), "t1", {
    confirmPromos: async (_db, orderId) => {
      seen.push(orderId);
    },
  });
  assert.deepEqual(seen, []);
});
