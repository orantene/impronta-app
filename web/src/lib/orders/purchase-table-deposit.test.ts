/**
 * MONEY BUG 3, pipeline half: a venue-rules table deposit passes the policy
 * gate with no offering deposit_pct, and prices the order at exactly the
 * deposit (so the charge, the order total and the floor figure agree).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePurchasePolicy, type OfferingPolicy, type PurchaseIntent } from "@/lib/orders/purchase-policy";
import { amountToCollectCents, MAX_ORDER_TOTAL_CENTS, type PricingResult } from "@/lib/orders/purchase-pricing";
import { tableDepositCurrency, withTableDeposit } from "@/lib/orders/purchase-table-deposit";

const TENANT = "11111111-1111-1111-1111-111111111111";

const tableOffering: OfferingPolicy = {
  offeringId: "off_table",
  status: "published",
  tenantId: TENANT,
  reserveMode: "full",
  depositPct: null,
  allowPayInPerson: true,
  requireAccountToBook: false,
  cancellationHours: 2,
};

const intent = (over: Partial<PurchaseIntent> = {}): PurchaseIntent => ({
  clientOrderKey: "k",
  tenantId: TENANT,
  actorUserId: null,
  paymentChoice: "deposit",
  lines: [{ offeringId: "off_table", units: 1 }],
  ...over,
});

test("a deposit on an offering with no deposit_pct is refused today (the engine_error)", () => {
  const r = resolvePurchasePolicy(intent(), new Map([["off_table", tableOffering]]));
  assert.equal(r.ok, false);
});

test("a venue-rules table deposit is accepted without an offering deposit_pct, collected in full", () => {
  const r = resolvePurchasePolicy(intent({ tableDeposit: true }), new Map([["off_table", tableOffering]]));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.collect, "full");
    assert.equal(r.payInPerson, false);
    assert.equal(r.depositPct, null);
  }
});

test("the table deposit still honours the account gate", () => {
  const gated = { ...tableOffering, requireAccountToBook: true };
  const r = resolvePurchasePolicy(intent({ tableDeposit: true }), new Map([["off_table", gated]]));
  assert.equal(r.ok, false);
});

const priced = (unit: number): PricingResult => ({
  ok: true,
  subtotalCents: unit,
  lines: [{ offeringId: "off_table", variantId: null, addonIds: [], label: "Table", units: 1, unitCents: unit, totalCents: unit, talentProfileId: null, ownerTenantId: TENANT, talentCostCents: 0 }],
});

test("MXN 100 x 6 prices the order at 60000 cents and collects 60000, whatever the catalog price", () => {
  for (const catalogPrice of [0, 10_000, 250_000]) {
    const out = withTableDeposit(priced(catalogPrice), { cents: 60_000, currency: "MXN" });
    assert.ok(out.ok);
    if (out.ok) {
      assert.equal(out.subtotalCents, 60_000);
      assert.equal(out.lines.length, 1);
      assert.equal(out.lines[0]!.totalCents, 60_000);
      assert.equal(amountToCollectCents(out.subtotalCents, "full", null), 60_000);
    }
  }
});

test("no table deposit leaves pricing untouched", () => {
  const base = priced(5_000);
  assert.equal(withTableDeposit(base, undefined), base);
});

test("an absurd deposit is refused, not charged", () => {
  const out = withTableDeposit(priced(0), { cents: MAX_ORDER_TOTAL_CENTS + 1, currency: "USD" });
  assert.equal(out.ok, false);
});

// P2 (TUL-1453): the deposit is charged in the workspace currency, and the
// reservation offering's own currency must agree with it or the deposit is refused.
test("a deposit in the offering's own currency is charged in it", () => {
  assert.deepEqual(tableDepositCurrency("MXN", ["MXN"]), { ok: true, currency: "MXN" });
  assert.deepEqual(tableDepositCurrency("MXN", [" mxn "]), { ok: true, currency: "MXN" });
});

test("an offering priced in another currency refuses the deposit rather than relabel it", () => {
  assert.deepEqual(tableDepositCurrency("MXN", ["USD"]), { ok: false, reason: "currency_mismatch", currencies: ["MXN", "USD"] });
});

test("an offering with no currency of its own takes the workspace currency", () => {
  assert.deepEqual(tableDepositCurrency("MXN", [null]), { ok: true, currency: "MXN" });
  assert.deepEqual(tableDepositCurrency("MXN", [""]), { ok: true, currency: "MXN" });
});

test("a malformed deposit currency is refused, never defaulted", () => {
  assert.equal(tableDepositCurrency("pesos", ["MXN"]).ok, false);
  assert.equal(tableDepositCurrency("", [null]).ok, false);
});
