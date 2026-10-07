import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectorLocales } from "./inspector-locales";

test("active canvas locale missing from the tenant list is folded in", () => {
  assert.deepEqual(inspectorLocales(["en"], "en", "es"), ["en", "es"]);
});
test("no duplicates when already listed", () => {
  assert.deepEqual(inspectorLocales(["en", "es"], "en", "es"), ["en", "es"]);
});
test("empty list falls back to default", () => {
  assert.deepEqual(inspectorLocales([], "en", "en"), ["en"]);
});
