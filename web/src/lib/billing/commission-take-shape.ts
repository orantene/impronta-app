/**
 * Two pieces of `resolveBookingCommissions`, kept here so commission.ts stays under
 * the file-size cap. Pure; no behaviour of their own beyond what the resolver had.
 */
import type { PlatformCommissionConfig, WorkspaceCommissionOverride } from "./commission";

/**
 * The workspace's base reservation fee: a flat + % amount added on top of the client
 * total, clamped to the platform caps. Workspace seller only; an order-backed
 * checkout never collects it, so the snapshot must not assume it.
 */
export function baseReservationFee(input: {
  sellerOfRecord: "talent" | "workspace";
  orderBackedCollect?: boolean;
  tenantOverride: WorkspaceCommissionOverride | null | undefined;
  platformConfig: Pick<PlatformCommissionConfig, "max_base_fee_cents" | "max_base_fee_bps">;
  subtotalCents: number;
}): number {
  const { tenantOverride, platformConfig, subtotalCents } = input;
  if (input.sellerOfRecord === "talent" || !tenantOverride || input.orderBackedCollect) return 0;
  const flat = Math.max(0, Math.round(tenantOverride.base_reservation_fee_cents ?? 0));
  const pctBps = Math.max(0, Math.round(tenantOverride.base_reservation_fee_bps ?? 0));
  const pct = Math.round((subtotalCents * pctBps) / 10000);
  const maxFlat = platformConfig.max_base_fee_cents;
  const maxBps = platformConfig.max_base_fee_bps;
  const cappedFlat = maxFlat != null ? Math.min(flat, Math.max(0, maxFlat)) : flat;
  const cappedPct = maxBps != null ? Math.min(pct, Math.round((subtotalCents * Math.max(0, maxBps)) / 10000)) : pct;
  return cappedFlat + cappedPct;
}

/**
 * Top the platform take up to its floor. Normally the gap goes on the client
 * surcharge. An order-backed checkout in included mode charges no client surcharge,
 * so the gap lands on the seller side instead (a workspace only up to its margin; the
 * rest is a shortfall the platform absorbs).
 */
export function floorTopUp(input: {
  gap: number;
  orderBackedIncluded: boolean;
  sellerOfRecord: "talent" | "workspace";
  marginCents: number;
  sellerDeductionCents: number;
}): { clientSurchargeAdd: number; sellerDeductionAdd: number; sellerShortfallAdd: number } {
  if (!input.orderBackedIncluded) return { clientSurchargeAdd: input.gap, sellerDeductionAdd: 0, sellerShortfallAdd: 0 };
  const room = input.sellerOfRecord === "talent" ? input.gap : Math.max(Math.max(input.marginCents, 0) - input.sellerDeductionCents, 0);
  const add = Math.min(input.gap, room);
  return { clientSurchargeAdd: 0, sellerDeductionAdd: add, sellerShortfallAdd: input.gap - add };
}

/**
 * Split the platform take into the client's surcharge and the seller's share.
 * Default is an even split of the resolved total, clamped to [0, total]. pass_through:
 * the whole take is a client surcharge. An order-backed checkout in included mode
 * charges the client no surcharge, so the whole take is the seller's.
 */
export function splitTake(input: {
  passThrough: boolean;
  orderBackedCollect?: boolean;
  platformTakeBps: number;
  clientSurchargeBps: number | null | undefined;
  subtotalCents: number;
}): { clientSurchargeBase: number; sellerTargetCents: number } {
  const { platformTakeBps, subtotalCents } = input;
  const raw = input.passThrough
    ? platformTakeBps
    : input.orderBackedCollect
      ? 0
      : input.clientSurchargeBps != null
        ? input.clientSurchargeBps
        : Math.floor(platformTakeBps / 2);
  const clientShareBps = Math.min(Math.max(Math.round(raw), 0), platformTakeBps);
  const sellerShareBps = Math.max(platformTakeBps - clientShareBps, 0);
  return {
    clientSurchargeBase: Math.round((subtotalCents * clientShareBps) / 10000),
    sellerTargetCents: Math.round((subtotalCents * sellerShareBps) / 10000),
  };
}
