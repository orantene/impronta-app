import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicPriceLine } from "./public-price-line";

const base = { amountCents: 70000, currency: "MXN" };

test("exact and from share one money format, from is lowercase in both languages", () => {
  const exact = publicPriceLine({ ...base, priceDisplay: "exact" }, "es");
  const from = publicPriceLine({ ...base, priceDisplay: "from" }, "es");
  assert.ok(exact && from);
  assert.equal(from, `desde ${exact}`);
  assert.equal(publicPriceLine({ ...base, priceDisplay: "from" }, "en"), `from ${publicPriceLine({ ...base, priceDisplay: "exact" }, "en")}`);
  assert.ok(!/\.00/.test(exact), "no trailing cents on whole amounts");
});

test("quote, hidden or empty prices yield null", () => {
  assert.equal(publicPriceLine({ ...base, priceDisplay: "quote" }, "en"), null);
  assert.equal(publicPriceLine({ amountCents: null, currency: "MXN", priceDisplay: "from" }, "en"), null);
  assert.equal(publicPriceLine({ amountCents: 0, currency: "MXN", priceDisplay: "exact" }, "en"), null);
});

test("home block and service page use the shared helper", () => {
  assert.match(readFileSync("src/lib/talent-site/service-page.ts", "utf8"), /publicPriceLine\(/);
  assert.match(readFileSync("src/lib/site-admin/builder-node/render.tsx", "utf8"), /publicPriceLine\(/);
});
