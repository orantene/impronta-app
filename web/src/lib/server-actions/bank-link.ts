"use server";

import { revalidatePath } from "next/cache";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "./result";

/**
 * F.5 — Wire deposit / bank link.
 *
 * Implementation uses Stripe Financial Connections (Stripe's Plaid-
 * equivalent) for US bank accounts and SEPA Direct Debit setup for
 * EU. Both flow through Stripe's PaymentMethod / SetupIntent so the
 * downstream charge code (subscription auto-pay, booking deposit) is
 * the same as F.4 cards.
 *
 * Why not pure Plaid? Stripe FC gives us ACH + SEPA in one SDK with
 * lower per-deposit fees (~0.8% ACH cap'd at $5, vs Stripe Card 2.9%
 * + $0.30). Critical for the €5k booking case where card fees were
 * eating €150.
 *
 * Three actions:
 *   1. createBankAccountSetupIntent — returns a client_secret the UI
 *      uses with Stripe Financial Connections + Elements
 *   2. listBankAccounts — filters PaymentMethods of type
 *      'us_bank_account' / 'sepa_debit' from F.4's list path
 *   3. createDepositPaymentIntent(bookingId, amountCents) — generates
 *      a PaymentIntent in 'requires_confirmation' state so the
 *      booking deposit can be collected when ready
 */

export type BankAccountSummary = {
  id: string;
  type: "us_bank_account" | "sepa_debit";
  bankName: string | null;
  last4: string | null;
  /** Whether this is the customer's default. */
  isDefault: boolean;
};

async function getCustomerId(tenantId: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: existing } = await admin
    .from("workspace_subscriptions")
    .select("stripe_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (existing as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
}

// ─── 1. SetupIntent for connecting a bank account ─────────────────────────

export async function createBankAccountSetupIntent(opts?: {
  /** "us_bank_account" for ACH, "sepa_debit" for European IBAN. */
  type?: "us_bank_account" | "sepa_debit";
}): Promise<ServerActionResult<{ clientSecret: string; customerId: string }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    const customerId = await getCustomerId(auth.tenantId);
    if (!customerId) {
      return {
        ok: false,
        error: "Connect a card first to initialize your Stripe customer, then add a bank.",
        reason: "validation_failed",
      };
    }

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const type = opts?.type ?? "us_bank_account";

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: [type],
      usage: "off_session",
      // For US ACH we want the Financial Connections instant verify flow.
      payment_method_options:
        type === "us_bank_account"
          ? {
              us_bank_account: {
                financial_connections: { permissions: ["payment_method"] },
              },
            }
          : undefined,
    });

    if (!setupIntent.client_secret) {
      return { ok: false, error: "Stripe didn't return a client secret.", reason: "unexpected" };
    }

    return {
      ok: true,
      data: { clientSecret: setupIntent.client_secret, customerId },
    };
  } catch (err) {
    logServerError("bank-link.createSetupIntent", err);
    return { ok: false, error: "Could not start bank connection.", reason: "unexpected" };
  }
}

// ─── 2. List connected bank accounts ──────────────────────────────────────

export async function listBankAccounts(): Promise<
  ServerActionResult<{ accounts: BankAccountSummary[] }>
> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    const customerId = await getCustomerId(auth.tenantId);
    if (!customerId) return { ok: true, data: { accounts: [] } };

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const [achList, sepaList, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: "us_bank_account", limit: 10 }),
      stripe.paymentMethods.list({ customer: customerId, type: "sepa_debit", limit: 10 }),
      stripe.customers.retrieve(customerId),
    ]);

    const defaultPmId =
      typeof customer !== "string" && !customer.deleted
        ? (customer.invoice_settings?.default_payment_method as string | null) ?? null
        : null;

    const accounts: BankAccountSummary[] = [
      ...achList.data.map(
        (pm): BankAccountSummary => ({
          id: pm.id,
          type: "us_bank_account",
          bankName: pm.us_bank_account?.bank_name ?? null,
          last4: pm.us_bank_account?.last4 ?? null,
          isDefault: pm.id === defaultPmId,
        }),
      ),
      ...sepaList.data.map(
        (pm): BankAccountSummary => ({
          id: pm.id,
          type: "sepa_debit",
          bankName: pm.sepa_debit?.bank_code ?? null,
          last4: pm.sepa_debit?.last4 ?? null,
          isDefault: pm.id === defaultPmId,
        }),
      ),
    ];

    return { ok: true, data: { accounts } };
  } catch (err) {
    logServerError("bank-link.list", err);
    return { ok: false, error: "Could not load bank accounts.", reason: "unexpected" };
  }
}

// ─── 3. Booking deposit PaymentIntent ─────────────────────────────────────

export async function createDepositPaymentIntent(input: {
  bookingId: string;
  amountCents: number;
  currency: string;
  /** Optional — defaults to default PM. */
  paymentMethodId?: string;
}): Promise<ServerActionResult<{ clientSecret: string; paymentIntentId: string }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    if (input.amountCents <= 0) {
      return { ok: false, error: "Deposit amount must be positive.", reason: "validation_failed" };
    }
    if (!/^[A-Z]{3}$/.test(input.currency.toUpperCase())) {
      return { ok: false, error: "Invalid currency code.", reason: "validation_failed" };
    }

    const customerId = await getCustomerId(auth.tenantId);
    if (!customerId) {
      return { ok: false, error: "No Stripe customer found.", reason: "not_found" };
    }

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(input.amountCents),
      currency: input.currency.toLowerCase(),
      customer: customerId,
      payment_method: input.paymentMethodId,
      // Allow multiple PM types so the customer can pick at confirm time.
      automatic_payment_methods: { enabled: true },
      metadata: {
        booking_id: input.bookingId,
        tenant_id: auth.tenantId,
        purpose: "booking_deposit",
      },
    });

    if (!paymentIntent.client_secret) {
      return { ok: false, error: "Stripe didn't return a client secret.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    };
  } catch (err) {
    logServerError("bank-link.createDepositPaymentIntent", err);
    return { ok: false, error: "Could not create deposit.", reason: "unexpected" };
  }
}
