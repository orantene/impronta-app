import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAdvancedLibraryAllowsOperation,
  filterKindsForAdvancedElementLibrary,
  gateNestedInsertKinds,
  isAdvancedElementLibraryEnabledForPlan,
} from "./element-library-policy";

test("free plan disables advanced element library", () => {
  assert.equal(isAdvancedElementLibraryEnabledForPlan("free"), false);
});

test("paid plans enable advanced element library", () => {
  assert.equal(isAdvancedElementLibraryEnabledForPlan("studio"), true);
  assert.equal(isAdvancedElementLibraryEnabledForPlan("agency"), true);
});

test("filterKinds clears inserts when advanced is off", () => {
  assert.deepEqual(
    filterKindsForAdvancedElementLibrary(["heading", "paragraph"], false),
    [],
  );
});

test("filterKinds preserves order when advanced is on", () => {
  assert.deepEqual(
    filterKindsForAdvancedElementLibrary(["heading", "paragraph"], true),
    ["heading", "paragraph"],
  );
});

test("assertAdvancedLibraryAllowsOperation blocks insert when advanced off", () => {
  const r = assertAdvancedLibraryAllowsOperation("insert", false);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.message.includes("paid workspace"));
});

test("assertAdvancedLibraryAllowsOperation allows move when advanced off", () => {
  assert.deepEqual(assertAdvancedLibraryAllowsOperation("move", false), { ok: true });
});

test("gateNestedInsertKinds clears when advanced is off", () => {
  assert.deepEqual(gateNestedInsertKinds(["heading", "paragraph"], false), []);
});

test("gateNestedInsertKinds applies shipped catalog then plan gate", () => {
  assert.deepEqual(
    gateNestedInsertKinds(["heading", "paragraph"], true),
    ["heading", "paragraph"],
  );
});
