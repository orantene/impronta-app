import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverCopy } from "./_discover-copy";

test("es and en tables have the same keys and no em dashes", () => {
  const en = discoverCopy("en");
  const es = discoverCopy("es-MX");
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const [k, v] of Object.entries(es)) {
    if (typeof v === "string") assert.ok(!v.includes("—"), k);
  }
  assert.equal(es.travelRadius, "Radio de viaje");
  assert.equal(en.travelRadius, "Travel radius");
  assert.equal(es.kmFromHome(30), "30 km desde tu ubicación base");
  assert.equal(discoverCopy(undefined).travelRadius, "Travel radius");
});
