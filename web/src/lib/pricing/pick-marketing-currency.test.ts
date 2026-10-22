import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MARKETING_PRICE_CURRENCIES,
  coerceMarketingCurrency,
  fxSafeMarketingCurrency,
  isMarketingPriceCurrency,
  pickMarketingCurrency,
} from "./pick-marketing-currency";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("pickMarketingCurrency", () => {
  it("defaults to USD with no visitor choice", () => {
    assert.deepEqual(pickMarketingCurrency({}), {
      currency: "USD",
      source: "fallback",
    });
  });

  it("does not treat a country-looking string as a currency", () => {
    assert.deepEqual(
      pickMarketingCurrency({
        urlCurrency: "MX",
        cookieCurrency: "mexico",
      }),
      { currency: "USD", source: "fallback" },
    );
  });

  it("honors a supported URL override and ignores unsupported ones", () => {
    assert.deepEqual(
      pickMarketingCurrency({ urlCurrency: "usd" }),
      { currency: "USD", source: "url-param" },
    );
    // TUL-892: picking MXN selects MXN (never BRL).
    assert.deepEqual(pickMarketingCurrency({ urlCurrency: "mxn" }), {
      currency: "MXN",
      source: "url-param",
    });
    assert.deepEqual(pickMarketingCurrency({ urlCurrency: "brl" }), {
      currency: "USD",
      source: "fallback",
    });
  });

  it("TUL-892: a BRL cookie or locale default falls back to USD", () => {
    assert.deepEqual(pickMarketingCurrency({ cookieCurrency: "BRL" }), {
      currency: "USD",
      source: "fallback",
    });
    assert.equal(coerceMarketingCurrency("BRL"), "USD");
    assert.equal(coerceMarketingCurrency("usd"), "USD");
  });

  it("TUL-892: picker options are exactly the renderable currencies", () => {
    for (const c of MARKETING_PRICE_CURRENCIES) {
      assert.equal(pickMarketingCurrency({ cookieCurrency: c }).currency, c);
      assert.equal(coerceMarketingCurrency(c), c);
    }
    const picker = readFileSync(
      join(HERE, "../../components/marketing/currency-picker.tsx"),
      "utf8",
    );
    assert.match(picker, /MARKETING_PRICE_CURRENCIES\.map/);
    assert.doesNotMatch(picker, /DEFAULT_CURRENCY_OPTIONS/);
    assert.match(picker, /coerceMarketingCurrency\(current\)/);
  });

  it("URL wins over the cookie", () => {
    assert.deepEqual(
      pickMarketingCurrency({
        urlCurrency: "USD",
        cookieCurrency: "MXN",
      }),
      { currency: "USD", source: "url-param" },
    );
  });
});

describe("Spanish locale default (TUL-864)", () => {
  it("defaults to MXN on es and es-MX (TUL-864)", () => {
    assert.equal(isMarketingPriceCurrency("MXN"), true);
    for (const locale of ["es", "es-MX"]) {
      assert.deepEqual(pickMarketingCurrency({ locale }), {
        currency: "MXN",
        source: "fallback",
      });
    }
  });

  it("explicit URL or cookie still beats the locale default", () => {
    assert.equal(pickMarketingCurrency({ locale: "es", urlCurrency: "USD" }).currency, "USD");
    // EUR is not renderable: ignored, es falls to its MXN default (TUL-892).
    assert.equal(pickMarketingCurrency({ locale: "es", cookieCurrency: "EUR" }).currency, "MXN");
  });

  it("English stays USD", () => {
    assert.equal(pickMarketingCurrency({ locale: "en" }).currency, "USD");
  });
});

describe("resolveCurrency wiring", () => {
  it("does not guess currency from the IP-country header", () => {
    const src = readFileSync(join(HERE, "currency-resolver.ts"), "utf8");
    assert.doesNotMatch(
      src,
      /country-currency-map|currencyForCountry/,
      "IP geo-guess labeled marketing MXN while catalog prices stayed USD",
    );
    assert.doesNotMatch(src, /from "next\/headers".*headers|headers\(\)/);
    assert.match(src, /pickMarketingCurrency/);
  });
});

describe("MXN view of the USD catalog (TUL-864 / TUL-892)", () => {
  it("the ladders convert USD rows for display and state the USD charge", () => {
    const src = readFileSync(
      join(HERE, "../../components/marketing/pricing-ladders-section.tsx"),
      "utf8",
    );
    assert.match(src, /formatConvertedLocal/);
    assert.match(src, /currency === "MXN" \? fxMxn : null/);
    assert.match(src, /"US\$"/);
  });
});

describe("fxSafeMarketingCurrency (TUL-1817)", () => {
  const mxn = { currency: "MXN", source: "fallback" } as const;
  it("falls back to USD when MXN has no FX rate (outage stubbed off)", () => {
    for (const rate of [null, undefined, 0, Number.NaN]) {
      assert.deepEqual(fxSafeMarketingCurrency(mxn, rate), { currency: "USD", source: "fallback" });
    }
  });
  it("keeps MXN when a rate is available", () => {
    assert.deepEqual(fxSafeMarketingCurrency(mxn, 17.2), mxn);
  });
  it("never touches a USD pick", () => {
    const usd = { currency: "USD", source: "url-param" } as const;
    assert.deepEqual(fxSafeMarketingCurrency(usd, null), usd);
  });
});
