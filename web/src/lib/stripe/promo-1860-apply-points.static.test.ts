import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { stripePreferredLocales, syncCustomerPreferredLocale } from "./stored-customer";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("TUL-1872: the webhook records a code on the resync and the paid-invoice paths, not only on checkout", () => {
  const h = read("src/lib/stripe/webhook-handler.ts");
  assert.equal((h.match(/await recordDiscountRedemption\(subscription, event\.id\)/g) ?? []).length, 2);
  // B6: the paid-invoice path also reads the invoice's own discounts (a "once" coupon never stays on the subscription).
  assert.equal((h.match(/await recordPaidInvoiceRedemptions\(stripe, subscription, event\.id, /g) ?? []).length, 1);
  assert.ok(h.trimEnd().split("\n").length <= 800);
});

test("TUL-1860: validateDiscount switches an expired code off at Stripe; HQ sweeps and keeps a live clock", () => {
  assert.match(read("src/lib/server-actions/admin-product-discounts.ts"), /await deactivateIfExpired\(discount\)/);
  assert.match(read("src/app/(workspace)/platform/admin/commerce/tab-body.tsx"), /await deactivateExpiredBatch\(discounts\)/);
  const view = read("src/app/(workspace)/platform/admin/commerce/discounts/DiscountsView.tsx");
  assert.match(view, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\)/);
  assert.match(read("src/app/(workspace)/platform/admin/commerce/discounts/DiscountRow.tsx"), /discountStatus\(row, nowMs\)/);
});

test("TUL-1873: create and edit show the window error in the viewer's locale only", () => {
  assert.match(read("src/lib/server-actions/admin-product-discounts.ts"), /localizeWindowIssue\(/);
  assert.doesNotMatch(read("src/lib/server-actions/admin-product-discounts.ts"), /bilingualWindowError/);
  assert.match(read("src/lib/billing/discount-edit.ts"), /windowErrorMessage\(windowError, await getRequestLocale\(\)\)/);
});

test("TUL-1874: Spanish and English talents get Stripe documents in their language", async () => {
  assert.deepEqual(stripePreferredLocales("es-MX"), ["es"]);
  assert.deepEqual(stripePreferredLocales("en"), ["en"]);
  assert.equal(stripePreferredLocales("fr"), undefined);
  assert.equal(stripePreferredLocales(null), undefined);
  const calls: unknown[] = [];
  const stripe = { customers: { update: async (...a: unknown[]) => { calls.push(a); return {} as never; } } };
  await syncCustomerPreferredLocale(stripe as never, "cus_1", "es");
  await syncCustomerPreferredLocale(stripe as never, "cus_1", "fr");
  assert.deepEqual(calls, [["cus_1", { preferred_locales: ["es"] }]]);
  const failing = { customers: { update: async () => { throw new Error("boom"); } } };
  let seen = 0;
  await syncCustomerPreferredLocale(failing as never, "cus_1", "es", () => { seen += 1; });
  assert.equal(seen, 1);
  for (const f of ["talent", "workspace"]) {
    assert.match(read(`src/lib/stripe/${f}-billing.ts`), /syncCustomerPreferredLocale\(stripe, customerResult\.data, opts\.locale/);
  }
});
