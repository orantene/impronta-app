import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { openPurchaseThreadWithRetry } from "@/lib/orders/purchase-thread-retry";
import type { OpenPurchaseThreadInput } from "@/lib/orders/purchase-thread";

const ADMIN = {} as unknown as SupabaseClient;
const INPUT: OpenPurchaseThreadInput = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  orderId: "22222222-2222-2222-2222-222222222222",
  actorUserId: null,
  guestSessionId: null,
  contact: { email: "x@y.co" },
  holdIds: [],
  bookingId: null,
  transactionId: null,
};

test("succeeds first time: one call", async () => {
  let calls = 0;
  const id = await openPurchaseThreadWithRetry(ADMIN, INPUT, async () => {
    calls++;
    return "inq-1";
  });
  assert.equal(id, "inq-1");
  assert.equal(calls, 1);
});

test("retries once after a null result and returns the second id", async () => {
  let calls = 0;
  const id = await openPurchaseThreadWithRetry(ADMIN, INPUT, async () => {
    calls++;
    return calls === 1 ? null : "inq-2";
  });
  assert.equal(id, "inq-2");
  assert.equal(calls, 2);
});

test("a throwing opener is retried, then fails soft with null (never throws)", async () => {
  let calls = 0;
  const id = await openPurchaseThreadWithRetry(ADMIN, INPUT, async () => {
    calls++;
    throw new Error("boom");
  });
  assert.equal(id, null);
  assert.equal(calls, 2);
});
