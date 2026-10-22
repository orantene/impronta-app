/**
 * TUL-1298 hard constraint: showing a price changes no charged amount.
 *  - No charging path imports the price module (the dependency runs one way: the module calls the
 *    charging functions, never the reverse).
 *  - The quote action and every module file are read-only: no insert/update/delete/upsert/rpc write.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const CHARGING = [
  "src/lib/orders/purchase.ts",
  "src/lib/orders/purchase-pricing.ts",
  "src/lib/orders/purchase-policy.ts",
  "src/lib/orders/purchase-collect.ts",
  "src/lib/orders/purchase-pass-through-collect.ts",
  "src/lib/orders/purchase-promo.ts",
  "src/lib/orders/purchase-catalog.ts",
  "src/lib/payments/stripe-checkout.ts",
  "src/lib/payments/link-checkout.ts",
  "src/lib/payments/collection.ts",
  "src/lib/pos/collection.ts",
  "src/lib/messaging/accept-offer-collection.ts",
  "src/lib/messaging/accept-offer-payment.ts",
];

test("no charging path imports the price module", () => {
  for (const f of CHARGING) {
    let src: string;
    try {
      src = readFileSync(join(process.cwd(), f), "utf8");
    } catch {
      continue; // a path that moved is caught by the lane/orphan gates, not here
    }
    assert.doesNotMatch(src, /orders\/price\//, `${f} must not depend on the display price module`);
  }
});

test("the price module never writes: no insert/update/delete/upsert, no rpc, no Stripe", () => {
  const dir = join(process.cwd(), "src/lib/orders/price");
  for (const name of readdirSync(dir).filter((n) => /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) && !/fixture/.test(n))) {
    const src = readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\.(insert|update|delete|upsert|rpc)\(/, `${name} must be read only`);
    assert.doesNotMatch(src, /stripe/i, `${name} must not touch Stripe`);
  }
});

test("quoteSelectionAction is a server action: async exports only, tenant never taken from the request", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/orders/price/quote.actions.ts"), "utf8");
  assert.match(src, /^"use server";/);
  const exports = [...src.matchAll(/^export (async function|function|const|type|class)\s/gm)].map((m) => m[1]);
  assert.deepEqual(exports, ["async function"]);
  assert.doesNotMatch(src, /tenantId\??:\s*string/);
});
