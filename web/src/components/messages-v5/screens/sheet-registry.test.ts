import assert from "node:assert/strict";
import { test } from "node:test";

import { registerActionSheet, registeredActionIds, registeredActionSheet, resetActionSheetRegistry } from "./sheet-registry";

test("registry: a lane registers one sheet per action id and the shell can find it", () => {
  resetActionSheetRegistry();
  assert.equal(registeredActionSheet("add_items"), null);
  const Component = () => null;
  registerActionSheet("add_items", { Component, lane: "L5" });
  assert.equal(registeredActionSheet("add_items")?.lane, "L5");
  assert.deepEqual(registeredActionIds(), ["add_items"]);
  resetActionSheetRegistry();
  assert.deepEqual(registeredActionIds(), []);
});
