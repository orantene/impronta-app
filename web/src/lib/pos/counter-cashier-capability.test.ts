import assert from "node:assert/strict";
import test from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

// PM 2026-10-21: an editor-level cashier seat opens the till and takes sales; a viewer cannot;
// refunds stay admin-level and the manager bar (booking.payment.request) still gates voids and limits.
test("editor and above hold operate_venue; viewer does not", () => {
  assert.equal(roleGrantsCapability("viewer", "operate_venue"), false);
  for (const role of ["editor", "manager", "admin", "owner"] as const) {
    assert.equal(roleGrantsCapability(role, "operate_venue"), true, role);
  }
});

test("an editor still lacks the manager-level and refund capabilities", () => {
  assert.equal(roleGrantsCapability("editor", "booking.payment.request"), false);
  assert.equal(roleGrantsCapability("editor", "booking.payment.refund"), false);
  assert.equal(roleGrantsCapability("manager", "booking.payment.request"), true);
});
