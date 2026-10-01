import assert from "node:assert/strict";
import { test } from "node:test";
import { factLabel } from "./fact-keys";

test("credentials label keeps the self-declared disclaimer in en and es", () => {
  assert.match(factLabel("industry.certifications"), /self-declared, not verified by Tulala/);
  assert.match(factLabel("industry.certifications", "es"), /Tulala no las verifica/);
});
test("es falls back to en when no Spanish label exists", () => {
  assert.equal(factLabel("industry.markets", "es"), factLabel("industry.markets"));
});
