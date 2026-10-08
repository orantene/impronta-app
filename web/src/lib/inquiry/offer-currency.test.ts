/**
 * Pure rules for the currency an offer is priced in (TUL-274).
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/offer-currency.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkOfferMatchesSeller,
  decideServicePreload,
  formatOfferMoney,
  normalizeCurrencyCode,
  resolveOfferCurrency,
} from "./offer-currency";
import { planServicePick } from "./offer-service-pick";

describe("resolveOfferCurrency", () => {
  const cases: Array<[string, string[], string]> = [
    ["single MXN seller -> MXN", ["MXN"], "MXN"],
    ["single USD seller -> USD", ["USD"], "USD"],
    ["two MXN sellers -> MXN", ["MXN", "mxn"], "MXN"],
    ["mixed sellers -> platform", ["MXN", "USD"], "USD"],
    ["no sellers -> platform", [], "USD"],
    ["unreadable seller currency -> platform", ["", "xx"], "USD"],
  ];
  for (const [name, sellers, want] of cases) {
    it(name, () => {
      assert.equal(resolveOfferCurrency({ sellerCurrencies: sellers, platformCurrency: "USD" }), want);
    });
  }
  it("mixed sellers use the platform currency even when it is not USD", () => {
    assert.equal(resolveOfferCurrency({ sellerCurrencies: ["MXN", "USD"], platformCurrency: "eur" }), "EUR");
  });
});

describe("checkOfferMatchesSeller (send + charge guard)", () => {
  it("matching currency passes", () => {
    assert.deepEqual(checkOfferMatchesSeller({ offerCurrency: "MXN", sellerCurrencies: ["MXN"] }), { ok: true });
  });
  it("USD offer for an MXN seller is refused with the typed code and plain message", () => {
    const r = checkOfferMatchesSeller({ offerCurrency: "USD", sellerCurrencies: ["MXN"] });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "offer_currency_seller_mismatch");
      assert.equal(r.message, "This offer is in USD but the seller charges in MXN; change the offer currency.");
    }
  });
  it("mixed sellers are unchanged (not refused)", () => {
    assert.deepEqual(checkOfferMatchesSeller({ offerCurrency: "USD", sellerCurrencies: ["MXN", "USD"] }), { ok: true });
  });
  it("no seller or unknown seller currency is not refused", () => {
    assert.deepEqual(checkOfferMatchesSeller({ offerCurrency: "USD", sellerCurrencies: [] }), { ok: true });
    assert.deepEqual(checkOfferMatchesSeller({ offerCurrency: "USD", sellerCurrencies: [null] }), { ok: true });
  });
});

describe("decideServicePreload", () => {
  it("same currency applies", () => {
    assert.deepEqual(
      decideServicePreload({ offerCurrency: "MXN", serviceCurrency: "MXN", serviceAmountCents: 85000, hasOtherPricedLines: true }),
      { action: "apply" },
    );
  });
  it("MXN service into an unpriced USD draft switches the draft to MXN", () => {
    assert.deepEqual(
      decideServicePreload({ offerCurrency: "USD", serviceCurrency: "MXN", serviceAmountCents: 85000, hasOtherPricedLines: false }),
      { action: "switch", currency: "MXN" },
    );
  });
  it("MXN service into a USD draft that already has a priced line is blocked", () => {
    assert.deepEqual(
      decideServicePreload({ offerCurrency: "USD", serviceCurrency: "MXN", serviceAmountCents: 85000, hasOtherPricedLines: true }),
      { action: "block", serviceCurrency: "MXN", offerCurrency: "USD" },
    );
  });
  it("a template with no amount never blocks or switches", () => {
    assert.deepEqual(
      decideServicePreload({ offerCurrency: "MXN", serviceCurrency: "USD", serviceAmountCents: null, hasOtherPricedLines: true }),
      { action: "apply" },
    );
  });
});

describe("planServicePick (what the editor applies)", () => {
  const lines = [{ id: "a", label: null, unitPrice: 0 }];
  const svc = { id: "s1", name: "Limpieza profunda", pricingType: "flat_package", amountCents: 85000, currency: "MXN" };
  it("switches the draft currency and copies the amount", () => {
    const plan = planServicePick({ offerCurrency: "USD", lines, lineId: "a", labelTouched: false, service: svc });
    assert.equal(plan.blocked, undefined);
    assert.equal(plan.switchCurrency, "MXN");
    assert.equal(plan.patch.unitPrice, 850);
  });
  it("blocks with no patch when another line is already priced in USD", () => {
    const plan = planServicePick({
      offerCurrency: "USD",
      lines: [...lines, { id: "b", label: "x", unitPrice: 100 }],
      lineId: "a",
      labelTouched: false,
      service: svc,
    });
    assert.deepEqual(plan.blocked, { service: "MXN", offer: "USD" });
    assert.deepEqual(plan.patch, {});
  });
});

describe("formatOfferMoney shows the ISO code", () => {
  it("MXN and USD amounts are told apart", () => {
    assert.match(formatOfferMoney(850, "MXN", { maximumFractionDigits: 0 }), /850.*MXN$/);
    assert.match(formatOfferMoney(850, "USD", { maximumFractionDigits: 0 }), /850.*USD$/);
  });
  it("normalizeCurrencyCode rejects junk", () => {
    assert.equal(normalizeCurrencyCode("mxn"), "MXN");
    assert.equal(normalizeCurrencyCode("pesos"), null);
    assert.equal(normalizeCurrencyCode(null), null);
  });
});
