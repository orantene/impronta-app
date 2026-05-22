import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { humanizeEnumLabel } from "./humanize-enum-label";

describe("humanizeEnumLabel", () => {
  it("converts underscores to spaces and title-cases", () => {
    assert.equal(humanizeEnumLabel("dark_brown"), "Dark Brown");
    assert.equal(humanizeEnumLabel("light_blonde"), "Light Blonde");
  });

  it("converts hyphens to spaces and title-cases", () => {
    assert.equal(humanizeEnumLabel("full-time"), "Full Time");
  });

  it("applies overrides for known special cases", () => {
    assert.equal(humanizeEnumLabel("salt_and_pepper"), "Salt & Pepper");
    assert.equal(humanizeEnumLabel("blue_green"), "Blue-Green");
    assert.equal(humanizeEnumLabel("non_binary"), "Non-Binary");
    assert.equal(humanizeEnumLabel("semi_exclusive"), "Semi-Exclusive");
    assert.equal(humanizeEnumLabel("uk_based"), "UK-Based");
  });

  it("is idempotent on already-humanized strings", () => {
    assert.equal(humanizeEnumLabel("Dark Brown"), "Dark Brown");
    assert.equal(humanizeEnumLabel("Available"), "Available");
  });

  it("handles empty strings gracefully", () => {
    assert.equal(humanizeEnumLabel(""), "");
    assert.equal(humanizeEnumLabel("  "), "");
  });

  it("title-cases generic unknown slugs", () => {
    assert.equal(humanizeEnumLabel("new_category"), "New Category");
    assert.equal(humanizeEnumLabel("some_random_value"), "Some Random Value");
  });
});
