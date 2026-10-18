import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkoutIdempotencyKey,
  checkoutPriceError,
  resolveCheckoutPrice,
  toCatalogInterval,
  yearlyCheckoutPlans,
} from "./checkout-interval";
import type { BillingInterval as CatalogInterval } from "@/lib/stripe/price-ids";

function catalog(rows: Partial<Record<CatalogInterval, string>>) {
  const asked: CatalogInterval[] = [];
  const resolve = async (i: CatalogInterval): Promise<string | null> => {
    asked.push(i);
    return rows[i] ?? null;
  };
  return { resolve, asked };
}

test("toggle interval maps to the catalog vocabulary", () => {
  assert.equal(toCatalogInterval("month"), "monthly");
  assert.equal(toCatalogInterval("year"), "annual");
});

test("yearly uses the catalog yearly price", async () => {
  const c = catalog({ monthly: "price_m", annual: "price_y" });
  assert.deepEqual(await resolveCheckoutPrice(c.resolve, "year"), {
    ok: true,
    priceId: "price_y",
    interval: "year",
  });
  assert.deepEqual(c.asked, ["annual"]);
});

test("yearly without a catalog price refuses and never falls back to monthly", async () => {
  const c = catalog({ monthly: "price_m" });
  assert.deepEqual(await resolveCheckoutPrice(c.resolve, "year"), {
    ok: false,
    code: "yearly_unavailable",
  });
  assert.deepEqual(c.asked, ["annual"]);
});

test("anything that is not 'year' is monthly", async () => {
  for (const raw of [undefined, null, "month", "annual", "YEAR", 12]) {
    const c = catalog({ monthly: "price_m", annual: "price_y" });
    const r = await resolveCheckoutPrice(c.resolve, raw);
    assert.deepEqual(r, { ok: true, priceId: "price_m", interval: "month" });
  }
});

test("monthly without a price reports no_price; blank ids count as missing", async () => {
  const c = catalog({ monthly: "  " });
  assert.deepEqual(await resolveCheckoutPrice(c.resolve, "month"), { ok: false, code: "no_price" });
});

test("idempotency key: monthly keeps the old shape, yearly is distinct", () => {
  const base = { prefix: "cs_talent", subjectId: "tp1", planKey: "talent_portfolio", suffix: "" };
  assert.equal(checkoutIdempotencyKey({ ...base, interval: "month" }), "cs_talent_tp1_talent_portfolio");
  assert.equal(checkoutIdempotencyKey({ ...base, interval: "year" }), "cs_talent_tp1_talent_portfolio_year");
  assert.equal(
    checkoutIdempotencyKey({ ...base, interval: "year", suffix: "_r:abc" }),
    "cs_talent_tp1_talent_portfolio_year_r:abc",
  );
});

test("yearlyCheckoutPlans lists only plans with a yearly price", async () => {
  const yearly: Record<string, string | null> = { studio: "price_sy", agency: null, website: " " };
  const plans = await yearlyCheckoutPlans(["website", "studio", "agency"] as const, async (k) => yearly[k] ?? null);
  assert.deepEqual(plans, ["studio"]);
});

test("TUL-817: a missing price reads as plain copy, never the raw plan key or Stripe jargon", () => {
  const msg = checkoutPriceError("no_price", "talent_portfolio");
  assert.ok(!/stripe|talent_portfolio|configured/i.test(msg), msg);
  assert.match(checkoutPriceError("yearly_unavailable", "talent_pro"), /Yearly billing/);
});
