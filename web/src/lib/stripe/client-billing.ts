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
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  writeClientTrustLevel,
  type ClientTrustLevel,
} from "@/lib/client-trust/evaluator";
import type { BillingResult } from "@/lib/stripe/workspace-billing";

// Re-export for callers that only touch this module.
export type { BillingResult };

type ClientTrustSignalRow = {
  funded_balance_cents: number | string | null;
  manual_override: ClientTrustLevel | null;
  verified_at: string | null;
};

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

    // Audit C6 — race fix: clean up orphan if concurrent call won.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        try {
          await stripe.customers.del(customer.id);
        } catch (delErr) {
          logServerError("client-billing.getOrCreateCustomer.deleteOrphan", delErr);
        }
        const { data: winner } = await sb
          .from("client_stripe_customers")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (winner?.stripe_customer_id) {
          return { ok: true, data: winner.stripe_customer_id };
        }
        return { ok: false, error: "Could not acquire Stripe customer record." };
      }
      logServerError("client-billing.getOrCreateCustomer.insert", error);
      try {
        await stripe.customers.del(customer.id);
      } catch (delErr) {
        logServerError("client-billing.getOrCreateCustomer.deleteOnInsertFail", delErr);
      }
      return { ok: false, error: "Could not record Stripe customer locally." };
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
            // TODO(L5): make this configurable when multi-currency support is added — currently no per-tenant default currency column exists
            currency: "usd",
            unit_amount: VERIFICATION_FEE_CENTS,
            product_data: {
              name: "Account Verification",
              description:
                "One-time verification fee. Upgrades your trust badge to Verified so talents can recognize a reviewed account.",
            },
          },
        },
      ],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings?trust=verified`,
      cancel_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings`,
      // Allow promotion codes for early-access discounts (L4 parity with workspace/talent flows)
      allow_promotion_codes: true,
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
      // Adaptive Pricing: auto-converts to customer's local currency at checkout.
      adaptive_pricing: { enabled: true },
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
            // TODO(L5): make this configurable when multi-currency support is added — currently no per-tenant default currency column exists
            currency: "usd",
            unit_amount: opts.amountCents,
            product_data: {
              name: `Account Balance — $${dollars}`,
              description:
                `Add $${dollars} to your account balance. Funded balances can qualify you for Silver and Gold trust tiers and help signal booking readiness.`,
            },
          },
        },
      ],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings?trust=funded&amount=${dollars}`,
      cancel_url: `${opts.appBaseUrl}/${opts.tenantSlug}/client/settings`,
      // Allow promotion codes for early-access discounts (L4 parity with workspace/talent flows)
      allow_promotion_codes: true,
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
      // Adaptive Pricing: auto-converts to customer's local currency at checkout.
      adaptive_pricing: { enabled: true },
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
  // Optional: the Stripe Checkout Session id that triggered this sync.
  // Currently unused by the DB layer but kept in the signature so future
  // tightening (e.g. recording the session id on `client_trust_state`)
  // can land without webhook changes.
  _sessionId?: string,
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

    const row = existing as ClientTrustSignalRow | null;
    // Audit H3: preserve the ORIGINAL verified_at across webhook retries.
    // Stripe can deliver the same event multiple times; verified_at must
    // reflect first-verification, not last-webhook.
    const verifiedAt = row?.verified_at ?? new Date().toISOString();
    const fundedBalanceCents = Number(row?.funded_balance_cents ?? 0);
    const manualOverride = row?.manual_override ?? null;

    const result = await writeClientTrustLevel(
      userId,
      tenantId,
      { verifiedAt, fundedBalanceCents, manualOverride },
      sb,
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
 * Audit H7 — Refund handler: a balance top-up was refunded by Stripe.
 *
 * Looks up the original deposit ledger row by `stripe_payment_intent_id`,
 * inserts a matching `refund` row with negative `amount_cents` (the refunded
 * amount, capped at the original deposit), and re-reconciles the
 * `funded_balance_cents` from the ledger sum.
 *
 * Idempotent on (stripe_payment_intent_id, charge_id) — a second
 * `charge.refunded` delivery for the same partial refund won't double-debit
 * because the ledger compares cumulative refunds against the deposit.
 */
export async function syncClientBalanceRefundToDb(opts: {
  paymentIntentId: string;
  refundedAmountCents: number; // cumulative from charge.amount_refunded
  chargeId: string;
}): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    // Find the original deposit
    const { data: deposit, error: depositError } = await sb
      .from("client_balance_ledger")
      .select("id, user_id, tenant_id, amount_cents")
      .eq("stripe_payment_intent_id", opts.paymentIntentId)
      .eq("entry_type", "deposit")
      .maybeSingle();

    if (depositError) {
      logServerError("client-billing.syncRefund.depositLookup", depositError);
      return { ok: false, error: "Failed to find original deposit." };
    }

    if (!deposit) {
      // No tracked deposit for this payment_intent — refund is on a charge
      // that didn't come from a balance top-up. Acknowledge silently.
      return { ok: true, data: undefined };
    }

    const depositRow = deposit as { id: string; user_id: string; tenant_id: string; amount_cents: number };
    const depositCents = Number(depositRow.amount_cents);

    // Sum existing refund rows for this payment_intent so a partial refund
    // event followed by a full refund event doesn't double-count.
    const { data: priorRefunds, error: priorError } = await sb
      .from("client_balance_ledger")
      .select("amount_cents")
      .eq("stripe_payment_intent_id", opts.paymentIntentId)
      .eq("entry_type", "refund");

    if (priorError) {
      logServerError("client-billing.syncRefund.priorLookup", priorError);
      return { ok: false, error: "Failed to read prior refund rows." };
    }

    const priorRefundedCents = ((priorRefunds ?? []) as Array<{ amount_cents: number | string }>)
      .reduce((sum, row) => sum + Math.abs(Number(row.amount_cents ?? 0)), 0);

    const targetCumulativeCents = Math.min(opts.refundedAmountCents, depositCents);
    const deltaCents = targetCumulativeCents - priorRefundedCents;

    if (deltaCents <= 0) {
      // Already fully recorded.
      return { ok: true, data: undefined };
    }

    const { error: refundInsertError } = await sb.from("client_balance_ledger").insert({
      user_id:                  depositRow.user_id,
      tenant_id:                depositRow.tenant_id,
      amount_cents:             -deltaCents, // negative — sign-check enforces
      entry_type:               "refund",
      stripe_payment_intent_id: opts.paymentIntentId,
      note:                     `Refund of ${opts.chargeId}`,
    });

    if (refundInsertError) {
      logServerError("client-billing.syncRefund.insert", refundInsertError);
      return { ok: false, error: "Failed to record refund." };
    }

    return reconcileClientBalanceFromLedger(sb, depositRow.user_id, depositRow.tenant_id);
  } catch (err) {
    logServerError("client-billing.syncRefund", err);
    return { ok: false, error: "Unexpected error syncing refund." };
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
    if (opts.paymentIntentId) {
      const { data: existingLedger, error: existingLedgerError } = await sb
        .from("client_balance_ledger")
        .select("id, user_id, tenant_id, amount_cents, entry_type")
        .eq("stripe_payment_intent_id", opts.paymentIntentId)
        .maybeSingle();

      if (existingLedgerError) {
        logServerError("client-billing.syncTopup.idempotency", existingLedgerError);
        return { ok: false, error: "Failed to verify balance deposit." };
      }

      if (existingLedger) {
        return handleExistingTopupLedger(sb, opts, existingLedger);
      }
    }

    // Append ledger entry
    const { error: ledgerError } = await sb.from("client_balance_ledger").insert({
      user_id: opts.userId,
      tenant_id: opts.tenantId,
      amount_cents: opts.amountCents,
      entry_type: "deposit",
      stripe_payment_intent_id: opts.paymentIntentId,
    });

    if (ledgerError) {
      if (opts.paymentIntentId && (ledgerError as { code?: string }).code === "23505") {
        const { data: duplicateLedger, error: duplicateError } = await sb
          .from("client_balance_ledger")
          .select("id, user_id, tenant_id, amount_cents, entry_type")
          .eq("stripe_payment_intent_id", opts.paymentIntentId)
          .maybeSingle();

        if (duplicateError) {
          logServerError("client-billing.syncTopup.duplicateLookup", duplicateError);
          return { ok: false, error: "Failed to verify duplicate balance deposit." };
        }

        if (duplicateLedger) {
          return handleExistingTopupLedger(sb, opts, duplicateLedger);
        }
      }

      logServerError("client-billing.syncTopup.ledger", ledgerError);
      return { ok: false, error: "Failed to record balance deposit." };
    }

    return reconcileClientBalanceFromLedger(sb, opts.userId, opts.tenantId);
  } catch (err) {
    logServerError("client-billing.syncTopup", err);
    return { ok: false, error: "Unexpected error syncing balance top-up." };
  }
}

async function handleExistingTopupLedger(
  sb: SupabaseClient,
  opts: {
    userId: string;
    tenantId: string;
    amountCents: number;
    paymentIntentId: string | null;
  },
  ledger: unknown,
): Promise<BillingResult<void>> {
  const row = ledger as {
    user_id: string;
    tenant_id: string;
    amount_cents: number;
    entry_type: string;
  };
  if (
    row.user_id === opts.userId &&
    row.tenant_id === opts.tenantId &&
    Number(row.amount_cents) === opts.amountCents &&
    row.entry_type === "deposit"
  ) {
    return reconcileClientBalanceFromLedger(sb, opts.userId, opts.tenantId);
  }

  logServerError(
    "client-billing.syncTopup.idempotency_mismatch",
    `Payment intent ${opts.paymentIntentId} already exists with different ledger metadata.`,
  );
  return { ok: false, error: "Balance deposit already exists with different metadata." };
}

async function reconcileClientBalanceFromLedger(
  sb: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<BillingResult<void>> {
  try {
    const { data: existing } = await sb
      .from("client_trust_state")
      .select("funded_balance_cents, manual_override, verified_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const { data: ledgerRows, error: ledgerError } = await sb
      .from("client_balance_ledger")
      .select("amount_cents")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);

    if (ledgerError) {
      logServerError("client-billing.reconcileBalance.ledger", ledgerError);
      return { ok: false, error: "Failed to reconcile balance deposit." };
    }

    const fundedBalanceCents = ((ledgerRows ?? []) as Array<{ amount_cents: number | string }>)
      .reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    const row = existing as ClientTrustSignalRow | null;
    const verifiedAt = row?.verified_at ?? null;
    const manualOverride = row?.manual_override ?? null;

    const result = await writeClientTrustLevel(
      userId,
      tenantId,
      { verifiedAt, fundedBalanceCents, manualOverride },
      sb,
    );

    if (!result) {
      return { ok: false, error: "Failed to update trust state." };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("client-billing.reconcileBalance", err);
    return { ok: false, error: "Unexpected error reconciling balance." };
  }
}
