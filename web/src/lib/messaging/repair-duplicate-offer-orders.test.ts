/**
 * TUL-429 repair script: planning and the safety refusals.
 * Run: node_modules/.bin/tsx --test src/lib/messaging/repair-duplicate-offer-orders.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { planDuplicateOrderRepairs, projectRefOf } from "../../../scripts/repair-duplicate-offer-orders.mjs";

const pend = (id: string, over: Record<string, unknown> = {}) => ({ id, inquiry_id: "i1", currency: "MXN", total_cents: 100000, status: "pending_payment", ...over });
const twin = (id: string, over: Record<string, unknown> = {}) => ({ id, inquiry_id: "i1", currency: "MXN", total_cents: 100000, status: "paid", ...over });

test("an unreferenced pending offer order with a live twin is cancelled", () => {
  const plan = planDuplicateOrderRepairs({ pending: [pend("a")], siblings: [twin("b")], referenced: {} });
  assert.deepEqual(plan.toCancel.map((d: { order: { id: string } }) => d.order.id), ["a"]);
  assert.equal(plan.heldBack.length, 0);
});

test("a referenced pending order (booking, link, reservation, money row) is held back, never cancelled", () => {
  const plan = planDuplicateOrderRepairs({ pending: [pend("a")], siblings: [twin("b")], referenced: { a: ["agency_bookings"] } });
  assert.equal(plan.toCancel.length, 0);
  assert.equal(plan.heldBack[0].referencedBy[0], "agency_bookings");
});

test("no twin, a cancelled twin, another total or currency, or another inquiry: nothing to cancel", () => {
  for (const sibling of [twin("b", { status: "cancelled" }), twin("b", { total_cents: 5 }), twin("b", { currency: "USD" }), twin("b", { inquiry_id: "i2" })]) {
    const plan = planDuplicateOrderRepairs({ pending: [pend("a")], siblings: [sibling], referenced: {} });
    assert.equal(plan.toCancel.length + plan.heldBack.length, 0);
  }
  assert.equal(planDuplicateOrderRepairs({ pending: [pend("a")], siblings: [], referenced: {} }).toCancel.length, 0);
});

test("the project ref comes from the URL, and writes demand --confirm-ref", () => {
  assert.equal(projectRefOf("https://fxlankepwnvelxjrahwk.supabase.co"), "fxlankepwnvelxjrahwk");
  assert.equal(projectRefOf("http://localhost:54321"), null);
  const src = readFileSync("scripts/repair-duplicate-offer-orders.mjs", "utf8");
  assert.match(src, /--confirm-ref/);
  assert.match(src, /dry run: nothing written/);
  assert.ok(src.indexOf("writeFileSync") < src.indexOf('update({ status: "cancelled" })'), "backup is written before any cancel");
});
