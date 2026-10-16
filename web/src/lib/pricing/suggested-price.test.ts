import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSuggestedPrice, normalizeCountryCode, serviceKeyFor } from "./suggested-price";

const none = async () => null;

describe("getSuggestedPrice", () => {
  it("normalises country names", () => {
    assert.equal(normalizeCountryCode("México"), "MX");
    assert.equal(normalizeCountryCode("Mexico"), "MX");
    assert.equal(normalizeCountryCode("mx"), "MX");
    assert.equal(normalizeCountryCode("United Kingdom"), "GB");
    assert.equal(normalizeCountryCode("Suiza"), "CH");
    assert.equal(normalizeCountryCode("Narnia"), null);
    assert.equal(normalizeCountryCode(null), null);
  });
  it("uses an approved table row", async () => {
    const r = await getSuggestedPrice({ countryCode: "Spain", serviceKey: "nails:manicure" }, {
      readApproved: async (c, k) => (c === "ES" && k === "nails:manicure" ? { amount_minor: 2500, currency: "usd", duration_minutes: 45 } : null),
    });
    assert.deepEqual(r, { amountMinor: 2500, currency: "USD", durationMinutes: 45, source: "table" });
  });
  it("table row beats the Mexico pack", async () => {
    const r = await getSuggestedPrice({ countryCode: "MX", serviceKey: "nails:manicure" }, {
      readApproved: async () => ({ amount_minor: 30000, currency: "MXN", duration_minutes: 50 }),
    });
    assert.equal(r?.source, "table");
  });
  it("falls back to the MX pack", async () => {
    const r = await getSuggestedPrice({ countryCode: "MX", serviceKey: serviceKeyFor("nails", "Gel manicure") }, { readApproved: none });
    assert.deepEqual(r, { amountMinor: 35000, currency: "MXN", durationMinutes: 60, source: "pack" });
  });
  it("returns null for non-MX with no approved row, unknown service, or no country", async () => {
    assert.equal(await getSuggestedPrice({ countryCode: "US", serviceKey: "nails:manicure" }, { readApproved: none }), null);
    assert.equal(await getSuggestedPrice({ countryCode: "MX", serviceKey: "nails:nope" }, { readApproved: none }), null);
    assert.equal(await getSuggestedPrice({ countryCode: null, serviceKey: "nails:manicure" }, { readApproved: none }), null);
  });
  it("a reader failure degrades to the pack, never throws", async () => {
    const r = await getSuggestedPrice({ countryCode: "MX", serviceKey: "hair:haircut" }, { readApproved: async () => { throw new Error("down"); } });
    assert.equal(r?.source, "pack");
  });
  it("ignores a malformed row", async () => {
    const r = await getSuggestedPrice({ countryCode: "US", serviceKey: "hair:haircut" }, { readApproved: async () => ({ amount_minor: 0, currency: "USD", duration_minutes: null }) });
    assert.equal(r, null);
  });
});
