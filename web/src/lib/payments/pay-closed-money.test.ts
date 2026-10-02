import assert from "node:assert/strict";
import { test } from "node:test";

import { moneyMayHaveMoved } from "./pay-closed-money";
import { paymentInFlightForOrder } from "@/lib/talent-agenda/cancel-money";

type Rows = Record<string, unknown[]>;
function fakeAdmin(tables: Rows) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      const done = Promise.resolve({ data: rows, error: null });
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: done.then.bind(done),
      };
      void q;
      return chain;
    },
  };
}

const claimed = {
  order_collection_reservations: [{ id: "r1", state: "claimed", transaction_id: "t1", expires_at: null }],
  booking_transactions: [{ status: "payment_requested", metadata: { collection_payment_request_id: "cs_live_1" } }],
  payment_links: [{ reservation_id: "r1" }],
};

test("closed pay page: a completed Checkout session means money may have moved", async () => {
  const admin = fakeAdmin(claimed);
  assert.equal(await moneyMayHaveMoved(admin, "o1", async () => ({ ok: true, status: "complete" })), true);
});

test("closed pay page: expired session and nothing settled is genuinely nothing taken", async () => {
  const admin = fakeAdmin(claimed);
  assert.equal(await moneyMayHaveMoved(admin, "o1", async () => ({ ok: true, status: "expired" })), false);
});

test("closed pay page: an unreadable session never claims nothing was taken", async () => {
  const admin = fakeAdmin(claimed);
  assert.equal(await moneyMayHaveMoved(admin, "o1", async () => ({ ok: false })), true);
});

test("cancel preview: in-flight detection is the same completed-session condition", async () => {
  const admin = fakeAdmin(claimed);
  assert.equal(await paymentInFlightForOrder(admin, "o1", async () => ({ ok: true, status: "complete" })), true);
  assert.equal(await paymentInFlightForOrder(admin, "o1", async () => ({ ok: true, status: "expired" })), false);
  assert.equal(await paymentInFlightForOrder(admin, null), false);
});

import { cancelConsequenceKeys } from "@/components/admin/shell/internal/talent/agenda/record-actions";

test("cancel dialog: in-flight card payment never says nothing was taken", () => {
  const keys = cancelConsequenceKeys(undefined, "talent", 0, true);
  assert.ok(keys[0]!.includes("card payment may be arriving"));
  assert.ok(!keys.join(" ").includes("No payment was taken"));
  assert.ok(cancelConsequenceKeys(undefined, "talent", 0, false)[0]!.startsWith("No payment was taken"));
});
