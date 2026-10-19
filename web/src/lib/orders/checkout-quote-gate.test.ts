/**
 * #4030 review: the quote action is public and uses the service role, so it must apply the
 * D-10 guest-sellable rule (published + approved + public) BEFORE it prices anything.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { pricePurchase } from "./purchase-pricing";
import { MAX_QUOTE_ADDONS, offeringIsQuotable, sanitizeQuoteAddOnIds } from "./checkout-quote-gate";

function adminWith(row: Record<string, unknown> | null, error: unknown = null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error }) };
  return { from: () => q } as never;
}
const ROW = { status: "published", moderation_state: "approved", visibility: "public", price_type: "fixed" };

test("a public, approved, published offering is quotable", async () => {
  assert.equal(await offeringIsQuotable(adminWith(ROW), "o1"), true);
});

for (const [name, patch] of [
  ["on_request", { visibility: "on_request" }],
  ["agency_only", { visibility: "agency_only" }],
  ["draft", { status: "draft" }],
  ["archived", { status: "archived" }],
  ["pending", { moderation_state: "pending" }],
  ["rejected", { moderation_state: "rejected" }],
] as const) {
  test(`${name} is refused: no number at all`, async () => {
    assert.equal(await offeringIsQuotable(adminWith({ ...ROW, ...patch }), "o1"), false);
  });
}

test("a missing row or a read error is refused", async () => {
  assert.equal(await offeringIsQuotable(adminWith(null), "o1"), false);
  assert.equal(await offeringIsQuotable(adminWith(ROW, { message: "boom" }), "o1"), false);
});

test("add-on ids are capped at 20 and de-duplicated", () => {
  const many = Array.from({ length: 50 }, (_, i) => `a${i}`);
  assert.equal(MAX_QUOTE_ADDONS, 20);
  assert.equal(sanitizeQuoteAddOnIds(many), null);
  assert.deepEqual(sanitizeQuoteAddOnIds(["a", "a", "b"]), ["a", "b"]);
  assert.deepEqual(sanitizeQuoteAddOnIds(undefined), []);
});

test("a variantId from another offering is refused by pricing, not ignored", () => {
  const offerings = new Map([["o1", { offeringId: "o1", label: "Cut", amountCents: 1000, currency: "USD", priceType: "fixed", talentProfileId: null, ownerTenantId: "t", talentCostCents: 0 }]]);
  const variants = new Map([["v-other", { variantId: "v-other", offeringId: "o2", label: "VIP", amountCents: 9000, minPerOrder: null, maxPerOrder: null }]]);
  const res = pricePurchase([{ offeringId: "o1", units: 1, variantId: "v-other", addonIds: [] }], { offerings: offerings as never, variants: variants as never, addons: new Map() });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.reason, "variant_not_on_offering");
});

test("the action gates BEFORE it loads or prices anything, and refuses on failure", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/orders/checkout-quote.actions.ts"), "utf8");
  const gate = src.indexOf("offeringIsQuotable(");
  assert.ok(gate > 0);
  assert.ok(gate < src.indexOf("loadCatalog(admin"));
  assert.match(src, /if \(!\(await offeringIsQuotable\(admin, input\.offeringId\)\)\) return \{ ok: false \}/);
  assert.match(src, /sanitizeQuoteAddOnIds/);
});
