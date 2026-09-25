import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bookingModeLabel,
  categoryNearMatch,
  foldAccent,
  parseOfferingLine,
  publicationWord,
} from "./publication-state";

describe("publicationWord", () => {
  it("maps published to live", () => {
    assert.equal(publicationWord({ status: "published", firstPublishedAt: null }), "live");
  });
  it("maps draft never published to draft", () => {
    assert.equal(publicationWord({ status: "draft", firstPublishedAt: null }), "draft");
  });
  it("maps draft after publish to hidden", () => {
    assert.equal(publicationWord({ status: "draft", firstPublishedAt: "2026-01-01" }), "hidden");
  });
  it("maps archived", () => {
    assert.equal(publicationWord({ status: "archived" }), "archived");
  });
});

describe("bookingModeLabel", () => {
  it("uses quote language when there is no price", () => {
    assert.equal(
      bookingModeLabel({ bookingMode: "instant", priceDisplay: "quote" }, "en"),
      "Request a quote",
    );
  });
});

describe("categoryNearMatch", () => {
  it("matches accent and punctuation drift", () => {
    assert.equal(categoryNearMatch("Unas", "Uñas"), true);
    assert.equal(categoryNearMatch("Uñas", "unas"), true);
    assert.equal(categoryNearMatch("Uñas gel", "Uñas · gel"), true);
    assert.equal(foldAccent("Pestañas"), "pestanas");
  });
});

describe("parseOfferingLine", () => {
  it("reads name, price and minutes", () => {
    const parsed = parseOfferingLine("Pedicura spa 620 (70min)");
    assert.equal(parsed?.title, "Pedicura spa");
    assert.equal(parsed?.amountCents, 62000);
    assert.equal(parsed?.durationMinutes, 70);
    assert.equal(parsed?.kind, "service");
  });
  it("marks product lines", () => {
    assert.equal(parseOfferingLine("Kit de cuidado pestañas 320 (producto)")?.kind, "product");
  });
});
