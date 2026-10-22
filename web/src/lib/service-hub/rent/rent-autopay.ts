/**
 * TUL-1601 · Automatic monthly rent (pure, no I/O). Oran's design: a Stripe Subscription on the PLATFORM account
 * whose money is transferred to the studio's connected account (`transfer_data`), the Tulala service fee added on top
 * for the member (the customer), consent collected on Checkout (the Plans recurring-consent text, TUL-1229).
 *
 * Fixed rent is the subscription price; a percentage of sales is added to each monthly invoice for the closed month
 * before it (TUL-1609), never for a month before automatic payments started.
 * The first automatic charge is the 1st of NEXT month, so the current month (already on its payment link) is never
 * charged twice. Fail closed everywhere; TEST mode only behind RENT_AUTOPAY_ENABLED.
 */
import type Stripe from "stripe";
import { checkChargeMinimum } from "@/lib/payments/charge-minimums";
import { stripeEnv } from "@/lib/stripe/env-keys";
import { MAX_SERVICE_FEE_BPS } from "@/lib/billing/pass-through-rate";
import type { RentPlan } from "./rent-cycle";

export type RentAutopayGate = { ok: true } | { ok: false; reason: "disabled" | "not_test_mode" };

/** The feature flag alone (what the UI uses to offer the button). */
export function rentAutopayFlagOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.RENT_AUTOPAY_ENABLED === "1";
}

/**
 * TUL-1609: percentage-of-sales autopay has its own flag (OFF by default). It needs `invoice.created` subscribed on
 * the US and MX webhook endpoints; without it a percentage plan would bill only its fixed part.
 */
export function rentAutopayPercentFlagOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.RENT_AUTOPAY_PERCENT_ENABLED === "1";
}

/**
 * The flag AND a TEST key for the platform that will actually create the subscription: STRIPE_SECRET_KEY for the US
 * platform, STRIPE_MX_SECRET_KEY for MX. A live (or missing) key of the chosen platform refuses, whatever the other
 * platform's key is, so a live MX key can never create live subscriptions behind a US test key.
 */
export function rentAutopayGate(env: Record<string, string | undefined> = process.env, platform: "us" | "mx" = "us"): RentAutopayGate {
  if (!rentAutopayFlagOn(env)) return { ok: false, reason: "disabled" };
  // Evaluate the key the app will really charge with (forced test mode resolves to the *_TEST sibling).
  const key = stripeEnv(platform === "mx" ? "STRIPE_MX_SECRET_KEY" : "STRIPE_SECRET_KEY", env) ?? "";
  if (!key.trim().startsWith("sk_test_")) return { ok: false, reason: "not_test_mode" };
  return { ok: true };
}

export type RentAutopayAmounts = {
  rentCents: number;
  feeCents: number;
  totalCents: number;
  /** Share of each invoice transferred to the studio, in percent with 2 decimals, rounded DOWN (studio never over-paid). */
  transferPercent: number;
};

/**
 * The studio's share of every subscription invoice, in percent with 2 decimals, rounded DOWN. Every rent part (fixed
 * or percentage) carries the same fee rate on top, so the share is the same for any amount: 1 / (1 + fee).
 */
export function transferPercentForFeeBps(feeBps: number): number {
  return Math.floor(100_000_000 / (10_000 + feeBps)) / 100;
}

/** Rent + fee (half-up on the rent). null for any invalid input: never charge a guessed amount. 0 rent = percentage-only plan. */
export function rentAutopayAmounts(rentCents: number, feeBps: number): RentAutopayAmounts | null {
  if (!Number.isInteger(rentCents) || rentCents < 0) return null;
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_SERVICE_FEE_BPS) return null;
  const feeCents = Math.floor((rentCents * feeBps + 5_000) / 10_000);
  const totalCents = rentCents + feeCents;
  return { rentCents, feeCents, totalCents, transferPercent: transferPercentForFeeBps(feeBps) };
}

