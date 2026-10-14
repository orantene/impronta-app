import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderTimeZones, MEXICO_ZONES } from "./timezone-order";

test("TUL-821: Mexico zones come first, in the suggested order, then the rest", () => {
  const all = ["Africa/Cairo", "America/Tijuana", "America/Cancun", "Europe/Madrid", "America/Mexico_City", "UTC"];
  const { suggested, rest } = orderTimeZones(all);
  assert.deepEqual(suggested, ["America/Cancun", "America/Mexico_City", "America/Tijuana"]);
  assert.deepEqual(rest, ["Africa/Cairo", "Europe/Madrid", "UTC"]);
  assert.equal(MEXICO_ZONES[0], "America/Cancun");
});

test("TUL-821: zones missing from the browser list are not invented", () => {
  const { suggested } = orderTimeZones(["America/Cancun", "UTC"]);
  assert.deepEqual(suggested, ["America/Cancun"]);
});

test("TUL-821: the time zone block sits above the weekly hours rows", () => {
  const src = readFileSync(new URL("./AgendaAvailabilityPage.tsx", import.meta.url), "utf8");
  const tz = src.indexOf("availability-timezone-section");
  const weekly = src.indexOf("rows.map");
  assert.ok(tz > 0 && weekly > tz, "time zone section must precede the weekly rows");
});
