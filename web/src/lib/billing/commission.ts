/**
 * Tulala commission resolver — talent-protected split (2026-05-29).
 *
 * PURE function. No DB, no Stripe, no side effects. Takes inputs, returns
 * a snapshot. The caller (the per-participant `commission-engine.ts`) loads
 * the platform config + tenant override and persists the snapshot.
 *
 * Spec: `web/docs/commission-model-2026-05-13.md` §6 + the talent-protected
 * amendment (2026-05-29).
 *
 * ── The model — "talent never pays" ─────────────────────────────────────
 * The platform take is NEVER carved out of the talent's pay. It is split
 * into two halves that land on the people who profit from coordination:
 *
 *   • a CLIENT SURCHARGE  — added ON TOP of the service subtotal, and
 *   • a SELLER DEDUCTION  — taken FROM the seller-of-record's margin.
 *
 * The "seller of record" is the workspace when one mediates the booking
 * (owning_party_type = agency | workspace); it is the talent only when the
 * talent sells independently (owning_party_type = talent). When a workspace
 * is the seller, the talent is paid their full quote — always.
 *
 *   subtotal       = Σ units × unit_price          (what the offer lists)
 *   talent_full    = Σ units × talent_cost          (the talent's quote)
 *   margin         = subtotal − talent_full         (the workspace markup)
 *
 *   client_surcharge = round(subtotal × client_share_bps / 10000)
 *   seller_target    = round(subtotal × seller_share_bps / 10000)
 *   seller_deduction = workspace seller ? min(seller_target, margin)
 *                                       : seller_target            (talent)
 *
 *   gross_charged  = subtotal + client_surcharge    (what the client pays)
 *   platform_fee   = client_surcharge + seller_deduction
 *   talent_net     = workspace seller ? talent_full           (protected)
 *                                     : subtotal − seller_deduction
 *   workspace_fee  = workspace seller ? margin − seller_deduction : 0
 *
 *   INVARIANT:  talent_net + workspace_fee + platform_fee === gross_charged
 *
 * The total take (client_share_bps + seller_share_bps) resolves through the
 * usual override hierarchy as `platform_take_bps`; the client/seller split
 * is governed by `client_surcharge_bps` (defaults to an even split). A
 * floor (`platform_take_floor_cents`) is a MINIMUM total take, topped up via
 * the client surcharge so talent + workspace always stay whole.
 *
 * When a workspace's margin is too thin to cover its half, the platform
 * absorbs the gap (talent stays whole) and surfaces `seller_shortfall_cents`
 * so the offer composer can prompt the admin to raise the price.
 *
 * Override hierarchy for the total take (most-specific wins):
 *   1. per-booking override (platform-admin elevation)
 *   2. tenant override (workspace_commission_overrides.platform_take_bps)
 *   3. plan-tier default (platform_commission_config.plan_tier_bps[plan])
 *   4. platform default (platform_commission_config.default_take_bps)
 */

export type WorkspacePlanTier = "free" | "studio" | "agency" | "network";

/** Who bears the seller-side half of the platform take. */
export type SellerOfRecord = "workspace" | "talent";

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
  /** The CLIENT-side share of the total take, in bps (added on top of the
   *  subtotal as a surcharge). The seller-side share = total − this. When
   *  omitted, defaults to an even split of the resolved total take. Talent
   *  pay is never touched when a workspace is the seller of record. */
  client_surcharge_bps?: number | null;
  /** Platform cap on a workspace's flat base reservation fee, in cents
   *  (null = uncapped). Bounds what any workspace can charge per booking. */
  max_base_fee_cents?: number | null;
  /** Platform cap on a workspace's % base reservation fee, in bps (null = uncapped). */
  max_base_fee_bps?: number | null;
}

/** Subset of `workspace_commission_overrides` the resolver reads. */
export interface WorkspaceCommissionOverride {
  platform_take_bps: number | null;
  platform_take_floor_cents: number | null;
  /** Workspace's automatic base reservation fee on every booking — a flat
   *  amount (cents) and/or a % of subtotal (bps). Workspace revenue, added on
   *  top of the client total, clamped to the platform caps. */
  base_reservation_fee_cents?: number | null;
  base_reservation_fee_bps?: number | null;
}

