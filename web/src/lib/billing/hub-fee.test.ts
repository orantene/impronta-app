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
import {
  MAX_SERVICE_FEE_BPS,
  effectivePassThroughBps,
  loadSellerPassThroughBps,
  normalizeWorkspacePlanKey,
  serviceFeePercentToBps,
} from "./pass-through-rate";

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

describe("the fee is set per plan by Platform Admin (0-20%)", () => {
  test("frozen order snapshot beats the seller's current plan beats platform beats 150", () => {
    assert.equal(effectivePassThroughBps({ frozenBps: 100, planBps: 300, platformBps: 150 }), 100);
    assert.equal(effectivePassThroughBps({ frozenBps: null, planBps: 300, platformBps: 150 }), 300);
    assert.equal(effectivePassThroughBps({ planBps: null, platformBps: 250 }), 250);
  });
  test("an explicit 0 is honoured (a waived fee), not treated as missing", () => {
    assert.equal(effectivePassThroughBps({ planBps: 0, platformBps: 150 }), 0);
    assert.equal(effectivePassThroughBps({ frozenBps: 0, planBps: 300 }), 0);
  });
  test("a garbage or out-of-range value is ignored (falls to the next level, never to a wild rate)", () => {
    for (const bad of [-1, 2001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(effectivePassThroughBps({ frozenBps: bad, planBps: 300, platformBps: 150 }), 300, String(bad));
      assert.equal(effectivePassThroughBps({ planBps: bad, platformBps: 250 }), 250, String(bad));
      assert.equal(effectivePassThroughBps({ platformBps: bad }), 150, String(bad));
    }
    assert.equal(MAX_SERVICE_FEE_BPS, 2000);
  });
  test("validation: 0-20% in whole hundredths of a percent", () => {
    assert.equal(serviceFeePercentToBps(1.5), 150);
    assert.equal(serviceFeePercentToBps(0), 0);
    assert.equal(serviceFeePercentToBps(20), 2000);
    assert.equal(serviceFeePercentToBps(0.05), 5);
    for (const bad of [-0.01, 20.01, 100, Number.NaN, 1.555, "1.5", null, undefined]) {
      assert.equal(serviceFeePercentToBps(bad), null, String(bad));
    }
  });
  test("plan keys: hub-network spellings are the network plan", () => {
    assert.equal(normalizeWorkspacePlanKey("hub"), "network");
    assert.equal(normalizeWorkspacePlanKey("hub-network"), "network");
    assert.equal(normalizeWorkspacePlanKey("agency"), "agency");
    assert.equal(normalizeWorkspacePlanKey(null), null);
  });
});

describe("loadSellerPassThroughBps reads the seller's CURRENT plan, and the order snapshot wins", () => {
  const fake = (tables: Record<string, Record<string, unknown>>) => ({
    from: (t: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: tables[t] ?? null, error: null }) };
      return q;
    },
  });
  const planFeeBps = { agency: 300, studio: 200, network: 100, talent_pro: 250, talent_basic: 150 };
  test("workspace seller by agencies.plan_tier; talent seller by talent_plan_key", async () => {
    assert.equal(
      await loadSellerPassThroughBps(fake({ agencies: { plan_tier: "agency" } }), { platformBps: 150, planFeeBps, seller: { kind: "workspace", partyId: "w1" } }),
      300,
    );
    assert.equal(
      await loadSellerPassThroughBps(fake({ agencies: { plan_tier: "hub-network" } }), { platformBps: 150, planFeeBps, seller: { kind: "workspace", partyId: "w1" } }),
      100,
    );
    assert.equal(
      await loadSellerPassThroughBps(fake({ talent_profiles: { talent_plan_key: "talent_pro" } }), { platformBps: 150, planFeeBps, seller: { kind: "talent", partyId: "t1" } }),
      250,
    );
  });
  test("a plan change after the order was priced does not move it: the frozen snapshot wins", async () => {
    const bps = await loadSellerPassThroughBps(fake({ agencies: { plan_tier: "agency" } }), {
      platformBps: 150,
      planFeeBps,
      frozenByParty: { w1: 150 },
      seller: { kind: "workspace", partyId: "w1" },
    });
    assert.equal(bps, 150);
  });
  test("an unknown plan, a failed read or no map falls to the platform rate", async () => {
    assert.equal(await loadSellerPassThroughBps(fake({ agencies: { plan_tier: "mystery" } }), { platformBps: 150, planFeeBps, seller: { kind: "workspace", partyId: "w1" } }), 150);
    assert.equal(await loadSellerPassThroughBps({ from: () => { throw new Error("db down"); } }, { platformBps: 150, planFeeBps, seller: { kind: "talent", partyId: "t1" } }), 150);
    assert.equal(await loadSellerPassThroughBps(fake({ agencies: { plan_tier: "agency" } }), { platformBps: 175, seller: { kind: "workspace", partyId: "w1" } }), 175);
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
  test("the order is priced with a frozen fee and every later collect reads it", () => {
    assert.match(read("../orders/purchase.ts"), /service_fee_by_party: serviceFeeBpsByParty/);
    const pc = read("../orders/purchase-collect.ts");
    assert.match(pc, /select\("service_fee_by_party"\)/);
    assert.match(pc, /frozenFeeByParty/);
    assert.match(read("./commission-engine.ts"), /select\("service_fee_by_party"\)/);
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
    assert.match(sql, /product_tiers[\s\S]*service_fee_bps INT NOT NULL DEFAULT 150/);
    assert.match(sql, /BETWEEN 0 AND 2000/);
    assert.match(sql, /orders[\s\S]*service_fee_by_party JSONB/);
    assert.match(sql, /plan_service_fee_bps/);
    assert.doesNotMatch(sql, /CREATE POLICY|GRANT .* ON .*product_tiers/i);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM/);
  });
});
