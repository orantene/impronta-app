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
  resolvePassThroughCollectCents,
  sellerOfRecordFromOwningParty,
} from "./purchase-pass-through-collect";
import type { ProcessorFeeRates } from "@/lib/billing/commission";

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

  it("returns the bare collect when the env arm is off", async () => {
    await withEnv(undefined, async () => {
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

  it("fail-soft on mode RPC error: returns bare collect", async () => {
    await withEnv("1", async () => {
      const admin = {
        rpc: async () => ({ data: null, error: { message: "boom" } }),
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
