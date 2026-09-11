import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cartTotals, totalsAreWritable } from "@/lib/cart/totals";
import { planRefund } from "@/lib/orders/refund-plan";
import { setTip } from "./tip";

test("tip sits outside subtotal and tax and inside total", () => {
  const totals = cartTotals([{ unitCents: 1000, units: 1 }], 0, 150);
  assert.equal(totals.subtotalCents, 1000);
  assert.equal(totals.tipCents, 150);
  assert.equal(totals.totalCents, 1150);
  assert.equal(totalsAreWritable(totals), true);
});

test("a partial refund leaves the tip on the plan", () => {
  const plan = planRefund({
    lines: [
      { id: "a", totalCents: 1000, refundedCents: 0 },
      { id: "b", totalCents: 1000, refundedCents: 0 },
    ],
    lineIds: ["a"],
    scope: {},
    discountCents: 0,
    transactions: [{ id: "txn", grossAmountCents: 2150, refundedCents: 0 }],
    tipCents: 150,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.isFullRefund, false);
  assert.equal(plan.totalCents, 1000);
});

test("a whole-order refund includes the tip", () => {
  const plan = planRefund({
    lines: [{ id: "a", totalCents: 1000, refundedCents: 0 }],
    lineIds: ["a"],
    scope: {},
    discountCents: 0,
    transactions: [{ id: "txn", grossAmountCents: 1150, refundedCents: 0 }],
    tipCents: 150,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.isFullRefund, true);
  assert.equal(plan.totalCents, 1150);
});

test("setTip refuses a negative amount without calling SQL", async () => {
  let called = false;
  const result = await setTip(
    {
      from: () => {
        throw new Error("no");
      },
      rpc: async () => {
        called = true;
        return { data: { ok: true }, error: null };
      },
    },
    { tenantId: "t1", orderId: "o1", tipCents: -5, operationKey: "tip-key-aa", expectedVersion: 1 },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "negative");
  assert.equal(called, false);
});

test("tip migration amends the derived total and proves a negative write is refused", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231204000_pos_tip_cents.sql"), "utf8");
  assert.match(sql, /total_cents = subtotal_cents - discount_cents \+ tax_cents \+ tip_cents/);
  assert.match(sql, /a refused tip wrote cents/);
});
