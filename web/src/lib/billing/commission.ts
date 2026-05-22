/**
 * Tulala commission resolver — Phase B foundation.
 *
 * PURE function. No DB, no Stripe, no side effects. Takes inputs, returns
 * a snapshot. The caller (typically `convertInquiryToBooking` engine path
 * in Phase B PR 2) is responsible for loading the platform config + tenant
 * override and persisting the snapshot.
 *
 * Spec: `web/docs/commission-model-2026-05-13.md` §6.
 *
 * Mental model — three lanes:
 *   gross = platform_fee + workspace_fee + talent_net
 *
 *   platform_fee = max(gross × platform_take_bps / 10000, platform_take_floor_cents)
 *   workspace_fee = Σ over line items of (unit_price - talent_cost) × units
 *   talent_net = gross - platform_fee - workspace_fee
 *
 * Override hierarchy for the platform take (most-specific wins):
 *   1. tenant override (workspace_commission_overrides.platform_take_bps)
 *   2. plan-tier default (platform_commission_config.plan_tier_bps[plan])
 *   3. platform default (platform_commission_config.default_take_bps)
 */

export type WorkspacePlanTier = "free" | "studio" | "agency" | "network";

export type PaymentMethod =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "bank_transfer"
  | "cash"
  | "wire"
  | "venue_paid"
  | "crypto"
  | "other";

export type CommissionResolvedFrom =
  | "platform_default"
  | "plan_tier"
  | "tenant_override"
  | "booking_override";

/** Shape of one row in `inquiry_offer_line_items`, projected to the
 *  fields the resolver actually needs. */
export interface OfferLineItemForResolver {
  /** How many units of this line (hours, days, events). >= 1. */
  units: number;
  /** What the client pays per unit, in cents of the offer's presentment currency. */
  unit_price_cents: number;
  /** What the talent gets per unit (workspace margin = unit_price - talent_cost). */
  talent_cost_cents: number;
}

/** Subset of `platform_commission_config` the resolver reads. */
export interface PlatformCommissionConfig {
  default_take_bps: number;
  default_take_floor_cents: number;
  /** Map of plan-tier → bps override. Keys are workspace plan codes. */
  plan_tier_bps: Partial<Record<WorkspacePlanTier, number>>;
}

/** Subset of `workspace_commission_overrides` the resolver reads. */
export interface WorkspaceCommissionOverride {
  platform_take_bps: number | null;
  platform_take_floor_cents: number | null;
}

/** Input to the resolver. */
export interface ResolveBookingCommissionsInput {
  tenantId: string;
  workspacePlan: WorkspacePlanTier;
  offerLineItems: OfferLineItemForResolver[];
  currencyCode: string;
  paymentMethod: PaymentMethod;
  offPlatformReason?: string | null;
  /** Pre-loaded by the caller. */
  platformConfig: PlatformCommissionConfig;
  /** Pre-loaded by the caller. `null` = no override row exists for the tenant. */
  tenantOverride: WorkspaceCommissionOverride | null;
  /** Optional — if the offer was drafted with a per-booking platform-take
   *  override (rare, requires platform-admin elevation; falls under the
   *  "booking_override" resolved_from bucket). */
  bookingPlatformTakeBpsOverride?: number | null;
}

/** Result — matches the shape of `booking_commission_snapshot` minus the
 *  booking_id / participant_id / owning_party_* (the engine attaches those
 *  per-row when persisting). The pure resolver still computes per-row;
 *  per-participant orchestration lives in `commission-engine.ts`. */
export interface BookingCommissionSnapshot {
  platform_take_bps: number;
  platform_take_floor_cents: number;
  gross_cents: number;
  platform_fee_cents: number;
  workspace_fee_cents: number;
  talent_net_cents: number;
  currency_code: string;
  payment_method: PaymentMethod;
  off_platform_reason: string | null;
  resolved_from: CommissionResolvedFrom;
}

/** Persisted shape returned by the DB once the per-participant grain is
 *  written. Used by readers (Stripe app-fee, admin UI) — every commission
 *  snapshot row carries the participant + frozen owning_party that drove
 *  the rate. */
export interface PersistedBookingCommissionSnapshot extends BookingCommissionSnapshot {
  booking_id: string;
  participant_id: string;
  owning_party_type: "agency" | "workspace" | "talent";
  owning_party_id: string;
  created_at: string;
}

/** Errors that the resolver throws — caller surfaces friendly messages. */
export class CommissionResolutionError extends Error {
  constructor(public code:
    | "negative_line_item"
    | "talent_cost_exceeds_price"
    | "no_line_items"
    | "currency_invalid"
    | "platform_take_out_of_range"
    | "lanes_do_not_sum"
  ) {
    super(code);
    this.name = "CommissionResolutionError";
  }
}

