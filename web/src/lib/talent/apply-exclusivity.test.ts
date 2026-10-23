import assert from "node:assert/strict";
import { test } from "node:test";
import { rosterBlocksApply, type ExclusivityRosterRow } from "./apply-exclusivity";

const row = (o: Partial<ExclusivityRosterRow>): ExclusivityRosterRow => ({
  tenant_id: "other",
  is_primary: true,
  status: "active",
  exclusivity_status: "confirmed",
  ...o,
});

test("primary + confirmed at another studio blocks", () => {
  assert.equal(rosterBlocksApply([row({})], "target"), true);
  assert.equal(rosterBlocksApply([row({ exclusivity_status: "auto_assigned" })], "target"), true);
});

test("hub / non-primary rows with the default confirmed status never block", () => {
  assert.equal(rosterBlocksApply([row({ is_primary: false }), row({ is_primary: false, tenant_id: "hub" })], "target"), false);
});

test("primary at the same tenant does not block", () => {
  assert.equal(rosterBlocksApply([row({ tenant_id: "target" })], "target"), false);
});

test("removed / rejected primary rows and non-exclusive statuses do not block", () => {
  assert.equal(rosterBlocksApply([row({ status: "removed" }), row({ status: "rejected" })], "target"), false);
  assert.equal(rosterBlocksApply([row({ exclusivity_status: "none" })], "target"), false);
});

test("a blocking primary among non-primary rows still blocks; empty roster allows", () => {
  assert.equal(rosterBlocksApply([row({ is_primary: false }), row({})], "target"), true);
  assert.equal(rosterBlocksApply([], "target"), false);
});
