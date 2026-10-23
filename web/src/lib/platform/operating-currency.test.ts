import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_TALENT_EARNINGS } from "@/lib/talent/earnings-types";
import type { TalentEarningsByCurrency } from "@/lib/talent/earnings-by-currency-types";
import { applyOperatingCurrencyToEarnings } from "./operating-currency-apply";

function mxnBundle(): TalentEarningsByCurrency {
  return {
    defaultCurrency: "MXN",
    currencies: ["MXN"],
    byCurrency: [
      {
        ...EMPTY_TALENT_EARNINGS,
        totals: {
          ...EMPTY_TALENT_EARNINGS.totals,
          currency: "MXN",
          ytdNetCents: 280_000,
        },
      },
    ],
  };
}

describe("A4 applyOperatingCurrencyToEarnings", () => {
  it("keeps MXN when multi-currency display is off (never USD $0)", () => {
    const out = applyOperatingCurrencyToEarnings(mxnBundle(), {
      operatingCurrency: "USD",
      multiCurrencyDisplayEnabled: false,
    });
    assert.equal(out.defaultCurrency, "MXN");
    assert.deepEqual(out.currencies, ["MXN"]);
    assert.equal(out.byCurrency[0]?.totals.currency, "MXN");
    assert.equal(out.byCurrency[0]?.totals.ytdNetCents, 280_000);
  });

  it("stamps empty with talent default, not platform USD", () => {
    const empty: TalentEarningsByCurrency = {
      defaultCurrency: "MXN",
      byCurrency: [],
      currencies: [],
    };
    const out = applyOperatingCurrencyToEarnings(empty, {
      operatingCurrency: "USD",
      multiCurrencyDisplayEnabled: false,
    });
    assert.equal(out.defaultCurrency, "MXN");
    assert.equal(out.byCurrency[0]?.totals.currency, "MXN");
    assert.equal(out.byCurrency[0]?.totals.ytdNetCents, 0);
  });

  it("QA bounce (no ticket number): keeps the talent's declared MXN as defaultCurrency even when her only earnings bundle is USD (every offering prices in USD) — never silently becomes USD", () => {
    const mxnPreferenceOnlyUsdEarnings: TalentEarningsByCurrency = {
      defaultCurrency: "MXN",
      currencies: ["USD"],
      byCurrency: [
        {
          ...EMPTY_TALENT_EARNINGS,
          totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "USD", ytdNetCents: 50_000 },
        },
      ],
    };
    const out = applyOperatingCurrencyToEarnings(mxnPreferenceOnlyUsdEarnings, {
      operatingCurrency: "USD",
      multiCurrencyDisplayEnabled: false,
    });
    // The real money on hand stays labeled USD (it genuinely is USD) …
    assert.equal(out.byCurrency[0]?.totals.currency, "USD");
    assert.equal(out.byCurrency[0]?.totals.ytdNetCents, 50_000);
    // … but the talent's OWN account currency, read separately downstream
    // (a $0 month's label), must stay her real preference, not get
    // silently overwritten with whatever the one bundle on hand happens to be.
    assert.equal(out.defaultCurrency, "MXN");
  });

  it("passes through when multi-currency display is on", () => {
    const multi: TalentEarningsByCurrency = {
      defaultCurrency: "MXN",
      currencies: ["MXN", "USD"],
      byCurrency: [
        {
          ...EMPTY_TALENT_EARNINGS,
          totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "MXN", ytdNetCents: 100 },
        },
        {
          ...EMPTY_TALENT_EARNINGS,
          totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "USD", ytdNetCents: 50 },
        },
      ],
    };
    const out = applyOperatingCurrencyToEarnings(multi, {
      operatingCurrency: "USD",
      multiCurrencyDisplayEnabled: true,
    });
    assert.equal(out.currencies.length, 2);
  });
});
