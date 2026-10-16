import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MARKETING_PRICE_CURRENCIES,
  coerceMarketingCurrency,
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
    assert.deepEqual(pickMarketingCurrency({ urlCurrency: "mxn" }), {
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
  it("defaults to MXN on es only when the catalog can render MXN", () => {
    const expected = isMarketingPriceCurrency("MXN") ? "MXN" : "USD";
    assert.deepEqual(pickMarketingCurrency({ locale: "es" }), {
      currency: expected,
      source: "fallback",
    });
  });

  it("explicit URL or cookie still beats the locale default", () => {
    assert.equal(pickMarketingCurrency({ locale: "es", urlCurrency: "USD" }).currency, "USD");
    // EUR has no catalog rows, so an EUR cookie is ignored (TUL-892).
    assert.equal(pickMarketingCurrency({ locale: "es", cookieCurrency: "EUR" }).currency, coerceMarketingCurrency("EUR"));
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