/** Resolve a booking's commission snapshot. PURE — no IO. */
export function resolveBookingCommissions(
  input: ResolveBookingCommissionsInput,
): BookingCommissionSnapshot {
  // 0. Defensive validation.
  if (!input.offerLineItems.length) {
    throw new CommissionResolutionError("no_line_items");
  }
  if (input.currencyCode.length !== 3) {
    throw new CommissionResolutionError("currency_invalid");
  }
  for (const li of input.offerLineItems) {
    if (li.units < 0 || li.unit_price_cents < 0 || li.talent_cost_cents < 0) {
      throw new CommissionResolutionError("negative_line_item");
    }
    if (li.talent_cost_cents > li.unit_price_cents) {
      // Workspace would pay the talent more than the client pays the agency.
      // That's nonsense at the data layer — surface so the offer can't be
      // accepted into a booking.
      throw new CommissionResolutionError("talent_cost_exceeds_price");
    }
  }

  // 1. Resolve platform take with the four-level override hierarchy.
  let platformTakeBps = input.platformConfig.default_take_bps;
  let platformTakeFloorCents = input.platformConfig.default_take_floor_cents;
  let resolvedFrom: CommissionResolvedFrom = "platform_default";

  // Layer: plan-tier default
  const planTierBps = input.platformConfig.plan_tier_bps[input.workspacePlan];
  if (typeof planTierBps === "number") {
    platformTakeBps = planTierBps;
    resolvedFrom = "plan_tier";
  }

  // Layer: per-tenant override
  if (input.tenantOverride?.platform_take_bps != null) {
    platformTakeBps = input.tenantOverride.platform_take_bps;
    resolvedFrom = "tenant_override";
  }
  if (input.tenantOverride?.platform_take_floor_cents != null) {
    platformTakeFloorCents = input.tenantOverride.platform_take_floor_cents;
  }

  // Layer: per-booking override (rare — platform-admin elevation only).
  if (typeof input.bookingPlatformTakeBpsOverride === "number") {
    platformTakeBps = input.bookingPlatformTakeBpsOverride;
    resolvedFrom = "booking_override";
  }

  if (platformTakeBps < 0 || platformTakeBps > 5000) {
    // Schema constraint mirror: 0–50%.
    throw new CommissionResolutionError("platform_take_out_of_range");
  }

  // 2. Compute gross + workspace fee from line items.
  const grossCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * li.unit_price_cents),
    0,
  );
  const workspaceFeeCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * (li.unit_price_cents - li.talent_cost_cents)),
    0,
  );

  // 3. Platform fee = max(% take, floor).
  const platformByBps = Math.round((grossCents * platformTakeBps) / 10000);
  const platformFeeCents = Math.max(platformByBps, platformTakeFloorCents);

  // 4. Talent net = residual.
  const talentNetCents = grossCents - platformFeeCents - workspaceFeeCents;

  // 5. Sanity — lanes must sum to gross AND talent net must be >= 0.
  //    If talent net would be negative, the platform fee + workspace fee
  //    exceed gross — that's a misconfigured booking. Surface so it can
  //    be re-priced before acceptance.
  if (talentNetCents < 0) {
    throw new CommissionResolutionError("lanes_do_not_sum");
  }
  if (platformFeeCents + workspaceFeeCents + talentNetCents !== grossCents) {
    // Math should always check out given the formula, but be paranoid.
    throw new CommissionResolutionError("lanes_do_not_sum");
  }

  return {
    platform_take_bps: platformTakeBps,
    platform_take_floor_cents: platformTakeFloorCents,
    gross_cents: grossCents,
    platform_fee_cents: platformFeeCents,
    workspace_fee_cents: workspaceFeeCents,
    talent_net_cents: talentNetCents,
    currency_code: input.currencyCode,
    payment_method: input.paymentMethod,
    off_platform_reason: input.offPlatformReason ?? null,
    resolved_from: resolvedFrom,
  };
}

/** Convenience: human-readable breakdown for UI rendering. Returns
 *  formatted strings; the resolver returns cents. */
export function formatCommissionSnapshot(
  snap: BookingCommissionSnapshot,
  formatter?: (cents: number, currency: string) => string,
): {
  gross: string;
  platformFee: string;
  workspaceFee: string;
  talentNet: string;
  platformTakePercent: string;
} {
  const fmt = formatter ?? defaultFormatCents;
  return {
    gross: fmt(snap.gross_cents, snap.currency_code),
    platformFee: fmt(snap.platform_fee_cents, snap.currency_code),
    workspaceFee: fmt(snap.workspace_fee_cents, snap.currency_code),
    talentNet: fmt(snap.talent_net_cents, snap.currency_code),
    platformTakePercent: `${(snap.platform_take_bps / 100).toFixed(2)}%`,
  };
}

function defaultFormatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Whether a given payment method is settled on-platform (Stripe) or
 *  accrues to the workspace's balance owed. */
export function isOffPlatformPaymentMethod(method: PaymentMethod): boolean {
  return method === "cash"
    || method === "wire"
    || method === "venue_paid"
    || method === "crypto"
    || method === "other";
}

/** Sum the workspace's per-currency balances into a flat list for UI. */
export function balanceSummary(
  balances: Record<string, number>,
): Array<{ currency: string; cents: number }> {
  return Object.entries(balances)
    .filter(([, cents]) => cents !== 0)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents);
}
