/**
 * The purchase policy gate — the client declares intent, never policy.
 *
 * Every test here is a thing a guest could send that must be refused server-side,
 * because the Sheet's read of the offering policy is a display concern and a
 * guest can edit anything that reaches a server action.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePurchasePolicy,
  type OfferingPolicy,
  type PurchaseIntent,
} from "@/lib/orders/purchase-policy";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";

function policy(over: Partial<OfferingPolicy> = {}): OfferingPolicy {
  return {
    offeringId: "off_1",
    status: "published",
    tenantId: TENANT,
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: false,
    requireAccountToBook: false,
    cancellationHours: null,
    ...over,
  };
}

function intent(over: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    clientOrderKey: "key_1",
    tenantId: TENANT,
    actorUserId: null,
    paymentChoice: "full",
    lines: [{ offeringId: "off_1", units: 1 }],
    ...over,
  };
}

const map = (...ps: OfferingPolicy[]) => new Map(ps.map((p) => [p.offeringId, p]));

// ── The gates a guest could try to walk through ──────────────────────────────

test("pay in person is REFUSED when the offering forbids it", () => {
  const r = resolvePurchasePolicy(
    intent({ paymentChoice: "in_person" }),
    map(policy({ allowPayInPerson: false })),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "pay_in_person_not_allowed");
});

test("pay in person is allowed when the offering allows it", () => {
  const r = resolvePurchasePolicy(
    intent({ paymentChoice: "in_person" }),
    map(policy({ allowPayInPerson: true })),
  );
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.collect, "none");
  assert.equal(r.ok && r.payInPerson, true);
});

test("ONE line forbidding pay-in-person forbids it for the whole cart", () => {
  const r = resolvePurchasePolicy(
    intent({
      paymentChoice: "in_person",
      lines: [
        { offeringId: "off_1", units: 1 },
        { offeringId: "off_2", units: 1 },
      ],
    }),
    map(
      policy({ offeringId: "off_1", allowPayInPerson: true }),
      policy({ offeringId: "off_2", allowPayInPerson: false }),
    ),
  );
  // A cart is charged once. It cannot be half pay-in-person.
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "pay_in_person_not_allowed");
  assert.equal(!r.ok && r.offeringId, "off_2");
});

test("an anonymous buyer is REFUSED when any line requires an account", () => {
  const r = resolvePurchasePolicy(
    intent({ actorUserId: null }),
    map(policy({ requireAccountToBook: true })),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "account_required");
});

test("a signed-in buyer passes the account gate", () => {
  const r = resolvePurchasePolicy(
    intent({ actorUserId: "user_1" }),
    map(policy({ requireAccountToBook: true })),
  );
  assert.equal(r.ok, true);
});

test("deposit is REFUSED when the offering is not configured for one", () => {
  const r = resolvePurchasePolicy(
    intent({ paymentChoice: "deposit" }),
    map(policy({ reserveMode: "full", depositPct: null })),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "deposit_not_offered");
});

test("deposit takes the SMALLEST configured percentage across the lines", () => {
  const r = resolvePurchasePolicy(
    intent({
      paymentChoice: "deposit",
      lines: [
        { offeringId: "off_1", units: 1 },
        { offeringId: "off_2", units: 1 },
      ],
    }),
    map(
      policy({ offeringId: "off_1", reserveMode: "deposit", depositPct: 50 }),
      policy({ offeringId: "off_2", reserveMode: "deposit", depositPct: 20 }),
    ),
  );
  // Taking the largest would charge more up front than one offering asked for.
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.collect, "deposit");
  assert.equal(r.ok && r.depositPct, 20);
});

test("reserve_mode 'free' collects NOTHING even when the client asks to pay in full", () => {
  const r = resolvePurchasePolicy(
    intent({ paymentChoice: "full" }),
    map(policy({ reserveMode: "free" })),
  );
  // The owner chose to take no money at booking. A client cannot override that
  // into a charge the owner never agreed to collect.
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.collect, "none");
});

test("a free line mixed with a paid line still collects", () => {
  const r = resolvePurchasePolicy(
    intent({
      lines: [
        { offeringId: "off_1", units: 1 },
        { offeringId: "off_2", units: 1 },
      ],
    }),
    map(
      policy({ offeringId: "off_1", reserveMode: "free" }),
      policy({ offeringId: "off_2", reserveMode: "full" }),
    ),
  );
  assert.equal(r.ok && r.collect, "full");
});

// ── Things that must never resolve to a permissive default ───────────────────

test("an offering we could not load is REFUSED, not defaulted", () => {
  const r = resolvePurchasePolicy(intent(), new Map());
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "unknown_offering");
});

test("an unpublished offering is refused", () => {
  for (const status of ["draft", "archived"] as const) {
    const r = resolvePurchasePolicy(intent(), map(policy({ status })));
    assert.equal(r.ok, false, `${status} must refuse`);
    assert.equal(!r.ok && r.reason, "offering_not_published");
  }
});

test("another tenant's offering cannot be sold through this storefront", () => {
  const r = resolvePurchasePolicy(intent(), map(policy({ tenantId: OTHER_TENANT })));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "cross_tenant_line");
});

test("an unknown payment choice is refused rather than coerced", () => {
  const r = resolvePurchasePolicy(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intent({ paymentChoice: "free_please" as any }),
    map(policy()),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "invalid_payment_choice");
});

test("units must be a sane positive number", () => {
  for (const units of [0, -1, 1000, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = resolvePurchasePolicy(intent({ lines: [{ offeringId: "off_1", units }] }), map(policy()));
    assert.equal(r.ok, false, `units=${units} must refuse`);
    assert.equal(!r.ok && r.reason, "invalid_units");
  }
});

test("an empty cart is refused", () => {
  const r = resolvePurchasePolicy(intent({ lines: [] }), map(policy()));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "empty_order");
});

test("cancellation takes the STRICTEST window across the lines", () => {
  const r = resolvePurchasePolicy(
    intent({
      lines: [
        { offeringId: "off_1", units: 1 },
        { offeringId: "off_2", units: 1 },
      ],
    }),
    map(
      policy({ offeringId: "off_1", cancellationHours: 24 }),
      policy({ offeringId: "off_2", cancellationHours: 72 }),
    ),
  );
  assert.equal(r.ok && r.cancellationHours, 72);
});
