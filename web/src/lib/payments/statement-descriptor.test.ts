import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeStatementDescriptorSuffix as s } from "./statement-descriptor";

test("strips accents, forbidden chars and uppercases", () => {
  assert.equal(s("Sofía <Vega> 'Studio'*"), "SOFIA VEGA STUDIO");
});
test("caps at 22 chars without trailing space", () => {
  const out = s("Jorge Beauty and Wellness Studio Mexico")!;
  assert.ok(out.length <= 22);
  assert.equal(out, out.trim());
});
test("requires a letter", () => {
  assert.equal(s("12345"), undefined);
  assert.equal(s("  "), undefined);
  assert.equal(s(null), undefined);
});
