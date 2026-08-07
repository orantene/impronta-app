"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "./result";

/**
 * F.4 — Payment method editor.
 *
 * Three workspace-side actions + one helper:
 *   - listPaymentMethods()   → all Stripe PMs attached to the tenant's
 *                              customer + which is default
 *   - createSetupIntent()    → returns a client_secret the UI uses with
 *                              Stripe Elements to confirm a card
 *   - setDefaultPaymentMethod(pmId)
 *   - detachPaymentMethod(pmId)
 *
 * All actions short-circuit gracefully when Stripe isn't configured
 * (dev / preview without keys) — returns { ok: false, reason:
 * "payment_required" } so the UI can render the "Set up payments first"
 * empty state.
 *
 * Stripe Customer lookup: workspace_subscriptions.stripe_customer_id
 * (one row per tenant). Created lazily when missing.
 */

export type PaymentMethodSummary = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  /** "card" | "us_bank_account" | "sepa_debit" | ... */
  type: string;
};

export type ListPaymentMethodsResult = ServerActionResult<{
  customerId: string;
  paymentMethods: PaymentMethodSummary[];
}>;

async function getOrCreateCustomerId(tenantId: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  // Look for existing customer.
  const { data: existing } = await admin
    .from("workspace_subscriptions")
    .select("stripe_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const existingId = (existing as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (existingId) return existingId;

  // Create new customer.
  const stripe = getStripe();
  if (!stripe) return null;

  const { data: agency } = await admin
    .from("agencies")
    .select("display_name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  const displayName = (agency as { display_name?: string | null } | null)?.display_name ?? "Workspace";

  const customer = await stripe.customers.create({
    name: displayName,
    metadata: { tenant_id: tenantId, source: "workspace" },
  });

  await admin.from("workspace_subscriptions").upsert(
    {
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );

  return customer.id;
}

// ─── 1. List ──────────────────────────────────────────────────────────────

export async function listPaymentMethods(): Promise<ListPaymentMethodsResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured yet.", reason: "payment_required" };
    }

    const customerId = await getOrCreateCustomerId(auth.tenantId);
    if (!customerId) {
      return { ok: false, error: "Could not resolve Stripe customer.", reason: "unexpected" };
    }

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const [pmList, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, limit: 20 }),
      stripe.customers.retrieve(customerId),
    ]);

    const defaultPmId =
      typeof customer !== "string" && !customer.deleted
        ? (customer.invoice_settings?.default_payment_method as string | null) ?? null
        : null;

    const paymentMethods: PaymentMethodSummary[] = pmList.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? pm.type,
      last4: pm.card?.last4 ?? "",
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
      isDefault: pm.id === defaultPmId,
      type: pm.type,
    }));

    return { ok: true, data: { customerId, paymentMethods } };
  } catch (err) {
    logServerError("payment-methods.list", err);
    return { ok: false, error: "Could not load payment methods.", reason: "unexpected" };
  }
}

// ─── 2. SetupIntent for adding a card ─────────────────────────────────────

export async function createSetupIntent(): Promise<
  ServerActionResult<{ clientSecret: string; customerId: string }>
> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    const customerId = await getOrCreateCustomerId(auth.tenantId);
    if (!customerId) return { ok: false, error: "Customer resolution failed.", reason: "unexpected" };

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    if (!setupIntent.client_secret) {
      return { ok: false, error: "Stripe didn't return a client secret.", reason: "unexpected" };
    }

    return {
      ok: true,
      data: { clientSecret: setupIntent.client_secret, customerId },
    };
  } catch (err) {
    logServerError("payment-methods.createSetupIntent", err);
    return { ok: false, error: "Could not start card setup.", reason: "unexpected" };
  }
}

// ─── 3. Set default ───────────────────────────────────────────────────────

export async function setDefaultPaymentMethod(
  paymentMethodId: string,
): Promise<ServerActionResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    const customerId = await getOrCreateCustomerId(auth.tenantId);
    if (!customerId) return { ok: false, error: "Customer resolution failed.", reason: "unexpected" };

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("payment-methods.setDefault", err);
    return { ok: false, error: "Could not set default.", reason: "unexpected" };
  }
}

// ─── 4. Detach (remove) ───────────────────────────────────────────────────

export async function detachPaymentMethod(
  paymentMethodId: string,
): Promise<ServerActionResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payments are not configured.", reason: "payment_required" };
    }

    // Verify the PM belongs to this tenant's customer.
    const customerId = await getOrCreateCustomerId(auth.tenantId);
    if (!customerId) return { ok: false, error: "Customer resolution failed.", reason: "unexpected" };

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Stripe unavailable.", reason: "unexpected" };

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) {
      return { ok: false, error: "Not your payment method.", reason: "forbidden" };
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("payment-methods.detach", err);
    return { ok: false, error: "Could not remove payment method.", reason: "unexpected" };
  }
}
