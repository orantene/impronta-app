import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { offerClientTotalMajor } from "./offer-client-total";

describe("TUL-1306: the coordination fee is part of the client total", () => {
  it("lines 1000 + fee 150 = 1150 (was 1000 shown and charged, 150 lost)", () => {
    assert.equal(offerClientTotalMajor(1000, 150, "MXN"), 1150);
  });
  it("no fee, a negative fee or garbage adds nothing", () => {
    for (const fee of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(offerClientTotalMajor(1000, fee, "USD"), 1000);
  });
  it("an empty offer stays empty: a fee alone is not an offer", () => {
    assert.equal(offerClientTotalMajor(0, 150, "MXN"), 0);
  });
  it("rounds to the currency's own decimals", () => {
    assert.equal(offerClientTotalMajor(10.005, 0.1, "USD"), 10.11);
    assert.equal(offerClientTotalMajor(1000, 0.4, "JPY"), 1000);
  });
});

describe("TUL-1306 wiring: draft save and send stamp the same total", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/inquiry/inquiry-engine-offers.ts"), "utf8");
  it("the draft save and the send self-heal both use offerClientTotalMajor", () => {
    assert.equal((src.match(/offerClientTotalMajor\(/g) ?? []).length, 2);
    assert.match(src, /select\("currency_code, coordinator_fee"\)/);
  });
});
