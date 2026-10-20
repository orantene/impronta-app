/**
 * pass_through collect — what Checkout charges for a purchase.
 *
 * Pins the A5.2 bug: client-pays on a $100 USD booking must collect ~10484¢,
 * not the bare 10000¢ subtotal.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  passThroughCollectCents,
  purchaseSellerForCollect,
  resolvePassThroughCollect,
  resolvePassThroughCollectCents,
  sellerOfRecordFromOwningParty,
} from "./purchase-pass-through-collect";
import type { ProcessorFeeRates } from "@/lib/billing/commission";
import { FeeUnavailableError } from "@/lib/billing/pass-through-arming";

const US: ProcessorFeeRates = { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 };
const MX: ProcessorFeeRates = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };

describe("passThroughCollectCents — worked examples", () => {
  it("USD seller-pays: $100 → client pays $101.50", () => {
    assert.equal(
      passThroughCollectCents({
        baseCollectCents: 10_000,
        currencyCode: "USD",
        sellerOfRecord: "talent",
        talentCostCents: 10_000,
        processingFeePayer: "seller",
        passThroughTakeBps: 150,
        processorFeeRates: US,
      }),
      10_150,
    );
  });

  it("USD client-pays: $100 → client pays ~$104.84 (A5.2)", () => {
    assert.equal(
      passThroughCollectCents({
        baseCollectCents: 10_000,
        currencyCode: "USD",
        sellerOfRecord: "talent",
        talentCostCents: 10_000,
        processingFeePayer: "client",
        passThroughTakeBps: 150,
        processorFeeRates: US,
      }),
      10_484,
    );
  });

  it("MXN client-pays: 1,000 → 1,062.87", () => {
    assert.equal(
      passThroughCollectCents({
        baseCollectCents: 100_000,
        currencyCode: "MXN",
        sellerOfRecord: "talent",
        talentCostCents: 100_000,
        processingFeePayer: "client",
        passThroughTakeBps: 150,
        processorFeeRates: MX,
      }),
      106_287,
    );
  });

  it("zero / negative base stays non-charging", () => {
    assert.equal(
      passThroughCollectCents({
        baseCollectCents: 0,
        currencyCode: "USD",
        sellerOfRecord: "talent",
        talentCostCents: 0,
        processingFeePayer: "client",
        passThroughTakeBps: 150,
        processorFeeRates: US,
      }),
      0,
    );
  });
});

describe("sellerOfRecordFromOwningParty", () => {
  it("maps talent → talent seller", () => {
    assert.deepEqual(sellerOfRecordFromOwningParty({ type: "talent", id: "tal-1" }), {
      sellerOfRecord: "talent",
      partyId: "tal-1",
    });
  });

  it("maps agency/workspace → workspace fee-payer lane", () => {
    assert.deepEqual(sellerOfRecordFromOwningParty({ type: "agency", id: "ag-1" }), {
      sellerOfRecord: "workspace",
      partyId: "ag-1",
    });
    assert.deepEqual(sellerOfRecordFromOwningParty({ type: "workspace", id: "ws-1" }), {
      sellerOfRecord: "workspace",
      partyId: "ws-1",
    });
  });
});

describe("purchaseSellerForCollect (sync legacy helper)", () => {
  it("prefers the talent line for instant-book", () => {
    const s = purchaseSellerForCollect(
      [
        {
          talentProfileId: "tal-1",
          ownerTenantId: null,
          talentCostCents: 10_000,
          totalCents: 10_000,
        },
      ],
      10_000,
      10_000,
    );
    assert.deepEqual(s, {
      sellerOfRecord: "talent",
      partyId: "tal-1",
      baseCollectCents: 10_000,
      talentCostCents: 10_000,
    });
  });

  it("scales talent cost for a deposit collect", () => {
    const s = purchaseSellerForCollect(
      [
        {
          talentProfileId: "tal-1",
          ownerTenantId: null,
          talentCostCents: 10_000,
          totalCents: 10_000,
        },
      ],
      5_000,
      10_000,
    );
    assert.equal(s?.talentCostCents, 5_000);
    assert.equal(s?.baseCollectCents, 5_000);
  });

  it("falls back to workspace owner when there is no talent line", () => {
    const s = purchaseSellerForCollect(
      [
        {
          talentProfileId: null,
          ownerTenantId: "ws-1",
          talentCostCents: 0,
          totalCents: 2_000,
        },
      ],
      2_000,
      2_000,
    );
    assert.deepEqual(s, {
      sellerOfRecord: "workspace",
      partyId: "ws-1",
      baseCollectCents: 2_000,
      talentCostCents: 0,
    });
  });
});

describe("resolvePassThroughCollectCents — env / RPC gate", () => {
  const sellers = [
    {
      sellerOfRecord: "talent" as const,
      partyId: "tal-1",
      baseCollectCents: 10_000,
      talentCostCents: 10_000,
    },
  ];

  async function withEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
    const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    if (value === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    else process.env.COMMISSION_PROCESSING_PASS_THROUGH = value;
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
      else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
    }
  }

  it("returns the bare collect when the kill switch is on (env '0')", async () => {
    await withEnv("0", async () => {
      const admin = {
        rpc: async () => {
          throw new Error("must not call RPC when env is off");
        },
      };
      assert.equal(
        await resolvePassThroughCollectCents(admin, {
          baseCollectCents: 10_000,
          currencyCode: "USD",
          sellers,
        }),
        10_000,
      );
    });
  });

  const modeRow = (extra: Record<string, unknown> = {}) => ({
    processing_mode: "pass_through",
    pass_through_take_bps: 150,
    processor_fee_rates: { default: US, usd: US },
    plan_service_fee_bps: {},
    ...extra,
  });
  const rpcFor = (row: unknown) => async (fn: string) =>
    fn === "engine_platform_processing_mode" ? { data: row, error: null } : { data: "seller", error: null };

  it("TUL-1366: ON by default once the settings row carries the migration marker: $100 gets the 1.5% customer fee", async () => {
    await withEnv(undefined, async () => {
      const admin = { rpc: rpcFor(modeRow()) };
      assert.equal(
        await resolvePassThroughCollectCents(admin, { baseCollectCents: 10_000, currencyCode: "USD", sellers }),
        10_150,
      );
    });
  });

  it("TUL-1366: the fee of the seller's CURRENT plan drives the charge and is returned for the order snapshot", async () => {
    const wsSellers = [{ sellerOfRecord: "workspace" as const, partyId: "ws-1", baseCollectCents: 10_000, talentCostCents: 6_000 }];
    const fromFor = (plan: string | null) => () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { plan_tier: plan }, error: null }) };
      return q;
    };
    await withEnv(undefined, async () => {
      // No plan fee configured: the platform rate (1.5%).
      const base = await resolvePassThroughCollect({ rpc: rpcFor(modeRow()) }, { baseCollectCents: 10_000, currencyCode: "USD", sellers: wsSellers });
      assert.equal(base.cents, 10_150);
      assert.deepEqual(base.feeBpsByParty, { "ws-1": 150 });
      // Agency plan set to 3% by Platform Admin.
      const plan = await resolvePassThroughCollect(
        { rpc: rpcFor(modeRow({ plan_service_fee_bps: { agency: 300, studio: 200 } })), from: fromFor("agency") as never },
        { baseCollectCents: 10_000, currencyCode: "USD", sellers: wsSellers },
      );
      assert.equal(plan.cents, 10_300);
      assert.deepEqual(plan.feeBpsByParty, { "ws-1": 300 });
      // An out-of-range value in the map is ignored, never applied.
      const bad = await resolvePassThroughCollect(
        { rpc: rpcFor(modeRow({ plan_service_fee_bps: { agency: 99_999 } })), from: fromFor("agency") as never },
        { baseCollectCents: 10_000, currencyCode: "USD", sellers: wsSellers },
      );
      assert.equal(bad.cents, 10_150);
    });
  });

  it("TUL-1366: an order that carries its frozen fee ignores a later plan change", async () => {
    const wsSellers = [{ sellerOfRecord: "workspace" as const, partyId: "ws-1", baseCollectCents: 10_000, talentCostCents: 6_000 }];
    const from = () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { plan_tier: "agency" }, error: null }) };
      return q;
    };
    await withEnv(undefined, async () => {
      const r = await resolvePassThroughCollect(
        { rpc: rpcFor(modeRow({ plan_service_fee_bps: { agency: 500 } })), from: from as never },
        { baseCollectCents: 10_000, currencyCode: "USD", sellers: wsSellers, frozenByParty: { "ws-1": 150 } },
      );
      assert.equal(r.cents, 10_150, "quoted at 1.5%, plan since raised to 5%: still 1.5%");
      assert.deepEqual(r.feeBpsByParty, { "ws-1": 150 });
    });
  });

  it("client-pays + pass_through → ~10484", async () => {
    await withEnv("1", async () => {
      const admin = {
        rpc: async (fn: string) => {
          if (fn === "engine_platform_processing_mode") {
            return {
              data: {
                processing_mode: "pass_through",
                pass_through_take_bps: 150,
                processor_fee_rates: { default: US, usd: US },
              },
              error: null,
            };
          }
          if (fn === "engine_processing_fee_payer") {
            return { data: "client", error: null };
          }
          throw new Error(`unexpected rpc ${fn}`);
        },
      };
      assert.equal(
        await resolvePassThroughCollectCents(admin, {
          baseCollectCents: 10_000,
          currencyCode: "USD",
          sellers,
        }),
        10_484,
      );
    });
  });

  it("TUL-1366 FAILS CLOSED on a mode RPC error / throw: the checkout is refused, never a bare collect", async () => {
    await withEnv("1", async () => {
      for (const rpc of [
        async () => ({ data: null, error: { message: "boom" } }),
        async () => {
          throw new Error("down");
        },
      ]) {
        await assert.rejects(
          resolvePassThroughCollectCents({ rpc }, { baseCollectCents: 10_000, currencyCode: "USD", sellers }),
          FeeUnavailableError,
        );
      }
    });
  });

  it("TUL-1366: armed with a missing platform rate, missing card rates, or no seller is refused (no 150, no silent 0)", async () => {
    await withEnv("1", async () => {
      await assert.rejects(
        resolvePassThroughCollectCents({ rpc: rpcFor(modeRow({ pass_through_take_bps: null })) }, { baseCollectCents: 10_000, currencyCode: "USD", sellers }),
        FeeUnavailableError,
      );
      await assert.rejects(
        resolvePassThroughCollectCents({ rpc: rpcFor(modeRow({ processor_fee_rates: {} })) }, { baseCollectCents: 10_000, currencyCode: "EUR", sellers }),
        FeeUnavailableError,
      );
      await assert.rejects(
        resolvePassThroughCollectCents({ rpc: rpcFor(modeRow()) }, { baseCollectCents: 10_000, currencyCode: "USD", sellers: [] }),
        FeeUnavailableError,
      );
    });
  });

  it("TUL-1366: no settings row / 'included' row / unmigrated unarmed env: bare collect, nothing written", async () => {
    await withEnv(undefined, async () => {
      for (const data of [null, { processing_mode: "included", pass_through_take_bps: 150 }, { processing_mode: "pass_through", pass_through_take_bps: 150 }]) {
        const r = await resolvePassThroughCollect({ rpc: async () => ({ data, error: null }) }, { baseCollectCents: 10_000, currencyCode: "USD", sellers });
        assert.deepEqual(r, { cents: 10_000, feeBpsByParty: {}, armed: false });
      }
    });
  });

  it("TUL-1366: whenever the fee is on, the per-seller snapshot is returned (always written)", async () => {
    await withEnv("1", async () => {
      const r = await resolvePassThroughCollect({ rpc: rpcFor(modeRow()) }, { baseCollectCents: 10_000, currencyCode: "USD", sellers });
      assert.equal(r.armed, true);
      assert.deepEqual(r.feeBpsByParty, { "tal-1": 150 });
    });
  });

  it("payer RPC fail: default seller and keep pass-through surcharge (P2)", async () => {
    await withEnv("1", async () => {
      const admin = {
        rpc: async (fn: string) => {
          if (fn === "engine_platform_processing_mode") {
            return {
              data: {
                processing_mode: "pass_through",
                pass_through_take_bps: 150,
                processor_fee_rates: { default: US, usd: US },
              },
              error: null,
            };
          }
          if (fn === "engine_processing_fee_payer") {
            return { data: null, error: { message: "payer boom" } };
          }
          throw new Error(`unexpected rpc ${fn}`);
        },
      };
      // seller-pays pass_through on $100 → $101.50 (not bare $100)
      assert.equal(
        await resolvePassThroughCollectCents(admin, {
          baseCollectCents: 10_000,
          currencyCode: "USD",
          sellers,
        }),
        10_150,
      );
    });
  });
});
