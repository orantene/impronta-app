"use server";

/**
 * Stripe client trust server actions — verification fee + balance top-up.
 *
 * startClientVerification → $5 Stripe Checkout → webhook sets verified_at
 * startClientBalanceTopup → variable Stripe Checkout → webhook adds balance
 */

import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  createClientVerificationCheckoutSession,
  createClientBalanceTopupCheckoutSession,
  type AllowedTopupAmount,
  ALLOWED_TOPUP_AMOUNTS_CENTS,
} from "@/lib/stripe/client-billing";
import { deriveAppBaseUrl } from "@/lib/stripe/utils";
import { loadClientSelfProfile } from "../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientTrustActionResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

async function resolveContext(tenantSlug: string) {
  if (!isStripeConfigured()) return { ok: false as const, error: "Billing is not available yet." };

  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
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

  // Audit H4 — prevent double-charge: a client who is already verified should
  // not be able to start a second checkout session, even from a stale tab.
  // Stripe Checkout idempotency wouldn't catch this because each click creates
  // a new Session id; the only safe place to gate is server-side here.
  const sb = createServiceRoleClient();
  if (sb) {
    const { data: existingTrust } = await sb
      .from("client_trust_state")
      .select("verified_at")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if ((existingTrust as { verified_at?: string | null } | null)?.verified_at) {
      return {
        ok: false,
        error: "Your account is already verified — no further fee is required.",
      };
    }
  }

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