/**
 * TUL-1609: the percentage part a monthly invoice adds for one closed month: the studio's percentage of the member's
 * sales base, half-up, plus the same Tulala fee rate on top. null when the base is not usable (fail closed).
 */
export function percentRentLines(input: { salesBaseCents: number | null; percentBps: number; feeBps: number }): { percentCents: number; feeCents: number } | null {
  const { salesBaseCents: base, percentBps, feeBps } = input;
  if (base == null || !Number.isInteger(base) || base < 0) return null;
  if (!Number.isInteger(percentBps) || percentBps <= 0 || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_SERVICE_FEE_BPS) return null;
  const percentCents = Math.floor((base * percentBps + 5_000) / 10_000);
  return { percentCents, feeCents: Math.floor((percentCents * feeBps + 5_000) / 10_000) };
}

/** The month before `period` ("YYYY-MM"). */
export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * TUL-1609: on the monthly invoice dated `invoicePeriod`, which closed month's percentage is added? The month before
 * it, but never a month before automatic payments started (that month is billed by its payment link), so the first
 * automatic invoice carries no percentage.
 */
export function percentMonthForInvoice(input: { invoicePeriod: string; autopayFirstPeriod: string | null }): string | null {
  if (!input.autopayFirstPeriod) return null;
  const month = previousPeriod(input.invoicePeriod);
  return month >= input.autopayFirstPeriod ? month : null;
}

export type RentAutopayRefusal =
  | "not_accepted"
  | "not_active"
  | "terms_changed"
  | "studio_not_ready"
  | "fee_unavailable"
  | "below_minimum"
  | "percent_unavailable"
  | "already_on";

export function decideRentAutopay(input: {
  plan: RentPlan;
  studio: { accountId: string | null; chargesEnabled: boolean };
  /** The studio's current Tulala service fee (null = could not be confirmed). */
  feeBps: number | null;
  autopayStatus: string;
  /** Defaults to the RENT_AUTOPAY_PERCENT_ENABLED flag. */
  percentEnabled?: boolean;
}): { ok: true } | { ok: false; reason: RentAutopayRefusal } {
  const { plan } = input;
  if (plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  if (plan.status !== "active") return { ok: false, reason: "not_active" };
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
  if (!amounts) return { ok: false, reason: "below_minimum" };
  // A fixed part must clear the card minimum; a percentage-only plan charges each month what is owed (TUL-1609).
  if (plan.monthlyRentCents > 0 && !checkChargeMinimum(amounts.totalCents, plan.currency).ok) return { ok: false, reason: "below_minimum" };
  if (plan.acceptedPercentBps !== plan.percentBps) return { ok: false, reason: "terms_changed" };
  if (plan.percentBps > 0 && !(input.percentEnabled ?? rentAutopayPercentFlagOn())) return { ok: false, reason: "percent_unavailable" };
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
  /** The Tulala fee rate at sign-up; the monthly percentage part carries the same rate (TUL-1609). */
  feeBps: number;
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
    percent_bps: String(plan.percentBps),
    fee_bps: String(input.feeBps),
    terms_version: String(plan.termsVersion),
  };
  const line = (name: string, unitAmount: number): NonNullable<Stripe.Checkout.SessionCreateParams["line_items"]>[number] => ({
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
    // TUL-1609: a percentage rent says so above the Subscribe button, in the member's language.
    ...(plan.percentBps > 0
      ? {
          custom_text: {
            ...(input.consent.custom_text ?? {}),
            submit: {
              message:
                (input.locale === "es"
                  ? `Además, cada mes se cobra el ${plan.percentBps / 100}% de tus ventas del mes anterior en este estudio, más el cargo por servicio de Tulala. `
                  : `Each month also charges ${plan.percentBps / 100}% of your sales in this studio the month before, plus the Tulala service fee. `) +
                (input.consent.custom_text?.submit && typeof input.consent.custom_text.submit === "object" ? input.consent.custom_text.submit.message : ""),
            },
          },
        }
      : {}),
  };
}
