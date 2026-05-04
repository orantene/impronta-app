"use server";

/**
 * Stripe client trust server actions — verification fee + balance top-up.
 *
 * startClientVerification → $5 Stripe Checkout → webhook sets verified_at
 * startClientBalanceTopup → variable Stripe Checkout → webhook adds balance
 */

import { headers } from "next/headers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  createClientVerificationCheckoutSession,
  createClientBalanceTopupCheckoutSession,
  type AllowedTopupAmount,
  ALLOWED_TOPUP_AMOUNTS_CENTS,
} from "@/lib/stripe/client-billing";
import { loadClientSelfProfile } from "../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientTrustActionResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deriveAppBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

async function resolveContext(tenantSlug: string) {
  if (!isStripeConfigured()) return { ok: false as const, error: "Billing is not available yet." };

  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) return { ok: false as const, error: "Client profile not found." };

  return {
    ok: true as const,
    userId: session.user.id,
    email: session.user.email ?? "",
    displayName: clientProfile.displayName,
    tenantId: scope.tenantId,
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Starts a $5 Stripe Checkout session for client identity verification.
 * On success, webhook promotes trust level from basic → verified.
 */
export async function startClientVerification(
  tenantSlug: string,
): Promise<ClientTrustActionResult> {
  const ctx = await resolveContext(tenantSlug);
  if (!ctx.ok) return ctx;

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createClientVerificationCheckoutSession({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    email: ctx.email,
    displayName: ctx.displayName,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-client-trust-actions.startVerification", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}

/**
 * Starts a Stripe Checkout session to top up the client's account balance.
 * amountCents must be one of the allowed preset values.
 * On success, webhook appends to ledger, increments balance, re-evaluates tier.
 */
export async function startClientBalanceTopup(
  amountCents: number,
  tenantSlug: string,
): Promise<ClientTrustActionResult> {
  // Validate amount server-side
  if (!(ALLOWED_TOPUP_AMOUNTS_CENTS as readonly number[]).includes(amountCents)) {
    return { ok: false, error: "Invalid top-up amount." };
  }

  const ctx = await resolveContext(tenantSlug);
  if (!ctx.ok) return ctx;

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createClientBalanceTopupCheckoutSession({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    email: ctx.email,
    displayName: ctx.displayName,
    amountCents: amountCents as AllowedTopupAmount,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-client-trust-actions.startTopup", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}
