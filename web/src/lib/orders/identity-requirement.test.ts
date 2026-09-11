import { test } from "node:test";
import assert from "node:assert/strict";
import { identityDemand, identityVerdict, isIdentityReason } from "./identity-requirement";
import {
  ORDER_STATUSES,
  NON_SELLING_ORDER_STATUSES,
  isSellingOrderStatus,
} from "./order-status";

const coffee = { offeringId: "off-coffee", offeringTitle: "Flat white", requiresIdentity: false, identityReason: null };
const ticket = {
  offeringId: "off-gala",
  offeringTitle: "Gala Dinner",
  requiresIdentity: true,
  identityReason: "attendee_names",
};

test("an anonymous paid cash sale of ordinary items is allowed", () => {
  const verdict = identityVerdict({ intoStatus: "paid", hasCustomer: false, lines: [coffee, coffee] });
  assert.equal(verdict.ok, true, "money alone must not demand a name");
});

test("a free sale never asks either", () => {
  // Nothing about price reaches this decision. The same lines answer the same
  // way whether the order is $0 or $900.
  assert.equal(identityVerdict({ intoStatus: "paid", hasCustomer: false, lines: [coffee] }).ok, true);
  assert.equal(identityDemand([coffee]), null);
});

test("a ticket that needs attendee names refuses, and says which one and why", () => {
  const verdict = identityVerdict({ intoStatus: "paid", hasCustomer: false, lines: [coffee, ticket] });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.reason, "attendee_names");
  assert.equal(verdict.offeringId, "off-gala");
  assert.match(verdict.message, /Gala Dinner/, "the refusal names the offering");
  assert.match(verdict.message, /name for every attendee/, "the refusal says why");
  assert.equal(verdict.message.includes("—"), false, "no em dashes in user-facing copy");
});

test("a named buyer satisfies every demand", () => {
  assert.equal(identityVerdict({ intoStatus: "paid", hasCustomer: true, lines: [ticket] }).ok, true);
});

test("delivery and entitlement each say their own why", () => {
  const delivery = identityVerdict({
    intoStatus: "paid",
    hasCustomer: false,
    lines: [{ ...ticket, identityReason: "delivery", offeringTitle: "Prints, shipped" }],
  });
  assert.equal(delivery.ok, false);
  if (delivery.ok) return;
  assert.equal(delivery.reason, "delivery");
  assert.match(delivery.message, /Prints, shipped/);
  assert.match(delivery.message, /delivered/);

  const credit = identityVerdict({
    intoStatus: "paid",
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
    intoStatus: "paid",
    hasCustomer: false,
    lines: [{ ...ticket, identityReason: "who knows" }],
  });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.reason, "attendee_names");
});

test("a flagged offering with no title is still named as something", () => {
  const verdict = identityVerdict({
    intoStatus: "paid",
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

// ── The regression the reviewer reproduced on the isolated branch. ──────────
//
// The gate used to fire on any status write away from draft, so an anonymous
// draft holding a gated line could not be paid (right) and could not be VOIDED
// or EXPIRED either. The counter holds one open draft per terminal, so the till
// went with it: staff press Void and get "Could not cancel the sale."

test("a gated anonymous draft can be CANCELLED (the POS Void button)", () => {
  const verdict = identityVerdict({ intoStatus: "cancelled", hasCustomer: false, lines: [ticket] });
  assert.equal(verdict.ok, true, "voiding is how an unmeetable demand gets resolved");
});

test("a gated anonymous draft can be EXPIRED (the order expiry sweep)", () => {
  // sweepExpiredOrders writes the same 'cancelled' the void button does. It runs
  // with no operator present, so a refusal here strands the row forever.
  const verdict = identityVerdict({ intoStatus: "cancelled", hasCustomer: false, lines: [ticket] });
  assert.equal(verdict.ok, true);
});

test("a gated anonymous draft still cannot reach ANY selling status", () => {
  // Enumerated from the status graph rather than spot-checking 'paid', because
  // the original defect was a state nobody enumerated.
  for (const status of ORDER_STATUSES.filter(isSellingOrderStatus)) {
    const verdict = identityVerdict({ intoStatus: status, hasCustomer: false, lines: [ticket] });
    assert.equal(verdict.ok, false, `${status} takes a sale and must demand a name`);
  }
});

test("staying in draft asks nothing, so a cart can be built before anyone is named", () => {
  assert.equal(identityVerdict({ intoStatus: "draft", hasCustomer: false, lines: [ticket] }).ok, true);
});

test("a NON-gated anonymous draft is unaffected in every direction", () => {
  for (const status of ORDER_STATUSES) {
    assert.equal(
      identityVerdict({ intoStatus: status, hasCustomer: false, lines: [coffee, coffee] }).ok,
      true,
      `a plain sale must never be blocked, and ${status} blocked it`,
    );
  }
});

test("every status is on exactly one side of the graph, and cancelling is on the safe one", () => {
  assert.deepEqual([...NON_SELLING_ORDER_STATUSES], ["draft", "cancelled"]);
  for (const status of ORDER_STATUSES) {
    const nonSelling = (NON_SELLING_ORDER_STATUSES as readonly string[]).includes(status);
    assert.equal(isSellingOrderStatus(status), !nonSelling, `${status} is classified twice or not at all`);
  }
  assert.equal(isSellingOrderStatus("cancelled"), false);
  assert.equal(isSellingOrderStatus("paid"), true);
});
