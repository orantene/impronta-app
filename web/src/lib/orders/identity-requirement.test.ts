import { test } from "node:test";
import assert from "node:assert/strict";
import { identityDemand, identityVerdict, isIdentityReason } from "./identity-requirement";

const coffee = { offeringId: "off-coffee", offeringTitle: "Flat white", requiresIdentity: false, identityReason: null };
const ticket = {
  offeringId: "off-gala",
  offeringTitle: "Gala Dinner",
  requiresIdentity: true,
  identityReason: "attendee_names",
};

test("an anonymous paid cash sale of ordinary items is allowed", () => {
  const verdict = identityVerdict({ hasCustomer: false, lines: [coffee, coffee] });
  assert.equal(verdict.ok, true, "money alone must not demand a name");
});

test("a free sale never asks either", () => {
  // Nothing about price reaches this decision. The same lines answer the same
  // way whether the order is $0 or $900.
  assert.equal(identityVerdict({ hasCustomer: false, lines: [coffee] }).ok, true);
  assert.equal(identityDemand([coffee]), null);
});

test("a ticket that needs attendee names refuses, and says which one and why", () => {
  const verdict = identityVerdict({ hasCustomer: false, lines: [coffee, ticket] });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.reason, "attendee_names");
  assert.equal(verdict.offeringId, "off-gala");
  assert.match(verdict.message, /Gala Dinner/, "the refusal names the offering");
  assert.match(verdict.message, /name for every attendee/, "the refusal says why");
  assert.equal(verdict.message.includes("—"), false, "no em dashes in user-facing copy");
});

test("a named buyer satisfies every demand", () => {
  assert.equal(identityVerdict({ hasCustomer: true, lines: [ticket] }).ok, true);
});

test("delivery and entitlement each say their own why", () => {
  const delivery = identityVerdict({
    hasCustomer: false,
    lines: [{ ...ticket, identityReason: "delivery", offeringTitle: "Prints, shipped" }],
  });
  assert.equal(delivery.ok, false);
  if (delivery.ok) return;
  assert.equal(delivery.reason, "delivery");
  assert.match(delivery.message, /Prints, shipped/);
  assert.match(delivery.message, /delivered/);

  const credit = identityVerdict({
    hasCustomer: false,
    lines: [{ ...ticket, identityReason: "entitlement", offeringTitle: "10-class pass" }],
  });
  assert.equal(credit.ok, false);
  if (credit.ok) return;
  assert.equal(credit.reason, "entitlement");
  assert.match(credit.message, /credit the buyer spends later/);
});

test("the first demanding line wins, in the order the caller supplied", () => {
  const demand = identityDemand([
    coffee,
    { ...ticket, offeringId: "a", offeringTitle: "First" },
    { ...ticket, offeringId: "b", offeringTitle: "Second" },
  ]);
  assert.equal(demand?.offeringId, "a");
});

test("a flagged offering with an unusable reason still demands a name", () => {
  // A data problem must not become a silently unnamed ticket holder.
  const verdict = identityVerdict({
    hasCustomer: false,
    lines: [{ ...ticket, identityReason: "who knows" }],
  });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.reason, "attendee_names");
});

test("a flagged offering with no title is still named as something", () => {
  const verdict = identityVerdict({
    hasCustomer: false,
    lines: [{ offeringId: null, offeringTitle: "  ", requiresIdentity: true, identityReason: "delivery" }],
  });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.message, /One item in this sale/);
});

test("isIdentityReason accepts only the three the CHECK allows", () => {
  assert.equal(isIdentityReason("attendee_names"), true);
  assert.equal(isIdentityReason("delivery"), true);
  assert.equal(isIdentityReason("entitlement"), true);
  assert.equal(isIdentityReason("age"), false);
  assert.equal(isIdentityReason(null), false);
});
