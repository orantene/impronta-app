import assert from "node:assert/strict";
import { test } from "node:test";
import { showOwnerChips } from "./guest-catalog-owner";

test("showOwnerChips needs more than one distinct non-null owner", () => {
  assert.equal(showOwnerChips([]), false);
  assert.equal(showOwnerChips([{ ownerName: "Ana" }, { ownerName: "Ana" }]), false);
  assert.equal(showOwnerChips([{ ownerName: "Ana" }, { ownerName: null }, {}]), false);
  assert.equal(showOwnerChips([{ ownerName: "Ana" }, { ownerName: "Luis" }]), true);
});
