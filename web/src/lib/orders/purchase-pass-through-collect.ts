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
 *
 * Payees are resolved through {@link resolveOwningPartyForTalent} — a line's
 * `talentProfileId` is not assumed to be an independent seller (rostered /
 * exclusive owners are workspace/agency). Multi-line baskets inflate each
 * payee's share separately so Checkout matches frozen payout lanes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveBookingCommissions,
  type ProcessingFeePayer,
  type ProcessorFeeRates,
  type SellerOfRecord,
} from "@/lib/billing/commission";
import {
  processorFeeRatesFromTable,
  readPlatformProcessingMode,
  resolvePassThroughTakeBps,
} from "@/lib/billing/platform-processing-mode";
import {
  moneyOwningParty,
  resolveOwningPartyForTalent,
  type OwningParty,
} from "@/lib/inquiry/owning-party-resolver";
import { logServerError } from "@/lib/server/safe-error";

/** Minimal RPC surface — avoids coupling tests to the full Supabase client type. */
export type PassThroughCollectRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
};

export type PassThroughCollectAdmin = PassThroughCollectRpc &
  Pick<SupabaseClient, "from">;

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
 * What Checkout collects, split the way the client reads it: the charge, and
 * the two fee lines inside it (`chargeCents = base + serviceFeeCents +
 * processingFeeCents`). The fee lines are the resolver's own
 * `client_surcharge_cents` and `client_processing_fee_cents`, never re-derived.
 */
export type PassThroughCollectBreakdown = {
  chargeCents: number;
  /** The platform service fee (pass_through surcharge). */
  serviceFeeCents: number;
  /** The card fee, when the seller chose that the client pays it; else 0. */
  processingFeeCents: number;
};

/** No fees: the bare collect. */
function bareCollect(base: number): PassThroughCollectBreakdown {
  return { chargeCents: base, serviceFeeCents: 0, processingFeeCents: 0 };
}

/**
 * True when the code side of the two-key pass_through arming is on (the other
 * key is `processing_mode` in the platform row). Same env the commission
 * engine reads.
 */
export function passThroughCollectArmed(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMMISSION_PROCESSING_PASS_THROUGH === "1";
}

/**
 * What Checkout must charge for this card collection in pass_through mode.
 * PURE. Returns `baseCollectCents` unchanged when the base is not positive.
 */
export function passThroughCollectCents(input: PassThroughCollectInput): number {
  return passThroughCollectBreakdown(input).chargeCents;
}

/** {@link passThroughCollectCents} with its fee lines. PURE. */
export function passThroughCollectBreakdown(input: PassThroughCollectInput): PassThroughCollectBreakdown {
  const base = input.baseCollectCents;
  if (!Number.isInteger(base) || base <= 0) return bareCollect(Math.max(0, base || 0));

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

  return {
    chargeCents: snap.gross_charged_cents,
    serviceFeeCents: snap.client_surcharge_cents,
    processingFeeCents: snap.client_processing_fee_cents ?? 0,
  };
}

export type PurchaseSellerForCollect = {
  sellerOfRecord: SellerOfRecord;
  /** Party id for `engine_processing_fee_payer`. */
  partyId: string;
  /**
   * This payee's share of the principal being collected (deposit or full).
   */
  baseCollectCents: number;
  /**
   * Talent cost attributed to that principal share.
   */
  talentCostCents: number;
};

export type PurchaseLineForCollect = {
  talentProfileId: string | null;
  ownerTenantId: string | null;
  talentCostCents: number;
  totalCents: number;
};

/** Map a frozen owning party onto the commission seller-of-record shape. */
export function sellerOfRecordFromOwningParty(
  owning: OwningParty,
): { sellerOfRecord: SellerOfRecord; partyId: string } {
  if (owning.type === "talent") {
    return { sellerOfRecord: "talent", partyId: owning.id };
  }
  // Agency and workspace both use the workspace fee-payer RPC lane.
  return { sellerOfRecord: "workspace", partyId: owning.id };
}

/**
 * Resolve every payee via `resolveOwningPartyForTalent` before fee-payer
 * settings. A `talentProfileId` on a line is not assumed independent — rostered
 * / exclusive owners become workspace sellers. Multi-line baskets return one
 * entry per line share so each owner's preference can inflate its portion.
 */
export async function resolvePurchaseSellersForCollect(
  admin: Pick<SupabaseClient, "from">,
  lines: readonly PurchaseLineForCollect[],
  baseCollectCents: number,
  subtotalCents: number,
  tenantId: string,
): Promise<PurchaseSellerForCollect[]> {
  if (!(baseCollectCents > 0) || lines.length === 0) return [];

  const scale =
    subtotalCents > 0 ? Math.min(1, baseCollectCents / subtotalCents) : 1;

  const out: PurchaseSellerForCollect[] = [];
  for (const line of lines) {
    const linePrincipal = Math.round((line.totalCents || 0) * scale);
    if (linePrincipal <= 0 && (line.talentCostCents || 0) <= 0) continue;

    if (line.talentProfileId) {
      const resolved =
        (await resolveOwningPartyForTalent(
          admin as SupabaseClient,
          line.talentProfileId,
          tenantId,
        )) ?? { type: "workspace" as const, id: tenantId };
      // Talent = merchant: the talent's own workspace sells as the talent, the
      // same mapping the commission snapshot applies, so charge and snapshot agree.
      const owning = await moneyOwningParty(admin as SupabaseClient, resolved, line.talentProfileId);
      const mapped = sellerOfRecordFromOwningParty(owning);
      out.push({
        ...mapped,
        baseCollectCents: linePrincipal,
        talentCostCents: Math.round((line.talentCostCents || 0) * scale),
      });
      continue;
    }

    if (line.ownerTenantId) {
      out.push({
        sellerOfRecord: "workspace",
        partyId: line.ownerTenantId,
        baseCollectCents: linePrincipal,
        talentCostCents: Math.round((line.talentCostCents || 0) * scale),
      });
    }
  }

  // Rounding drift: ensure principals sum to baseCollectCents when we scaled
  // from a positive subtotal.
  if (out.length > 0 && subtotalCents > 0) {
    const sum = out.reduce((s, p) => s + p.baseCollectCents, 0);
    const drift = baseCollectCents - sum;
    if (drift !== 0) {
      out[out.length - 1] = {
        ...out[out.length - 1],
        baseCollectCents: Math.max(0, out[out.length - 1].baseCollectCents + drift),
      };
    }
  }

  return out;
}

