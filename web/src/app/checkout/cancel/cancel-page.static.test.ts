import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("TUL-350: cancel page is localized from the request locale (ES + EN)", () => {
  assert.match(src, /getRequestLocale/);
  assert.match(src, /Pago cancelado/);
  assert.match(src, /Payment cancelled/);
  assert.match(src, /No se hizo ningún cargo/);
});

test("TUL-350: cancel page does not name surfaces a guest does not have", () => {
  assert.doesNotMatch(src, /project page/i);
  assert.doesNotMatch(src, /dashboard|panel de control/i);
});
