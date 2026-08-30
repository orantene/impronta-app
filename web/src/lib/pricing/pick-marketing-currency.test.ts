import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { pickMarketingCurrency } from "./pick-marketing-currency";

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

  it("honors an explicit URL override", () => {
    assert.deepEqual(
      pickMarketingCurrency({ urlCurrency: "mxn" }),
      { currency: "MXN", source: "url-param" },
    );
  });

  it("honors the sticky cookie when the URL is empty", () => {
    assert.deepEqual(
      pickMarketingCurrency({ cookieCurrency: "EUR" }),
      { currency: "EUR", source: "cookie" },
    );
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
