/**
 * TUL-1601 · Automatic monthly rent (pure, no I/O). Oran's design: a Stripe Subscription on the PLATFORM account
 * whose money is transferred to the studio's connected account (`transfer_data`), the Tulala service fee added on top
 * for the member (the customer), consent collected on Checkout (the Plans recurring-consent text, TUL-1229).
 *
 * v1 scope: FIXED rent only (a percentage-of-sales rent varies by month and stays on the monthly payment link).
 * The first automatic charge is the 1st of NEXT month, so the current month (already on its payment link) is never
 * charged twice. Fail closed everywhere; TEST mode only behind RENT_AUTOPAY_ENABLED.
 */
import type Stripe from "stripe";
import { checkChargeMinimum } from "@/lib/payments/charge-minimums";
import { MAX_SERVICE_FEE_BPS } from "@/lib/billing/pass-through-rate";
import type { RentPlan } from "./rent-cycle";

export type RentAutopayGate = { ok: true } | { ok: false; reason: "disabled" | "not_test_mode" };

export function rentAutopayGate(env: Record<string, string | undefined> = process.env): RentAutopayGate {
  if (env.RENT_AUTOPAY_ENABLED !== "1") return { ok: false, reason: "disabled" };
  if (!(env.STRIPE_SECRET_KEY ?? "").trim().startsWith("sk_test_")) return { ok: false, reason: "not_test_mode" };
  return { ok: true };
}

export type RentAutopayAmounts = {
  rentCents: number;
  feeCents: number;
  totalCents: number;
  /** Share of each invoice transferred to the studio, in percent with 2 decimals, rounded DOWN (studio never over-paid). */
  transferPercent: number;
};

/** Rent + fee (half-up on the rent). null for any invalid input: never charge a guessed amount. */
export function rentAutopayAmounts(rentCents: number, feeBps: number): RentAutopayAmounts | null {
  if (!Number.isInteger(rentCents) || rentCents <= 0) return null;
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_SERVICE_FEE_BPS) return null;
  const feeCents = Math.floor((rentCents * feeBps + 5_000) / 10_000);
  const totalCents = rentCents + feeCents;
  // Integer math in hundredths of a percent, rounded down.
  const transferPercent = Math.floor((rentCents * 10_000) / totalCents) / 100;
  return { rentCents, feeCents, totalCents, transferPercent };
}

export type RentAutopayRefusal =
  | "not_accepted"
  | "not_active"
  | "percent_rent"
  | "terms_changed"
  | "studio_not_ready"
  | "fee_unavailable"
  | "below_minimum"
  | "already_on";

export function decideRentAutopay(input: {
  plan: RentPlan;
  studio: { accountId: string | null; chargesEnabled: boolean };
  /** The studio's current Tulala service fee (null = could not be confirmed). */
  feeBps: number | null;
  autopayStatus: string;
}): { ok: true } | { ok: false; reason: RentAutopayRefusal } {
  const { plan } = input;
  if (plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  if (plan.status !== "active") return { ok: false, reason: "not_active" };
  if (plan.percentBps > 0) return { ok: false, reason: "percent_rent" };
  if (
    plan.acceptedTermsVersion !== plan.termsVersion ||
    plan.acceptedAmountCents !== plan.monthlyRentCents ||
    plan.acceptedCurrency !== plan.currency
  ) {
    return { ok: false, reason: "terms_changed" };
  }
  if (!input.studio.accountId || !input.studio.chargesEnabled) return { ok: false, reason: "studio_not_ready" };
  if (input.feeBps == null) return { ok: false, reason: "fee_unavailable" };
  const amounts = rentAutopayAmounts(plan.monthlyRentCents, input.feeBps);
  if (!amounts || !checkChargeMinimum(amounts.totalCents, plan.currency).ok) return { ok: false, reason: "below_minimum" };
  // 'pending' may start again (an abandoned Checkout); the same session is reused by its idempotency key.
  if (input.autopayStatus !== "off" && input.autopayStatus !== "canceled" && input.autopayStatus !== "pending") return { ok: false, reason: "already_on" };
  return { ok: true };
}

/** Unix seconds of the 1st of next month, UTC: the first automatic charge. */
export function nextMonthAnchorSeconds(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000;
}

export function buildRentSubscriptionParams(input: {
  plan: RentPlan;
  amounts: RentAutopayAmounts;
  customerId: string;
  studioAccountId: string;
  successUrl: string;
  cancelUrl: string;
  locale: "en" | "es";
  anchorSeconds: number;
  rentLabel: string;
  feeLabel: string;
  /** recurringConsentParams(...) from the Plans checkout: required Terms checkbox + renewal text. */
  consent: Partial<Stripe.Checkout.SessionCreateParams>;
}): Stripe.Checkout.SessionCreateParams {
  const { plan, amounts } = input;
  const currency = plan.currency.toLowerCase();
  const metadata: Record<string, string> = {
    checkout_type: "rent_subscription",
    rent_plan_id: plan.id,
    tenant_id: plan.tenantId,
    rent_talent_profile_id: plan.talentProfileId,
    rent_cents: String(amounts.rentCents),
    fee_cents: String(amounts.feeCents),
    terms_version: String(plan.termsVersion),
  };
  const line = (name: string, unitAmount: number): Stripe.Checkout.SessionCreateParams.LineItem => ({
    quantity: 1,
    price_data: { currency, unit_amount: unitAmount, recurring: { interval: "month" }, product_data: { name } },
  });
  return {
    mode: "subscription",
    customer: input.customerId,
    line_items: [line(input.rentLabel, amounts.rentCents), ...(amounts.feeCents > 0 ? [line(input.feeLabel, amounts.feeCents)] : [])],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    locale: input.locale,
    metadata,
    subscription_data: {
      metadata,
      billing_cycle_anchor: input.anchorSeconds,
      proration_behavior: "none",
      transfer_data: { destination: input.studioAccountId, amount_percent: amounts.transferPercent },
    },
    ...input.consent,
  };
}
