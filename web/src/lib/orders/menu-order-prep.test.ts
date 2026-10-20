/**
 * TUL-1332 PR 3: an online menu order reaches the kitchen like a POS or QR order.
 *
 * Run: node_modules/.bin/tsx --require ./scripts/register-server-only-test.cjs --test src/lib/orders/menu-order-prep.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fireMenuOrderToKitchen } from "./menu-order-prep";

const admin = {} as never;

test("an online order is sent to preparation as a pickup ticket for its tenant and order", async () => {
  const calls: unknown[] = [];
  const res = await fireMenuOrderToKitchen(admin, { tenantId: "t1", orderId: "o1" }, async (_a, input) => {
    calls.push(input);
    return { ok: true } as never;
  });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, [{ tenantId: "t1", orderId: "o1", destination: "pickup" }]);
});

test("a refused or thrown ticket never fails the order: it is reported, not raised", async () => {
  const refused = await fireMenuOrderToKitchen(admin, { tenantId: "t1", orderId: "o1" }, async () => ({ ok: false, reason: "unavailable", error: "x" }) as never);
  assert.equal(refused.ok, false);
  const thrown = await fireMenuOrderToKitchen(admin, { tenantId: "t1", orderId: "o1" }, async () => {
    throw new Error("boom");
  });
  assert.equal(thrown.ok, false);
});

test("submitMenuOrder fires the ticket after a successful order and returns the order regardless", () => {
  const src = readFileSync(new URL("../../app/(public)/_menu/menu-order-actions.ts", import.meta.url), "utf8");
  const ok = src.indexOf("if (!result.ok)");
  const fire = src.indexOf("fireMenuOrderToKitchen(");
  assert.ok(fire > ok, "the ticket is fired only after the refusal branch has returned");
  assert.match(src, /orderId: result\.orderId/);
});