/** Input to the resolver. */
export interface ResolveBookingCommissionsInput {
  tenantId: string;
  workspacePlan: WorkspacePlanTier;
  offerLineItems: OfferLineItemForResolver[];
  currencyCode: string;
  paymentMethod: PaymentMethod;
  offPlatformReason?: string | null;
  /** Who bears the seller-side fee. "workspace" (default) protects the
   *  talent — the fee comes from the workspace margin. "talent" is for
   *  independent talent selling directly (owning_party_type='talent'),
   *  where the talent IS the seller of record. */
  sellerOfRecord?: SellerOfRecord;
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
  /** The service subtotal = Σ units × unit_price (talent quote + markup).
   *  This is the offer's listed value, NOT what the client is charged
   *  (that is `gross_charged_cents`). */
  gross_cents: number;
  /** Total platform take = client_surcharge_cents + seller_deduction_cents. */
  platform_fee_cents: number;
  /** The workspace's NET take = margin − seller_deduction (0 for an
   *  independent-talent sale). */
  workspace_fee_cents: number;
  /** The talent's pay. Their full quote when a workspace is the seller
   *  (protected); subtotal − seller_deduction when the talent sells
   *  independently. */
  talent_net_cents: number;
  /** The client-side half of the take, added on top of the subtotal. */
  client_surcharge_cents: number;
  /** The seller-side half actually collected from the seller's margin. */
  seller_deduction_cents: number;
  /** What the client is actually charged = gross_cents + client_surcharge_cents. */
  gross_charged_cents: number;
  /** Uncollected seller-side fee — a workspace margin too thin to cover its
   *  half. > 0 means the platform absorbed the gap to keep the talent whole;
   *  the offer composer should prompt the admin to raise the price. */
  seller_shortfall_cents: number;
  /** The workspace's base reservation fee on this booking (flat + %), clamped
   *  to platform caps. Workspace revenue — included in workspace_fee_cents and
   *  added to gross_charged_cents. 0 / absent for an independent-talent sale. */
  base_reservation_fee_cents?: number;
  /** Who bore the seller-side fee on this row. */
  seller_of_record: SellerOfRecord;
  currency_code: string;
  payment_method: PaymentMethod;
  off_platform_reason: string | null;
  resolved_from: CommissionResolvedFrom;
}

