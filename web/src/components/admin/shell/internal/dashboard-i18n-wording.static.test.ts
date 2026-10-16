import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync("src/components/admin/shell/internal/dashboard-i18n.ts", "utf8");

test("TUL-915: items are always artículos in the dashboard ES dictionary, never elementos", () => {
  assert.doesNotMatch(src, /elementos? (necesit|coincid)/i);
  assert.match(src, /"items need attention": "artículos necesitan atención"/);
});
