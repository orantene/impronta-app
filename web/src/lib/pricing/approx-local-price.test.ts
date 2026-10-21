import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approxCurrencyForLocale,
  formatApproxLocal,
  fxRateFor,
  formatConvertedLocal,
} from "./approx-local-price";

describe("approx-local-price", () => {
  it("only the Spanish site gets a MXN approximation", () => {
    assert.equal(approxCurrencyForLocale("es"), "MXN");
    assert.equal(approxCurrencyForLocale("es-MX"), "MXN");
    assert.equal(approxCurrencyForLocale("en"), null);
    assert.equal(approxCurrencyForLocale(null), null);
  });

  it("formats whole pesos with grouping", () => {
    assert.equal(formatApproxLocal(900, 18, "MXN"), "≈ MX$ 162");
    assert.equal(formatApproxLocal(7900, 18, "MXN"), "≈ MX$ 1,422");
  });

  it("omits the line instead of guessing", () => {
    assert.equal(formatApproxLocal(900, null, "MXN"), null);
    assert.equal(formatApproxLocal(0, 18, "MXN"), null);
    assert.equal(formatApproxLocal(null, 18, "MXN"), null);
    assert.equal(fxRateFor({ ok: false, error: "x", fetchedAt: "" }, "MXN"), null);
    assert.equal(
      fxRateFor({ ok: true, base: "USD", fetchedAt: "", rateDate: "", rates: { MXN: 0 } }, "MXN"),
      null,
    );
    assert.equal(
      fxRateFor({ ok: true, base: "USD", fetchedAt: "", rateDate: "", rates: { MXN: 18.5 } }, "MXN"),
      18.5,
    );
  });

  it("converted primary price has no approx sign (TUL-864)", () => {
    assert.equal(formatConvertedLocal(900, 18, "MXN"), "MX$ 162");
    assert.equal(formatConvertedLocal(900, null, "MXN"), null);
  });
});
