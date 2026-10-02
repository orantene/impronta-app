/**
 * Pure processing-fee helpers for `processing_mode = 'pass_through'`
 * (re-exported from ./commission). No IO.
 */
import { CommissionResolutionError } from "./commission-errors";
import type { ProcessingMode, ProcessorFeeRates, SellerOfRecord } from "./commission";

/** The processor's fee for charging `grossCents`. PURE. */
export function estimateProcessorFeeCents(grossCents: number, rates: ProcessorFeeRates): number {
  const tax = rates.tax_on_fee ?? 0;
  return Math.round((rates.percent * grossCents + rates.fixed_cents) * (1 + tax));
}

/**
 * Smallest gross G such that  G − fee(G) >= targetNetCents.  PURE.
 * Closed form G = (T + fixed·(1+tax)) / (1 − percent·(1+tax)), then walked to
 * the exact integer boundary so the seller side is never short by rounding.
 */
export function grossUpForProcessorFee(targetNetCents: number, rates: ProcessorFeeRates): number {
  const tax = rates.tax_on_fee ?? 0;
  const k = rates.percent * (1 + tax);
  if (!(k >= 0) || k >= 1 || !Number.isFinite(rates.fixed_cents) || rates.fixed_cents < 0) {
    throw new CommissionResolutionError("processing_rates_missing");
  }
  let g = Math.max(Math.floor((targetNetCents + rates.fixed_cents * (1 + tax)) / (1 - k)) - 2, targetNetCents);
  while (g - estimateProcessorFeeCents(g, rates) < targetNetCents) g += 1;
  return g;
}

/**
 * The part of a booking's charge that is NOT refundable (owner decision
 * 2026-10-01: fees are non-refundable and nobody loses money on a refund).
 *   - payer 'client': the client paid the processing fee on top and the seller
 *     received 100% of the subtotal. Kept = platform fee + client processing
 *     line; a full refund returns the service subtotal.
 *   - payer 'seller' (default): the seller bore the ACTUAL processing fee, so a
 *     full refund returns the subtotal MINUS that fee (exactly what the seller
 *     received). Kept = platform fee + actual processing fee.
 *   - included mode (legacy): 0, refunds unchanged.
 * Returns `null` when a seller-pays snapshot has no actual fee recorded
 * (`processing_fee_cents` 0/absent): the caller must block, never guess. PURE.
 */
export function nonRefundableFeeCents(
  snaps: Array<{
    processing_mode?: ProcessingMode | null;
    processing_fee_payer?: "seller" | "client" | null;
    processing_fee_cents?: number | null;
    client_surcharge_cents?: number | null;
    client_processing_fee_cents?: number | null;
  }>,
): number | null {
  let sum = 0;
  for (const r of snaps) {
    if (r.processing_mode !== "pass_through") continue;
    sum += r.client_surcharge_cents ?? 0;
    if (r.processing_fee_payer === "client") {
      sum += r.client_processing_fee_cents ?? 0;
    } else {
      const actual = r.processing_fee_cents ?? 0;
      if (!(actual > 0)) return null;
      sum += actual;
    }
  }
  return sum;
}

/**
 * Pure merge: the ACTUAL processing fee is written to `booking_payouts.processing_fee_cents`
 * at payout time. The commission snapshot table has no such column, so refunds that only
 * read the snapshot see 0 and BLOCK every seller-pays refund. Attach fees by participant
 * before calling {@link nonRefundableFeeCents}. When a participant has several legs, sum
 * their fees. PURE.
 */
export function attachPayoutProcessingFees<T extends { participant_id: string; processing_fee_cents?: number | null }>(
  snaps: readonly T[],
  payoutLegs: readonly { participant_id: string; processing_fee_cents?: number | null }[],
): T[] {
  const feeByParticipant = new Map<string, number>();
  for (const leg of payoutLegs) {
    const fee = leg.processing_fee_cents;
    if (fee == null || !(fee > 0)) continue;
    feeByParticipant.set(leg.participant_id, (feeByParticipant.get(leg.participant_id) ?? 0) + fee);
  }
  if (feeByParticipant.size === 0) return snaps.map((s) => ({ ...s }));
  return snaps.map((s) => {
    const fromPayout = feeByParticipant.get(s.participant_id);
    if (fromPayout == null) return { ...s };
    return { ...s, processing_fee_cents: fromPayout };
  });
}

/**
 * Partial refund on the same base: `share` (0..1] of the refundable ceiling
 * (gross minus non-refundable fees), rounded down to the cent. PURE.
 */
export function proportionalRefundCents(refundableCents: number, share: number): number {
  if (!(share > 0) || !(refundableCents > 0)) return 0;
  return Math.floor(refundableCents * Math.min(share, 1));
}


/**
 * pass_through core: charge the ACTUAL processing fee to the seller lane.
 * PURE. Independent talent → talent_net drops by the fee (floored at 0);
 * workspace seller → workspace_fee drops (talent untouched). Whatever the lane
 * cannot cover is `shortfallCents`, absorbed by the platform_fee. Preserves
 *   talent + workspace + platform + referral + fee === gross_charged.
 * Shared by the resolver and the payout step (the fee is only known after the
 * charge settles, so transfers.ts applies it to the frozen provisional lanes).
 */
export function applyProcessingFeeToLanes(a: {
  sellerOfRecord: SellerOfRecord;
  talentNetCents: number;
  workspaceFeeCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
}): {
  talentNetCents: number;
  workspaceFeeCents: number;
  platformFeeCents: number;
  shortfallCents: number;
} {
  const fee = a.processingFeeCents;
  if (!Number.isInteger(fee) || fee < 0) {
    throw new CommissionResolutionError("negative_line_item");
  }
  let talentNetCents = a.talentNetCents;
  let workspaceFeeCents = a.workspaceFeeCents;
  let borne: number;
  if (a.sellerOfRecord === "talent") {
    borne = Math.min(fee, Math.max(talentNetCents, 0));
    talentNetCents -= borne;
  } else {
    borne = Math.min(fee, Math.max(workspaceFeeCents, 0));
    workspaceFeeCents -= borne;
  }
  const shortfallCents = fee - borne;
  return {
    talentNetCents,
    workspaceFeeCents,
    platformFeeCents: a.platformFeeCents - shortfallCents,
    shortfallCents,
  };
}
