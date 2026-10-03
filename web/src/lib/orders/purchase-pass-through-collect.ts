/**
 * Bake pass_through fees into what Checkout collects for a purchase.
 *
 * Instant-book / `createPurchase` used to charge the bare catalog subtotal
 * (`amountToCollectCents`). In `processing_mode = 'pass_through'` that under-
 * charges: the client must pay subtotal + platform surcharge (default 1.5%),
 * and when the seller picks `processing_fee_payer = 'client'` the card fee is
 * grossed up on top (~$104.84 on a $100 USD booking).
 *
 * PURE math lives in {@link passThroughCollectCents}. The async loader reads
 * the same platform RPC + fee-payer seam the commission engine uses, gated on
 * `COMMISSION_PROCESSING_PASS_THROUGH=1` so included-mode call sequences stay
 * untouched when the env is unset.
 */

import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  resolveBookingCommissions,
  type ProcessingFeePayer,
  type ProcessorFeeRates,
  type SellerOfRecord,
} from "@/lib/billing/commission";
import { logServerError } from "@/lib/server/safe-error";

/** Minimal RPC surface — avoids coupling tests to the full Supabase client type. */
export type PassThroughCollectRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
};

export type PassThroughCollectInput = {
  /** What `amountToCollectCents` already decided (deposit or full subtotal). */
  baseCollectCents: number;
  currencyCode: string;
  sellerOfRecord: SellerOfRecord;
  /**
   * Talent cost for the amount being collected. Independent talent: equals
   * `baseCollectCents`. Workspace seller: the talent's quote share of this
   * charge (never above the collect amount).
   */
  talentCostCents: number;
  processingFeePayer: ProcessingFeePayer;
  passThroughTakeBps: number;
  processorFeeRates: ProcessorFeeRates;
};

/**
 * What Checkout must charge for this card collection in pass_through mode.
 * PURE. Returns `baseCollectCents` unchanged when the base is not positive.
 */
export function passThroughCollectCents(input: PassThroughCollectInput): number {
  const base = input.baseCollectCents;
  if (!Number.isInteger(base) || base <= 0) return Math.max(0, base || 0);

  const talentCost = Math.min(
    Math.max(0, Math.round(input.talentCostCents)),
    base,
  );

  const snap = resolveBookingCommissions({
    tenantId: "purchase-collect",
    workspacePlan: "free",
    offerLineItems: [
      {
        line_total_cents: base,
        talent_cost_total_cents: talentCost,
      },
    ],
    currencyCode: input.currencyCode,
    paymentMethod: "card",
    sellerOfRecord: input.sellerOfRecord,
    platformConfig: {
      default_take_bps: 600,
      default_take_floor_cents: 0,
      plan_tier_bps: {},
      processing_mode: "pass_through",
      pass_through_take_bps: input.passThroughTakeBps,
    },
    tenantOverride: null,
    processingFeePayer: input.processingFeePayer,
    processorFeeRates: input.processorFeeRates,
  });

  return snap.gross_charged_cents;
}

export type PurchaseSellerForCollect = {
  sellerOfRecord: SellerOfRecord;
  /** Party id for `engine_processing_fee_payer`. */
  partyId: string;
  /**
   * Talent cost attributed to the amount being collected. Independent talent
   * sales use the full collect; workspace sales use the line talent costs.
   */
  talentCostCents: number;
};

/**
 * Pick the payee that owns this purchase's fee-payer setting. Prefer the first
 * talent line (instant-book); fall back to a house/workspace owner.
 */
export function purchaseSellerForCollect(
  lines: readonly {
    talentProfileId: string | null;
    ownerTenantId: string | null;
    talentCostCents: number;
    totalCents: number;
  }[],
  baseCollectCents: number,
  subtotalCents: number,
): PurchaseSellerForCollect | null {
  const talentLine = lines.find((l) => l.talentProfileId);
  if (talentLine?.talentProfileId) {
    const scale =
      subtotalCents > 0 ? Math.min(1, baseCollectCents / subtotalCents) : 1;
    // Scale the line's talent cost to the fraction being collected (a deposit
    // of half the subtotal carries half the talent cost). Never use
    // baseCollect × scale — that double-applies the fraction.
    return {
      sellerOfRecord: "talent",
      partyId: talentLine.talentProfileId,
      talentCostCents: Math.round((talentLine.talentCostCents || 0) * scale),
    };
  }
  const house = lines.find((l) => l.ownerTenantId);
  if (house?.ownerTenantId) {
    const talentCost = lines.reduce((s, l) => s + (l.talentCostCents || 0), 0);
    const scale =
      subtotalCents > 0 ? Math.min(1, baseCollectCents / subtotalCents) : 1;
    return {
      sellerOfRecord: "workspace",
      partyId: house.ownerTenantId,
      talentCostCents: Math.round(talentCost * scale),
    };
  }
  return null;
}

type ProcessingModeRow = {
  processing_mode?: string | null;
  pass_through_take_bps?: number | null;
  processor_fee_rates?: Record<string, ProcessorFeeRates> | null;
};

/**
 * Inflate `baseCollectCents` with pass_through fees when armed. Fail-soft:
 * any miss returns the bare collect so a settings/RPC fault never blocks a
 * sale that used to work (mirrors the commission engine's included fallback).
 */
export async function resolvePassThroughCollectCents(
  admin: PassThroughCollectRpc,
  input: {
    baseCollectCents: number;
    currencyCode: string;
    seller: PurchaseSellerForCollect | null;
  },
): Promise<number> {
  const base = input.baseCollectCents;
  if (!(base > 0) || !input.seller) return base;
  if (process.env.COMMISSION_PROCESSING_PASS_THROUGH !== "1") return base;

  try {
    const modeRes = (await admin.rpc("engine_platform_processing_mode")) as {
      data: ProcessingModeRow | null;
      error?: { message?: string } | null;
    };

    if (modeRes.error) {
      logServerError("orders.passThroughCollect/mode", modeRes.error);
      return base;
    }
    if (modeRes.data?.processing_mode !== "pass_through") return base;

    const ratesTable = modeRes.data.processor_fee_rates ?? null;
    const currencyKey = String(input.currencyCode ?? "").toLowerCase();
    const processorFeeRates =
      ratesTable?.[currencyKey] ?? ratesTable?.default ?? null;
    if (!processorFeeRates) {
      logServerError(
        "orders.passThroughCollect/rates",
        `no processor_fee_rates for ${currencyKey}`,
      );
      return base;
    }

    const partyType = input.seller.sellerOfRecord === "talent" ? "talent" : "workspace";
    const payerRes = (await admin.rpc("engine_processing_fee_payer", {
      p_party_type: partyType,
      p_party_id: input.seller.partyId,
    })) as { data: string | null; error?: { message?: string } | null };

    if (payerRes.error) {
      logServerError("orders.passThroughCollect/payer", payerRes.error);
      return base;
    }
    const processingFeePayer: ProcessingFeePayer =
      payerRes.data === "client" ? "client" : "seller";

    return passThroughCollectCents({
      baseCollectCents: base,
      currencyCode: input.currencyCode,
      sellerOfRecord: input.seller.sellerOfRecord,
      talentCostCents: input.seller.talentCostCents,
      processingFeePayer,
      passThroughTakeBps:
        typeof modeRes.data.pass_through_take_bps === "number"
          ? modeRes.data.pass_through_take_bps
          : PASS_THROUGH_DEFAULT_TAKE_BPS,
      processorFeeRates,
    });
  } catch (err) {
    logServerError("orders.passThroughCollect", err);
    return base;
  }
}
