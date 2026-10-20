/**
 * TUL-1366: the Tulala service fee. 1.5% on top, customer-only, is the platform
 * default for every plan and model (no env needed); the rate is configurable per
 * plan and per workspace for the later 3-5%; the fee is returned when the seller
 * cancels and kept when the client cancels.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { nonRefundableFeeCents } from "./commission";
import { CLIENT_SERVICE_FEE_BPS, passThroughArmed } from "./fee-config";
import { effectivePassThroughBps } from "./pass-through-rate";

describe("1.5% customer-only is the default, no env key needed", () => {
  test("armed when the env is unset, empty or '1'", () => {
    assert.equal(passThroughArmed({}), true);
    assert.equal(passThroughArmed({ COMMISSION_PROCESSING_PASS_THROUGH: "" }), true);
    assert.equal(passThroughArmed({ COMMISSION_PROCESSING_PASS_THROUGH: "1" }), true);
  });
  test("'0' is the explicit kill switch (back to the legacy included model)", () => {
    assert.equal(passThroughArmed({ COMMISSION_PROCESSING_PASS_THROUGH: "0" }), false);
  });
  test("the default rate is 150 bps", () => {
    assert.equal(CLIENT_SERVICE_FEE_BPS, 150);
    assert.equal(effectivePassThroughBps({ platformBps: null }), 150);
  });
});

describe("rate is configurable per plan and tenant (for the later 3-5%)", () => {
  test("tenant override beats plan beats platform", () => {
    assert.equal(effectivePassThroughBps({ platformBps: 150, planBps: 300, tenantBps: 500 }), 500);
    assert.equal(effectivePassThroughBps({ platformBps: 150, planBps: 300, tenantBps: null }), 300);
    assert.equal(effectivePassThroughBps({ platformBps: 250, planBps: null, tenantBps: null }), 250);
  });
  test("an explicit 0 override is honoured (a waived fee), not treated as missing", () => {
    assert.equal(effectivePassThroughBps({ platformBps: 150, tenantBps: 0 }), 0);
  });
  test("a garbage or out-of-range override is ignored (fail to the next level, never to a wild rate)", () => {
    for (const bad of [-1, 1001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(effectivePassThroughBps({ platformBps: 150, planBps: 300, tenantBps: bad }), 300, String(bad));
      assert.equal(effectivePassThroughBps({ platformBps: bad, planBps: null, tenantBps: null }), 150, String(bad));
    }
  });
});

describe("the 1.5% on a cancellation", () => {
  const snap = { processing_mode: "pass_through" as const, processing_fee_payer: "client" as const, client_surcharge_cents: 150, client_processing_fee_cents: 320 };
  test("kept by default and when the client cancels (unchanged behaviour)", () => {
    assert.equal(nonRefundableFeeCents([snap]), 470);
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "client" }), 470);
  });
  test("returned when the seller side cancels: only the surcharge comes back", () => {
    for (const cancelledBy of ["talent", "staff", "system"] as const) {
      assert.equal(nonRefundableFeeCents([snap], { cancelledBy }), 320, cancelledBy);
    }
  });
  test("a seller-pays snapshot with no recorded fee still blocks (never guess), even on a seller cancel", () => {
    const sellerPays = { processing_mode: "pass_through" as const, processing_fee_payer: "seller" as const, client_surcharge_cents: 150, processing_fee_cents: 0 };
    assert.equal(nonRefundableFeeCents([sellerPays], { cancelledBy: "talent" }), null);
  });
  test("included-mode snapshots are unchanged", () => {
    assert.equal(nonRefundableFeeCents([{ processing_mode: "included", client_surcharge_cents: 300 }], { cancelledBy: "talent" }), 0);
  });
});

describe("wiring (every checkout and refund path)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  test("the commission engine and the checkout collect both use the same arming and rate resolver", () => {
    for (const f of ["./commission-engine.ts", "../orders/purchase-pass-through-collect.ts"]) {
      const src = read(f);
      assert.match(src, /passThroughArmed\(\)/, f);
      assert.match(src, /loadSellerPassThroughBps/, f);
      assert.doesNotMatch(src, /process\.env\.COMMISSION_PROCESSING_PASS_THROUGH/, `${f} must not read the env key directly`);
    }
  });
  test("all four refund paths pass who cancelled, so a seller cancel returns the fee", () => {
    for (const f of [
      "../payments/refund-execute.ts",
      "../payments/refunds.ts",
      "../orders/refund-execute-lines.ts",
      "../../app/(workspace)/[tenantSlug]/admin/orders/refund-actions.ts",
    ]) {
      assert.match(read(f), /cancelledBy: (await )?loadBookingCancelledBy\(/, f);
    }
  });
  test("the held migration lives in _pending_pm at the reserved version and is additive", () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/_pending_pm/20261231419400_hub_service_fee_default.sql", import.meta.url), "utf8");
    assert.match(sql, /SET DEFAULT 'pass_through'/);
    assert.match(sql, /plan_tier_pass_through_bps/);
    assert.match(sql, /workspace_commission_overrides[\s\S]*pass_through_take_bps/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM/);
  });
});
