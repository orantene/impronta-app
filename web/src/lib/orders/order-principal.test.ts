import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  ORDER_MONEY_STATUSES,
  collectedByOrder,
  orderRowPrincipalCents,
  sumOrderCollectedCents,
} from "./order-principal";

const WEB = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

test("pass-through: gross 101500 net 100000 counts the principal", () => {
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 101500, net_amount_cents: 100000 }), 100000);
});

test("net equal to gross counts it", () => {
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 50000, net_amount_cents: 50000 }), 50000);
});

test("null, NaN, negative or above-gross net falls back to gross", () => {
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 500, net_amount_cents: null }), 500);
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 500 }), 500);
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 500, net_amount_cents: "abc" }), 500);
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 500, net_amount_cents: -1 }), 500);
  assert.equal(orderRowPrincipalCents({ gross_amount_cents: 500, net_amount_cents: 600 }), 500);
});

test("refund rows and non-money statuses are ignored", () => {
  const rows = [
    { gross_amount_cents: 1000, net_amount_cents: 1000, status: "paid" },
    { gross_amount_cents: 1000, net_amount_cents: 1000, status: "paid", refund_of_transaction_id: "t1" },
    { gross_amount_cents: 1000, net_amount_cents: 1000, status: "refunded" },
    { gross_amount_cents: 1000, net_amount_cents: 1000, status: "pending" },
    { gross_amount_cents: 700, net_amount_cents: 700, status: "payout_sent" },
  ];
  assert.equal(sumOrderCollectedCents(rows), 1700);
  assert.equal(collectedByOrder(rows.map((r) => ({ ...r, order_id: "o1" }))).get("o1"), 1700);
});

test("mixed pass-through and cash sums to the principal", () => {
  const rows = [
    { order_id: "o1", gross_amount_cents: 101500, net_amount_cents: 100000, status: "paid" },
    { order_id: "o1", gross_amount_cents: 20000, net_amount_cents: 20000, status: "paid" },
  ];
  assert.equal(sumOrderCollectedCents(rows), 120000);
  assert.equal(collectedByOrder(rows).get("o1"), 120000);
});

test("static: ORDER_MONEY_STATUSES equals the latest SQL order_money_statuses()", () => {
  const dir = path.resolve(WEB, "../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let latest: string[] | null = null;
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    const re = /FUNCTION\s+public\.order_money_statuses\(\)[\s\S]*?SELECT\s+ARRAY\[([^\]]*)\]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      latest = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  assert.ok(latest, "no order_money_statuses() definition found");
  assert.deepEqual([...ORDER_MONEY_STATUSES].sort(), [...latest!].sort());
});

const READERS = [
  "src/app/(workspace)/[tenantSlug]/_data-bridge/orders.ts",
  "src/app/(workspace)/[tenantSlug]/_data-bridge/payments-activity.ts",
  "src/lib/projects/projects-reader.ts",
  "src/app/(workspace)/[tenantSlug]/admin/pos/_projects/projects-mode-loader.ts",
  "src/app/(public)/manage/[token]/page.tsx",
];

test("static: the 5 readers use order-principal and no longer sum gross for collection", () => {
  for (const rel of READERS) {
    const src = read(rel);
    assert.match(src, /from "@\/lib\/orders\/order-principal"/, rel);
    assert.doesNotMatch(src, /\+\s*Number\(\s*\w+\.gross_amount_cents/, rel);
    assert.doesNotMatch(src, /\+\s*num\(\s*\w+\.gross_amount_cents/, rel);
  }
});

test("static: refund-execute still sums gross", () => {
  const src = read("src/lib/payments/refund-execute.ts");
  assert.match(src, /gross_amount_cents/);
  assert.doesNotMatch(src, /order-principal/);
});

// ── Payout statuses keep counting (balance due must not reappear) ──────────
const PASS_THROUGH = { order_id: "o1", gross_amount_cents: 101500, net_amount_cents: 100000 };

for (const status of ["payout_sent", "payout_pending", "payout"]) {
  test(`MX$1,000 order, only row ${status}: collected 100000, balance 0`, () => {
    const rows = [{ ...PASS_THROUGH, status, refund_of_transaction_id: null }];
    const collected = sumOrderCollectedCents(rows);
    assert.equal(collected, 100000);
    assert.equal(100000 - collected, 0);
    assert.equal(collectedByOrder(rows).get("o1"), 100000);
  });
}

test("failed status collects nothing", () => {
  const rows = [{ ...PASS_THROUGH, status: "failed", refund_of_transaction_id: null }];
  assert.equal(sumOrderCollectedCents(rows), 0);
});

test("order collection readers no longer filter on status = paid", () => {
  const files = [
    "src/app/(workspace)/[tenantSlug]/_data-bridge/orders.ts",
    "src/app/(workspace)/[tenantSlug]/_data-bridge/payments-activity.ts",
    "src/lib/projects/projects-reader.ts",
    "src/app/(workspace)/[tenantSlug]/admin/pos/_projects/projects-mode-loader.ts",
    "src/app/(public)/manage/[token]/page.tsx",
    "src/lib/orders/complete-order.ts",
    "src/lib/orders/orders-for-thread.ts",
  ];
  for (const f of files) {
    const src = read(f);
    const owed = f.endsWith("payments-activity.ts")
      ? src.slice(src.indexOf("owedCollected") - 600, src.indexOf("owedCollected") + 100)
      : src;
    assert.ok(!/\.eq\("status",\s*(PAID|"paid")\)/.test(owed), `${f} still filters .eq status paid`);
    assert.ok(!/status === "paid"\)/.test(owed.replace(/row\.status === "paid"/g, "")), `${f} filters in code`);
  }
});
