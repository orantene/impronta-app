import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV_DESTINATIONS, NAV_REGISTRY, navPath, operatorNav } from "./navigation-registry";

test("nine destinations, each with a stable id", () => {
  assert.equal(NAV_DESTINATIONS.length, 9);
  for (const id of NAV_DESTINATIONS) {
    assert.equal(NAV_REGISTRY[id].id, id);
  }
});

test("built destinations resolve a tenant path; unbuilt ones do not", () => {
  assert.equal(navPath("sales", "acme"), "/acme/admin/sales");
  assert.equal(navPath("catalog", "acme"), "/acme/admin/menu");
  assert.equal(navPath("pos", "acme"), "/acme/admin/pos");
  assert.equal(navPath("tables", "acme"), null);
});

test("POS nav is the few relevant destinations, not the superset", () => {
  assert.deepEqual(operatorNav("salon"), ["today", "pos", "sales", "receipts"]);
  assert.deepEqual(operatorNav("restaurant"), ["tables", "sales", "catalog", "preparation"]);
  assert.deepEqual(operatorNav("event"), ["admissions", "pos", "receipts"]);
  assert.deepEqual(operatorNav("independent"), ["today", "pos", "receipts"]);
});
