/**
 * lib/stripe/client-billing.ts
 *
 * Server-only Stripe billing operations for client trust economics.
 *
 * Two payment flows — both are Stripe Checkout in "payment" mode (one-time):
 *
 *   1. Verification ($5 one-time fee)
 *      checkout_type: "client_verification"
 *      On success → webhook sets verified_at on client_trust_state
 *                   and re-evaluates trust level (basic → verified).
 *
 *   2. Balance top-up (variable amount: $100 / $250 / $500 presets)
 *      checkout_type: "client_balance_topup"
 *      On success → webhook appends to client_balance_ledger,
 *                   increments funded_balance_cents on client_trust_state,
 *                   and re-evaluates trust level (verified → silver / gold).
 *
 * Three payment rails are independent:
 *   - Workspace plan subscriptions → workspace-billing.ts
 *   - Talent personal-page subscriptions → talent-billing.ts
 *   - Client verification + balance → this file
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { deriveClientTrustLevel, writeClientTrustLevel } from "@/lib/client-trust/evaluator";
import type { BillingResult } from "@/lib/stripe/workspace-billing";

// Re-export for callers that only touch this module.
export type { BillingResult };

// ─── Verification fee (fixed $5) ──────────────────────────────────────────────

const VERIFICATION_FEE_CENTS = 500; // $5.00

// ─── Balance top-up presets ───────────────────────────────────────────────────

/** Allowed top-up amounts in cents. Validated server-side before creating session. */
export const ALLOWED_TOPUP_AMOUNTS_CENTS = [10_000, 25_000, 50_000] as const; // $100 / $250 / $500
export type AllowedTopupAmount = (typeof ALLOWED_TOPUP_AMOUNTS_CENTS)[number];

// ─── Customer management ──────────────────────────────────────────────────────

/**
 * Returns the Stripe Customer ID for a client user, creating one if needed.
 * Keyed by auth.users.id — one customer per user across all Stripe flows.
 */
export async function getOrCreateClientStripeCustomer(
  userId: string,
  email: string,
  displayName: string,
): Promise<BillingResult<string>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: existing } = await sb
      .from("client_stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      return { ok: true, data: existing.stripe_customer_id };
    }

    const customer = await stripe.customers.create({
      email,
      name: displayName,
      metadata: { user_id: userId, customer_type: "client" },
    });

    const { error } = await sb.from("client_stripe_customers").insert({
      user_id: userId,
      stripe_customer_id: customer.id,
      billing_email: email,
    });
    if (error) {
      logServerError("client-billing.getOrCreateCustomer.insert", error);
    }

    return { ok: true, data: customer.id };
  } catch (err) {
    logServerError("client-billing.getOrCreateCustomer", err);
    return { ok: false, error: "Could not set up billing account." };
  }
}

// ─── Verification checkout ────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for the $5 client verification fee.
 * Payment mode (one-time). On success, webhook sets verified_at.
 */
export async function createClientVerificationCheckoutSession(opts: {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  tenantSlug: string;
  appBaseUrl: string;
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;

  const customerResult = await getOrCreateClientStripeCustomer(
    opts.userId,
    opts.email,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerResult.data,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: VERIFICATION_FEE_CENTS,
            product_data: {
              name: "Account Verification",
              description:
                "One-time verification fee. Upgrades your trust badge to Verified — required to contact many talents.",
            },
          },
        },
      ],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings?trust=verified`,
      cancel_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings`,
      metadata: {
        user_id: opts.userId,
        tenant_id: opts.tenantId,
        checkout_type: "client_verification",
      },
      payment_intent_data: {
        metadata: {
          user_id: opts.userId,
          tenant_id: opts.tenantId,
          checkout_type: "client_verification",
        },
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("client-billing.createVerificationSession", err);
    return { ok: false, error: "Could not create verification session." };
  }
}

// ─── Balance top-up checkout ──────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for a client balance top-up.
 * Payment mode (one-time). On success, webhook appends to ledger + increments balance.
 * Amount must be one of ALLOWED_TOPUP_AMOUNTS_CENTS.
 */
