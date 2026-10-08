import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCount } from "./format-count";

test("formatCount pins the locale, never the host", () => {
  assert.equal(formatCount(1234567, false), "1,234,567");
  assert.equal(formatCount(1234567, true), "1,234,567");
  assert.equal(formatCount(12, false), "12");
  assert.equal(formatCount(0, true), "0");
});

test("formatCount is total", () => {
  assert.equal(formatCount(Number.NaN, false), "0");
  assert.equal(formatCount(Number.POSITIVE_INFINITY, true), "0");
});
