import assert from "node:assert/strict";
import { test } from "node:test";

import { fallbackName, isGeneratedName } from "./inquiry-name";

test("fallbackName trims and falls back to Visitor for an empty contact name", () => {
  assert.equal(fallbackName("  Marco Ruiz  "), "Marco Ruiz");
  assert.equal(fallbackName(""), "Visitor");
  assert.equal(fallbackName("   "), "Visitor");
});

test("isGeneratedName is true when the current name is exactly the fallback", () => {
  assert.equal(isGeneratedName("Marco Ruiz", "Marco Ruiz"), true);
  assert.equal(isGeneratedName("Visitor", ""), true);
  assert.equal(isGeneratedName("Visitor", "   "), true);
});

test("isGeneratedName is false once a staff rename has changed the name", () => {
  assert.equal(isGeneratedName("Dinner for 6 · Sat", "Marco Ruiz"), false);
  assert.equal(isGeneratedName("", "Marco Ruiz"), false);
});