export async function createClientBalanceTopupCheckoutSession(opts: {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  amountCents: AllowedTopupAmount;
  tenantSlug: string;
  appBaseUrl: string;
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  // Server-side validation of amount
  if (!(ALLOWED_TOPUP_AMOUNTS_CENTS as readonly number[]).includes(opts.amountCents)) {
    return { ok: false, error: "Invalid top-up amount." };
  }

  const stripe = getStripe()!;

  const customerResult = await getOrCreateClientStripeCustomer(
    opts.userId,
    opts.email,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  const dollars = (opts.amountCents / 100).toFixed(0);

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerResult.data,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: opts.amountCents,
            product_data: {
              name: `Account Balance — $${dollars}`,
              description:
                `Add $${dollars} to your account balance. Funded balances unlock Silver and Gold trust tiers, giving you access to more talents.`,
            },
          },
        },
      ],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings?trust=funded&amount=${dollars}`,
      cancel_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings`,
      metadata: {
        user_id: opts.userId,
        tenant_id: opts.tenantId,
        amount_cents: String(opts.amountCents),
        checkout_type: "client_balance_topup",
      },
      payment_intent_data: {
        metadata: {
          user_id: opts.userId,
          tenant_id: opts.tenantId,
          amount_cents: String(opts.amountCents),
          checkout_type: "client_balance_topup",
        },
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("client-billing.createTopupSession", err);
    return { ok: false, error: "Could not create top-up session." };
  }
}

// ─── Webhook sync helpers ─────────────────────────────────────────────────────

/**
 * Called by the webhook handler when checkout_type === "client_verification".
 * Sets verified_at on client_trust_state and re-evaluates trust level.
 */
export async function syncClientVerificationToDb(
  userId: string,
  tenantId: string,
): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    // Load current state to preserve balance and override
    const { data: existing } = await sb
      .from("client_trust_state")
      .select("funded_balance_cents, manual_override, verified_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const verifiedAt = new Date().toISOString();
    const fundedBalanceCents = (existing as any)?.funded_balance_cents ?? 0;
    const manualOverride = (existing as any)?.manual_override ?? null;

    const result = await writeClientTrustLevel(
      userId,
      tenantId,
      { verifiedAt, fundedBalanceCents, manualOverride },
    );

    if (!result) {
      return { ok: false, error: "Failed to update trust state." };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("client-billing.syncVerification", err);
    return { ok: false, error: "Unexpected error syncing verification." };
  }
}

/**
 * Called by the webhook handler when checkout_type === "client_balance_topup".
 * Appends to client_balance_ledger, increments funded_balance_cents,
 * and re-evaluates trust level.
 */
export async function syncClientBalanceTopupToDb(opts: {
  userId: string;
  tenantId: string;
  amountCents: number;
  paymentIntentId: string | null;
}): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    // Append ledger entry
    const { error: ledgerError } = await sb.from("client_balance_ledger").insert({
      user_id: opts.userId,
      tenant_id: opts.tenantId,
      amount_cents: opts.amountCents,
      entry_type: "deposit",
      stripe_payment_intent_id: opts.paymentIntentId,
    });

    if (ledgerError) {
      logServerError("client-billing.syncTopup.ledger", ledgerError);
      return { ok: false, error: "Failed to record balance deposit." };
    }

    // Load current state
    const { data: existing } = await sb
      .from("client_trust_state")
      .select("funded_balance_cents, manual_override, verified_at")
      .eq("user_id", opts.userId)
      .eq("tenant_id", opts.tenantId)
      .maybeSingle();

    const prevBalance = (existing as any)?.funded_balance_cents ?? 0;
    const newBalance = prevBalance + opts.amountCents;
    const verifiedAt = (existing as any)?.verified_at ?? null;
    const manualOverride = (existing as any)?.manual_override ?? null;

    const result = await writeClientTrustLevel(
      opts.userId,
      opts.tenantId,
      { verifiedAt, fundedBalanceCents: newBalance, manualOverride },
    );

    if (!result) {
      return { ok: false, error: "Failed to update trust state." };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("client-billing.syncTopup", err);
    return { ok: false, error: "Unexpected error syncing balance top-up." };
  }
}
