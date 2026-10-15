import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMarketingCopy } from "./copy";

describe("TUL-529 / E8-Copy: marketing ES avoids gendered defaults", () => {
  it("network + pricing + final CTA use neutral Spanish", () => {
    const es = getMarketingCopy("es");
    assert.equal(es.network.titleLine1, "Hay más que un enlace.");
    assert.doesNotMatch(es.network.titleLine1, /solo\b/i);
    assert.equal(es.pricing.title, "Empieza gratis. Crece cuando quieras.");
    assert.doesNotMatch(es.pricing.title, /estés listo/i);
    assert.doesNotMatch(es.finalCta.subhead, /estés listo/i);
    assert.match(es.finalCta.subhead, /Cuando quieras/);
  });
});