/** Persisted shape returned by the DB once the per-participant grain is
 *  written. Used by readers (Stripe transfer amounts, admin UI) — every
 *  commission snapshot row carries the participant + frozen owning_party
 *  that drove the rate. */
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

  // 1. Resolve the TOTAL platform take with the four-level override hierarchy.
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

  if (!Number.isFinite(platformTakeBps) || platformTakeBps < 0 || platformTakeBps > 5000) {
    // Schema constraint mirror: 0–50%. The Number.isFinite guard rejects
    // NaN / ±Infinity (e.g. a malformed booking-override) up front, rather
    // than letting it slip through to a misleading lanes_do_not_sum failure.
    throw new CommissionResolutionError("platform_take_out_of_range");
  }

  // 2. Service subtotal + workspace margin from line items.
  const subtotalCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * li.unit_price_cents),
    0,
  );
  const talentFullCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * li.talent_cost_cents),
    0,
  );
  const marginCents = subtotalCents - talentFullCents;

  // 3. Split the take into a client surcharge + a seller-side deduction.
  const sellerOfRecord: SellerOfRecord = input.sellerOfRecord ?? "workspace";

  // Client share of the take; default to an even split of the resolved
  // total. Clamp to [0, total] so the seller share is never negative.
  const rawClientShareBps =
    input.platformConfig.client_surcharge_bps != null
      ? input.platformConfig.client_surcharge_bps
      : Math.floor(platformTakeBps / 2);
  const clientShareBps = Math.min(Math.max(Math.round(rawClientShareBps), 0), platformTakeBps);
  const sellerShareBps = Math.max(platformTakeBps - clientShareBps, 0);

  const clientSurchargeBase = Math.round((subtotalCents * clientShareBps) / 10000);
  const sellerTargetCents = Math.round((subtotalCents * sellerShareBps) / 10000);

  // Seller-side: a workspace bears it from its margin (talent fully
  // protected); an independent talent bears it directly. A workspace whose
  // margin is too thin → platform absorbs the gap (talent stays whole).
  let sellerDeductionCents: number;
  let sellerShortfallCents = 0;
  if (sellerOfRecord === "talent") {
    sellerDeductionCents = sellerTargetCents;
  } else {
    const available = Math.max(marginCents, 0);
    sellerDeductionCents = Math.min(sellerTargetCents, available);
    sellerShortfallCents = sellerTargetCents - sellerDeductionCents;
  }

  // 3b. Workspace base reservation fee — an automatic flat + % fee the
  //     workspace charges on every booking. Workspace REVENUE, added on top
  //     of the client total + clamped to the platform caps. Workspace seller
  //     only (an independent-talent sale has no workspace, so no base fee).
  let baseReservationFeeCents = 0;
  if (sellerOfRecord !== "talent" && input.tenantOverride) {
    const flat = Math.max(0, Math.round(input.tenantOverride.base_reservation_fee_cents ?? 0));
    const pctBps = Math.max(0, Math.round(input.tenantOverride.base_reservation_fee_bps ?? 0));
    const pct = Math.round((subtotalCents * pctBps) / 10000);
    const maxFlat = input.platformConfig.max_base_fee_cents;
    const maxBps = input.platformConfig.max_base_fee_bps;
    const cappedFlat = maxFlat != null ? Math.min(flat, Math.max(0, maxFlat)) : flat;
    const cappedPct = maxBps != null
      ? Math.min(pct, Math.round((subtotalCents * Math.max(0, maxBps)) / 10000))
      : pct;
    baseReservationFeeCents = cappedFlat + cappedPct;
  }

  // 4. Floor = minimum TOTAL take, topped up via the client surcharge so
  //    that talent + workspace stay whole.
  let clientSurchargeCents = clientSurchargeBase;
  const takeBeforeFloor = clientSurchargeCents + sellerDeductionCents;
  if (takeBeforeFloor < platformTakeFloorCents) {
    clientSurchargeCents += platformTakeFloorCents - takeBeforeFloor;
  }

  const platformFeeCents = clientSurchargeCents + sellerDeductionCents;
  // The client pays: subtotal + the platform's client surcharge + the
  // workspace's base reservation fee.
  const grossChargedCents = subtotalCents + clientSurchargeCents + baseReservationFeeCents;

  // 5. Lane destinations.
  let talentNetCents: number;
  let workspaceFeeCents: number;
  if (sellerOfRecord === "talent") {
    talentNetCents = subtotalCents - sellerDeductionCents; // talent bears it
    workspaceFeeCents = 0;
  } else {
    talentNetCents = talentFullCents;                       // protected, 100%
    // Workspace nets its margin (less the seller deduction) PLUS its base fee.
    workspaceFeeCents = marginCents - sellerDeductionCents + baseReservationFeeCents;
  }

  // 6. Sanity — no lane negative; the three lanes sum to what the client is
  //    charged. Talent-protection makes negatives unreachable for valid
  //    inputs, but stay paranoid against future regressions.
  if (talentNetCents < 0 || workspaceFeeCents < 0) {
    throw new CommissionResolutionError("lanes_do_not_sum");
  }
  if (talentNetCents + workspaceFeeCents + platformFeeCents !== grossChargedCents) {
    throw new CommissionResolutionError("lanes_do_not_sum");
  }

  return {
    platform_take_bps: platformTakeBps,
    platform_take_floor_cents: platformTakeFloorCents,
    gross_cents: subtotalCents,
    platform_fee_cents: platformFeeCents,
    workspace_fee_cents: workspaceFeeCents,
    talent_net_cents: talentNetCents,
    base_reservation_fee_cents: baseReservationFeeCents,
    client_surcharge_cents: clientSurchargeCents,
    seller_deduction_cents: sellerDeductionCents,
    gross_charged_cents: grossChargedCents,
    seller_shortfall_cents: sellerShortfallCents,
    seller_of_record: sellerOfRecord,
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
  grossCharged: string;
  clientSurcharge: string;
  platformFee: string;
  workspaceFee: string;
  talentNet: string;
  platformTakePercent: string;
} {
  const fmt = formatter ?? defaultFormatCents;
  return {
    gross: fmt(snap.gross_cents, snap.currency_code),
    grossCharged: fmt(snap.gross_charged_cents, snap.currency_code),
    clientSurcharge: fmt(snap.client_surcharge_cents, snap.currency_code),
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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
