/**
 * lib/payments/link-charge.ts
 *
 * What a payment link actually charges: the link's amount (service principal
 * owed on its order) PLUS the client fees the platform adds on top, resolved
 * through the SAME path the storefront purchase checkout uses
 * (`resolvePurchaseSellersForCollect` + `resolvePassThroughCollectBreakdown`):
 * the two-key pass_through arming (env + `engine_platform_processing_mode`),
 * the live `pass_through_take_bps` (default `PASS_THROUGH_DEFAULT_TAKE_BPS`),
 * and each seller's "who pays the card fee" setting. Nothing is re-derived
 * here.
 *
 * The principal stays the link's `amount_cents` and the order's `total_cents`:
 * fees are never principal. The money row stores the charge as gross, the
 * principal as net and the fees in `platform_fee_cents` with
 * `platform_fee_basis_points = 0` (the pass-through shape `createPurchase`
 * writes; a positive bps on a row with `order_id` is the fee-netted shape the
 * DB CHECK `booking_transactions_fee_netted_no_order` refuses).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import {
  passThroughCollectArmed,
  resolvePassThroughCollectBreakdown,
  resolvePurchaseSellersForCollect,
  type PassThroughCollectAdmin,
  type PassThroughCollectBreakdown,
  type PurchaseLineForCollect,
} from "@/lib/orders/purchase-pass-through-collect";
import { logServerError } from "@/lib/server/safe-error";

export type PaymentLinkCharge = PassThroughCollectBreakdown & {
  /** The link's own amount: service principal, credited to the order. */
  principalCents: number;
};

export type PaymentLinkChargeDeps = {
  resolveSellers?: typeof resolvePurchaseSellersForCollect;
  resolveBreakdown?: typeof resolvePassThroughCollectBreakdown;
  armed?: () => boolean;
};

type OrderLineForCharge = {
  talent_profile_id: string | null;
  owner_tenant_id: string | null;
  talent_cost_cents: number | string | null;
  units: number | string | null;
  total_cents: number | string | null;
};

function cents(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The charge for `principalCents` of `orderId`. Unarmed (env off) it is the
 * principal with no fees and nothing is read. null when the order's lines
 * cannot be read, or the fees do not explain the charge: the caller refuses,
 * never charges a guessed total.
 */
export async function resolvePaymentLinkCharge(
  admin: PassThroughCollectAdmin,
  input: { tenantId: string; orderId: string; principalCents: number; currency: string },
  deps: PaymentLinkChargeDeps = {},
): Promise<PaymentLinkCharge | null> {
  const principalCents = input.principalCents;
  const bare: PaymentLinkCharge = { principalCents, chargeCents: principalCents, serviceFeeCents: 0, processingFeeCents: 0 };
  if (!(principalCents > 0) || !(deps.armed ?? passThroughCollectArmed)()) return bare;

  const { data, error } = await admin
    .from("order_lines")
    .select("talent_profile_id, owner_tenant_id, talent_cost_cents, units, total_cents")
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("payments.linkCharge.lines", error);
    return null;
  }
  const lines: PurchaseLineForCollect[] = ((data ?? []) as OrderLineForCharge[]).map((l) => ({
    talentProfileId: l.talent_profile_id,
    ownerTenantId: l.owner_tenant_id,
    // order_lines.talent_cost_cents is PER UNIT; the collect math wants the line's.
    talentCostCents: Math.round(cents(l.talent_cost_cents) * (Number(l.units) > 0 ? Number(l.units) : 1)),
    totalCents: cents(l.total_cents),
  }));
  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const sellers = await (deps.resolveSellers ?? resolvePurchaseSellersForCollect)(
    admin as Pick<SupabaseClient, "from">,
    lines,
    principalCents,
    subtotalCents,
    input.tenantId,
  );
  const breakdown = await (deps.resolveBreakdown ?? resolvePassThroughCollectBreakdown)(admin, {
    baseCollectCents: principalCents,
    currencyCode: input.currency,
    sellers,
  });
  // The fee lines must explain the whole surplus, or the page and Checkout
  // would show lines that do not add up to the charge.
  if (breakdown.chargeCents !== principalCents + breakdown.serviceFeeCents + breakdown.processingFeeCents) {
    logServerError(
      "payments.linkCharge.breakdown",
      `order ${input.orderId}: charge ${breakdown.chargeCents} != ${principalCents} + fees; refusing`,
    );
    return null;
  }
  return { principalCents, ...breakdown };
}

/** The pay page's breakdown for a charge with fees; [] when there are none. */
export function paymentLinkFeeLines(charge: PaymentLinkCharge): FeeLine[] {
  if (charge.chargeCents === charge.principalCents) return [];
  const lines: FeeLine[] = [
    { code: "service_subtotal", cents: charge.principalCents },
    { code: "platform_fee", cents: charge.serviceFeeCents },
  ];
  if (charge.processingFeeCents > 0) lines.push({ code: "processing_fee", cents: charge.processingFeeCents });
  lines.push({ code: "total_charged", cents: charge.chargeCents });
  return lines;
}
