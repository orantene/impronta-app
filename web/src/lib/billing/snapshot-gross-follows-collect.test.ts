/**
 * The snapshot's gross_charged must equal exactly what the order checkout
 * collects, per processing mode (card 8: snapshot 103,000 vs 100,000 charged).
 *
 *   included     the collect charges the order total; no client surcharge, no base fee
 *   pass_through the collect adds the pass_through surcharge; the snapshot records the same
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveBookingCommissions, type ProcessorFeeRates } from "./commission";
import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";

const MX: ProcessorFeeRates = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };
const LINE = [{ line_total_cents: 100_000, talent_cost_total_cents: 100_000 }];

/** The admin the REAL collect reads: an independent talent (no roster rows), the platform mode row, a seller-pays fee payer. */
function collectAdmin(mode: "included" | "pass_through") {
  const rosterQuery = {
    select: () => rosterQuery,
    eq: () => rosterQuery,
    in: () => rosterQuery,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return {
    from: () => rosterQuery,
    rpc: async (name: string) => {
      if (name === "engine_platform_processing_mode") {
        return { data: { processing_mode: mode, pass_through_take_bps: 150, processor_fee_rates: { mxn: MX } }, error: null };
      }
      return { data: "seller", error: null }; // engine_processing_fee_payer
    },
  } as never;
}

const COLLECT_INPUT = {
  tenantId: "t",
  orderCurrency: "MXN",
  lines: [{ talentProfileId: "t1", ownerTenantId: null, talentCostCents: 100_000, totalCents: 100_000 }],
  subtotalCents: 100_000,
  totalCents: 100_000,
  collect: "full" as const,
  depositPct: null,
  payInPerson: false,
};

describe("snapshot gross == the real resolveCheckoutCollectCents", () => {
  it("included mode, order-backed: collect = order total, snapshot gross equal, no surcharge", async () => {
    const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    try {
      const { collectCents } = await resolveCheckoutCollectCents(collectAdmin("included"), COLLECT_INPUT);
      const snap = resolveBookingCommissions({
        tenantId: "t", workspacePlan: "free", offerLineItems: LINE, currencyCode: "MXN", paymentMethod: "card",
        sellerOfRecord: "talent", orderBackedCollect: true,
        platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {} },
        tenantOverride: null,
      });
      assert.equal(collectCents, 100_000);
      assert.equal(snap.gross_charged_cents, collectCents);
      assert.equal(snap.client_surcharge_cents, 0);
      assert.equal(snap.talent_net_cents, 100_000 - snap.platform_fee_cents);
    } finally {
      if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
      else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
    }
  });

  it("pass_through, order-backed: collect adds the surcharge and the snapshot records the same amount", async () => {
    const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    process.env.COMMISSION_PROCESSING_PASS_THROUGH = "1";
    try {
      const { collectCents } = await resolveCheckoutCollectCents(collectAdmin("pass_through"), COLLECT_INPUT);
      const snap = resolveBookingCommissions({
        tenantId: "t", workspacePlan: "free", offerLineItems: LINE, currencyCode: "MXN", paymentMethod: "card",
        sellerOfRecord: "talent", orderBackedCollect: true, processingFeePayer: "seller", processorFeeRates: MX,
        platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {}, processing_mode: "pass_through", pass_through_take_bps: 150 },
        tenantOverride: null,
      });
      assert.equal(collectCents, 101_500);
      assert.equal(snap.gross_charged_cents, collectCents);
    } finally {
      if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
      else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
    }
  });
});

describe("snapshot shape rules (order-backed included mode, and the legacy flow)", () => {
  it("included mode, order-backed: a workspace base reservation fee is not assumed either", () => {
    const snap = resolveBookingCommissions({
      tenantId: "t", workspacePlan: "free", offerLineItems: [{ line_total_cents: 100_000, talent_cost_total_cents: 80_000 }], currencyCode: "MXN", paymentMethod: "card",
      sellerOfRecord: "workspace", orderBackedCollect: true,
      platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {} },
      tenantOverride: { platform_take_bps: null, platform_take_floor_cents: null, base_reservation_fee_cents: 5_000, base_reservation_fee_bps: 0 },
    });
    assert.equal(snap.gross_charged_cents, 100_000);
  });

  it("included mode, order-backed, with a take floor: the floor lands on the seller, never on the client", () => {
    const snap = resolveBookingCommissions({
      tenantId: "t", workspacePlan: "free", offerLineItems: LINE, currencyCode: "MXN", paymentMethod: "card",
      sellerOfRecord: "talent", orderBackedCollect: true,
      platformConfig: { default_take_bps: 100, default_take_floor_cents: 5_000, plan_tier_bps: {} },
      tenantOverride: null,
    });
    assert.equal(snap.gross_charged_cents, 100_000);
    assert.equal(snap.talent_net_cents, 95_000);
  });

  it("not order-backed (the legacy booking flow) keeps the client surcharge", () => {
    const snap = resolveBookingCommissions({
      tenantId: "t", workspacePlan: "free", offerLineItems: LINE, currencyCode: "MXN", paymentMethod: "card",
      sellerOfRecord: "talent",
      platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {} },
      tenantOverride: null,
    });
    assert.equal(snap.gross_charged_cents, 103_000);
  });
});

describe("persistBookingCommissionSnapshot refuses to guess when the order read fails", () => {
  it("a failed agency_bookings read returns ok:false, never the legacy surcharge shape", async () => {
    const { persistBookingCommissionSnapshot } = await import("./commission-engine");
    const ctx = { booking_id: "b", home_tenant_id: "t", offer_id: null, currency_code: "MXN", platform_config: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {} }, participants: [{ participant_id: "p", talent_profile_id: "t1", owning_party_type: "talent", owning_party_id: "t1", tenant_id: null, workspace_plan: null, tenant_override: null, offer_line_items: [{ units: 1, line_total_cents: 100_000, talent_cost_total_cents: 100_000 }] }] };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: "boom" } }) };
    const sb = { rpc: async () => ({ data: ctx, error: null }), from: () => q } as never;
    const res = await persistBookingCommissionSnapshot(sb, "b");
    assert.equal(res.ok, false);
  });
});
