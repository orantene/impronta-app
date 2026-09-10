/**
 * commit-order-holds.test.ts — a settled order keeps the person it booked.
 *
 * THE CLAIM. When an order settles, every talent hold it placed loses its
 * expiry, and only those: the filter is the order's own operation key, the
 * write is `expires_at = NULL`, and the three places an order becomes paid
 * all make the call.
 * Before this existed, a paid appointment's hold kept its fifteen-minute TTL
 * and the person was offered to the next guest.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  commitOrderTalentHolds,
  orderReserveOperationKey,
} from "@/lib/scheduling/commit-order-holds";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type Call = { method: string; args: unknown[] };

/** A PostgREST builder that records what was asked of it and answers with `rows`. */
function fakeAdmin(rows: Array<{ id: string }> | null, error: { message: string } | null = null) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["update", "eq", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error });
  return {
    admin: { from: (table: string) => { calls.push({ method: "from", args: [table] }); return builder; } },
    calls,
  };
}

test("the operation key is the one the purchase reserves under", () => {
  assert.equal(orderReserveOperationKey("abc"), "order:abc:reserve");
  const purchase = readFileSync(join(WEB_ROOT, "src/lib/orders/purchase.ts"), "utf8");
  assert.match(
    purchase,
    /operationKey: `order:\$\{createdOrderId\}:reserve`/,
    "purchase.ts no longer reserves under order:<id>:reserve; the commit would key on nothing",
  );
});

test("committing clears the expiry of this order's holds and nothing else", async () => {
  const { admin, calls } = fakeAdmin([{ id: "h1" }, { id: "h2" }]);
  const result = await commitOrderTalentHolds(admin, { tenantId: "t1", orderId: "o1" });
  assert.deepEqual(result, { ok: true, committed: 2 });

  assert.deepEqual(calls[0], { method: "from", args: ["talent_holds"] });
  assert.deepEqual(calls[1], { method: "update", args: [{ expires_at: null }] });
  const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.deepEqual(eqs, [
    ["tenant_id", "t1"],
    ["operation_key", "order:o1:reserve"],
  ]);
  // Nothing narrows the write beyond the order's own key: a broader filter
  // would commit somebody else's hold, a narrower one would miss a retry.
  assert.equal(calls.filter((c) => c.method === "eq").length, 2);
});

test("a missing key refuses rather than committing every hold in the workspace", async () => {
  const { admin, calls } = fakeAdmin([]);
  const result = await commitOrderTalentHolds(admin, { tenantId: "t1", orderId: "" });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "nothing may be written for an order that was not named");
});

test("a database refusal is reported, not swallowed", async () => {
  const { admin } = fakeAdmin(null, { message: "permission denied" });
  const result = await commitOrderTalentHolds(admin, { tenantId: "t1", orderId: "o1" });
  assert.deepEqual(result, { ok: false, error: "permission denied" });
});

test("every path that makes an order paid also keeps its people", () => {
  // Three writers flip an order to paid: settlement on creation, a completed
  // card transaction, and a free sale. Capacity is committed at each; the
  // person legs were committed at none, which is the defect. Each must call
  // the commit, and the call must come BEFORE the row is stamped paid so the
  // two cannot be observed disagreeing.
  const purchase = readFileSync(join(WEB_ROOT, "src/lib/orders/purchase.ts"), "utf8");
  const complete = readFileSync(join(WEB_ROOT, "src/lib/orders/complete-order.ts"), "utf8");

  const settleCall = purchase.indexOf("commitOrderTalentHolds(admin, {");
  const settlePatch = purchase.indexOf(".update(settlement.patch)");
  assert.ok(settleCall > 0, "createPurchase never keeps the people of a settled order");
  assert.ok(settleCall < settlePatch, "createPurchase stamps the order before it keeps its people");

  const cardCall = complete.indexOf("commitOrderTalentHolds(admin, { tenantId: row.tenant_id, orderId })");
  const cardFlip = complete.indexOf('.update({ status: "paid", hold_expires_at: null, version: row.version + 1 })\n      .eq("id", orderId)');
  assert.ok(cardCall > 0, "completeOrderForTransaction never keeps the people of a paid order");
  assert.ok(cardCall < cardFlip, "completeOrderForTransaction flips before it keeps the people");

  const zeroCall = complete.indexOf("commitOrderTalentHolds(admin, {\n      tenantId: input.tenantId,\n      orderId: row.id,");
  const zeroFlip = complete.indexOf('.eq("id", row.id)\n      .eq("tenant_id", input.tenantId)\n      .in("status", ["draft", "pending_payment"])');
  assert.ok(zeroCall > 0, "completeZeroTotalOrder never keeps the people of a free sale");
  assert.ok(zeroCall < zeroFlip, "completeZeroTotalOrder flips before it keeps the people");
});
