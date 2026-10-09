import assert from "node:assert/strict";
import test from "node:test";

import { pickAccountTimeZone } from "./account-timezone";
import { formatZonedWhen } from "./area-pure";

test("the talent's booking zone wins over the workspace zone", () => {
  assert.equal(pickAccountTimeZone("America/Mexico_City", "UTC"), "America/Mexico_City");
  assert.equal(pickAccountTimeZone("America/Mexico_City", "Europe/Madrid"), "America/Mexico_City");
});

test("falls back to the workspace zone, then UTC; invalid zones are ignored", () => {
  assert.equal(pickAccountTimeZone(null, "America/Cancun"), "America/Cancun");
  assert.equal(pickAccountTimeZone("Not/AZone", "America/Cancun"), "America/Cancun");
  assert.equal(pickAccountTimeZone("  ", null), "UTC");
  assert.equal(pickAccountTimeZone(undefined, undefined), "UTC");
});

test("a 10:30 Mexico City slot reads 10:30, not 4:30 p.m. UTC", () => {
  const iso = "2026-10-09T16:30:00Z";
  const mx = formatZonedWhen(iso, pickAccountTimeZone("America/Mexico_City", "UTC"), "es");
  const utc = formatZonedWhen(iso, pickAccountTimeZone(null, null), "es");
  assert.ok(mx && /10:30/.test(mx.time), mx?.time);
  assert.ok(utc && /4:30/.test(utc.time), utc?.time);
});
