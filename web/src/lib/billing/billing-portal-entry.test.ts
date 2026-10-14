import assert from "node:assert/strict";
import test from "node:test";
import { billingPortalEntry } from "./billing-portal-entry";

test("no subscription record: no portal button", () => {
  assert.equal(billingPortalEntry(null), null);
  assert.equal(billingPortalEntry(undefined), null);
});

test("a live subscription manages the plan", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", null]) {
    assert.equal(billingPortalEntry({ status }), "manage");
  }
});

test("an ended subscription still reaches its invoices", () => {
  for (const status of ["canceled", "cancelled", "incomplete_expired"]) {
    assert.equal(billingPortalEntry({ status }), "invoices");
  }
});
