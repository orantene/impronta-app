import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eyebrowDuplicatesHeading } from "./portfolio-eyebrow";

describe("eyebrowDuplicatesHeading", () => {
  it("matches the same words ignoring case, accents, spacing and italic markers", () => {
    assert.equal(eyebrowDuplicatesHeading("TRABAJO RECIENTE", "Trabajo reciente"), true);
    assert.equal(eyebrowDuplicatesHeading("Recent work", "Recent {i}work{/i}"), true);
    assert.equal(eyebrowDuplicatesHeading("  Galería ", "galeria"), true);
    assert.equal(eyebrowDuplicatesHeading("Recent  work.", "Recent work"), true);
  });
  it("keeps an eyebrow that adds context", () => {
    assert.equal(eyebrowDuplicatesHeading("Portfolio", "Recent work"), false);
    assert.equal(eyebrowDuplicatesHeading("Recent work 2026", "Recent work"), false);
  });
  it("is false when there is no eyebrow", () => {
    assert.equal(eyebrowDuplicatesHeading("", "Recent work"), false);
    assert.equal(eyebrowDuplicatesHeading(null, null), false);
    assert.equal(eyebrowDuplicatesHeading(undefined, ""), false);
  });
});
