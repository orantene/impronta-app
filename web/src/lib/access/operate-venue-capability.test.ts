import { test } from "node:test";
import assert from "node:assert/strict";

import { roleGrantsCapability } from "@/lib/access/roles";
import { getCapability, isKnownCapability } from "@/lib/access/capabilities";

// TUL-1708: the capability-less staff-guard sweep found several POS/venue
// operation writers (tables, floor, door, classes, preparation, sessions,
// customer attach) that no existing capability fits at the right tier: every
// capability above `viewer` was either too narrow (site/CMS editing) or
// too high (manager-only booking-payment keys), which would have locked out
// editors who run the floor day to day. `operate_venue` is editor-tier: a
// viewer cannot write, everyone else who can already touch the workspace can.
test("viewer cannot operate the venue; editor and above can", () => {
  assert.equal(roleGrantsCapability("viewer", "operate_venue"), false);
  assert.equal(roleGrantsCapability("editor", "operate_venue"), true);
  assert.equal(roleGrantsCapability("manager", "operate_venue"), true);
  assert.equal(roleGrantsCapability("admin", "operate_venue"), true);
  assert.equal(roleGrantsCapability("owner", "operate_venue"), true);
});

test("operate_venue is registered in the capability catalog", () => {
  assert.equal(isKnownCapability("operate_venue"), true);
  const def = getCapability("operate_venue");
  assert.equal(def.category, "operations");
  assert.equal(def.scope, "tenant");
  assert.equal(def.deprecated, false);
});
