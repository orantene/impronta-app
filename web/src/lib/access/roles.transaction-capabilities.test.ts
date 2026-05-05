import { test } from "node:test";
import assert from "node:assert/strict";

import { roleGrantsCapability } from "@/lib/access/roles";

test("coordinator has receiver-select and request-payment caps", () => {
  assert.equal(roleGrantsCapability("coordinator", "booking.payment.select_receiver"), true);
  assert.equal(roleGrantsCapability("coordinator", "booking.payment.request"), true);
  assert.equal(roleGrantsCapability("coordinator", "booking.payment.change_receiver"), false);
});

test("admin has elevated booking payment capabilities", () => {
  assert.equal(roleGrantsCapability("admin", "booking.payment.change_receiver"), true);
  assert.equal(roleGrantsCapability("admin", "booking.payment.mark_received"), true);
  assert.equal(roleGrantsCapability("admin", "booking.payment.payout_mark_external"), true);
  assert.equal(roleGrantsCapability("admin", "booking.payment.refund"), true);
});

test("owner has payout-account management capability", () => {
  assert.equal(roleGrantsCapability("owner", "agency.payout_account.manage"), true);
});

test("only owner can manage agency domains", () => {
  assert.equal(roleGrantsCapability("admin", "manage_agency_domains"), false);
  assert.equal(roleGrantsCapability("owner", "manage_agency_domains"), true);
});