/**
 * @deprecated Prefer {@link resolvePurchaseSellersForCollect}. Sync helper kept
 * for pure unit tests that already know the seller is independent talent or a
 * house owner — does NOT resolve roster ownership.
 */
export function purchaseSellerForCollect(
  lines: readonly PurchaseLineForCollect[],
  baseCollectCents: number,
  subtotalCents: number,
): PurchaseSellerForCollect | null {
  const talentLine = lines.find((l) => l.talentProfileId);
  if (talentLine?.talentProfileId) {
    const scale =
      subtotalCents > 0 ? Math.min(1, baseCollectCents / subtotalCents) : 1;
    return {
      sellerOfRecord: "talent",
      partyId: talentLine.talentProfileId,
      baseCollectCents,
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
      baseCollectCents,
      talentCostCents: Math.round(talentCost * scale),
    };
  }
  return null;
}

async function inflateOnePayee(
  admin: PassThroughCollectRpc,
  input: {
    payee: PurchaseSellerForCollect;
    currencyCode: string;
    passThroughTakeBps: number;
    processorFeeRates: ProcessorFeeRates;
  },
): Promise<PassThroughCollectBreakdown> {
  const base = input.payee.baseCollectCents;
  if (!(base > 0)) return bareCollect(0);

  const partyType = input.payee.sellerOfRecord === "talent" ? "talent" : "workspace";
  let processingFeePayer: ProcessingFeePayer = "seller";
  const payerRes = (await admin.rpc("engine_processing_fee_payer", {
    p_party_type: partyType,
    p_party_id: input.payee.partyId,
  })) as { data: string | null; error?: { message?: string } | null };

  if (payerRes.error) {
    // Mirror commission-engine: miss/error leaves default 'seller' while still
    // applying the pass-through client surcharge. Returning bare collect here
    // under-charges vs the frozen snapshot.
    logServerError("orders.passThroughCollect/payer", payerRes.error);
  } else if (payerRes.data === "client") {
    processingFeePayer = "client";
  }

  return passThroughCollectBreakdown({
    baseCollectCents: base,
    currencyCode: input.currencyCode,
    sellerOfRecord: input.payee.sellerOfRecord,
    talentCostCents: input.payee.talentCostCents,
    processingFeePayer,
    passThroughTakeBps: input.passThroughTakeBps,
    processorFeeRates: input.processorFeeRates,
  });
}

/**
 * Inflate `baseCollectCents` with pass_through fees when armed. Fail-soft on
 * mode/rates faults (return bare collect). Fee-payer RPC faults default to
 * seller and keep the surcharge — matching the commission engine.
 */
export async function resolvePassThroughCollectCents(
  admin: PassThroughCollectRpc,
  input: {
    baseCollectCents: number;
    currencyCode: string;
    /** Resolved payees (one or more). Empty → bare collect. */
    sellers: readonly PurchaseSellerForCollect[];
  },
): Promise<number> {
  return (await resolvePassThroughCollectBreakdown(admin, input)).chargeCents;
}

/** {@link resolvePassThroughCollectCents} with its fee lines (summed over payees). */
export async function resolvePassThroughCollectBreakdown(
  admin: PassThroughCollectRpc,
  input: {
    baseCollectCents: number;
    currencyCode: string;
    sellers: readonly PurchaseSellerForCollect[];
  },
): Promise<PassThroughCollectBreakdown> {
  const base = input.baseCollectCents;
  if (!(base > 0) || input.sellers.length === 0) return bareCollect(base);
  if (!passThroughCollectArmed()) return bareCollect(base);

  try {
    const modeRow = await readPlatformProcessingMode(admin);
    if (!modeRow) {
      logServerError("orders.passThroughCollect/mode", "engine_platform_processing_mode empty");
      return bareCollect(base);
    }
    if (modeRow.processing_mode !== "pass_through") return bareCollect(base);

    const processorFeeRates = processorFeeRatesFromTable(
      modeRow.processor_fee_rates,
      input.currencyCode,
    );
    if (!processorFeeRates) {
      logServerError(
        "orders.passThroughCollect/rates",
        `no processor_fee_rates for ${String(input.currencyCode ?? "").toLowerCase()}`,
      );
      return bareCollect(base);
    }

    const passThroughTakeBps = resolvePassThroughTakeBps(modeRow);

    const total = bareCollect(0);
    for (const payee of input.sellers) {
      const one = await inflateOnePayee(admin, {
        payee,
        currencyCode: input.currencyCode,
        passThroughTakeBps,
        processorFeeRates,
      });
      total.chargeCents += one.chargeCents;
      total.serviceFeeCents += one.serviceFeeCents;
      total.processingFeeCents += one.processingFeeCents;
    }
    return total.chargeCents > 0 ? total : bareCollect(base);
  } catch (err) {
    logServerError("orders.passThroughCollect", err);
    return bareCollect(base);
  }
}
