import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./menu-order-engine.ts", import.meta.url), "utf8");

test("menu order engine does not touch talent hold or booking slots", () => {
  assert.ok(!source.includes('.from("talent_holds")'));
  assert.ok(!source.includes('.from("talent_bookings")'));
});
