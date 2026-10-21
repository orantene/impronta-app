/**
 * TUL-1268 item 5 / A1 invariance: showing the fee changes nothing that is charged. The quote module
 * only CALLS resolveCheckoutCollectCents; no charge, fee, commission, payout or Stripe path imports it.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { calculateTransactionAmountsForBasisPoints } from "@/lib/bookings/commission";
import { cardFeeSummary } from "./checkout-quote-display";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("charged amounts are unchanged: golden commission values, and the summary does not mutate its input", () => {
  for (const [gross, bps, fee] of [[100_000, 148, 1_480], [9_999, 600, 599]] as const) {
    const a = calculateTransactionAmountsForBasisPoints(gross, bps);
    assert.deepEqual(a, { grossCents: gross, feeBasisPoints: bps, feeCents: fee, netCents: gross - fee });
  }
  const quote = { principalCents: 100_000, collectCents: 101_500, cardFeeCents: 1_500, currency: "MXN" };
  const before = JSON.stringify(quote);
  cardFeeSummary(quote);
  assert.equal(JSON.stringify(quote), before);
});

test("no money path imports the quote or display modules; only the sheet side does", () => {
  const importers = walk(join(process.cwd(), "src"))
    .filter((f) => /["']@\/lib\/orders\/checkout-quote(?:-display|\.actions)?["']|from\s+["']\.\/checkout-quote(?:-display)?["']/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(process.cwd().length + 1))
    .filter((f) => !f.startsWith("src/lib/orders/checkout-quote"))
    .sort();
  // The sheet now reads the ONE price module (`orders/price/`); nothing imports the old quote modules.
  assert.deepEqual(importers, []);
});

test("purchase-collect.ts, purchase.ts and the pass-through math never reference the quote modules", () => {
  for (const f of ["purchase-collect.ts", "purchase.ts", "purchase-pass-through-collect.ts"]) {
    const src = readFileSync(join(process.cwd(), "src/lib/orders", f), "utf8");
    assert.doesNotMatch(src, /checkout-quote/);
  }
});
