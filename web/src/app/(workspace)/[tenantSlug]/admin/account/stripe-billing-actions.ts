"use server";

/**
 * Stripe billing server actions — workspace plan upgrade + portal.
 *
 * These replace `changeWorkspacePlan` for PAID plan upgrades. The direct DB
 * write in billing-actions.ts stays for free-tier downgrades (no Stripe
 * subscription needed).
 *
 * Flow:
 *   Paid upgrade  → startWorkspaceUpgrade() → Stripe Checkout URL → redirect
 *   Manage sub    → openSubscriptionPortal() → Billing Portal URL → redirect
 *   Free downgrade → changeWorkspacePlan("free") (existing, no Stripe)
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  createWorkspaceCheckoutSession,
  createBillingPortalSession,
} from "@/lib/stripe/workspace-billing";
import { logServerError } from "@/lib/server/safe-error";
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deriveAppBaseUrl(): Promise<string> {
  // In production: use the request host from Next.js headers.
  // In development: fall back to localhost.
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type BillingActionResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Initiates a Stripe Checkout session for upgrading to a paid workspace plan.
 *
 * Authorization: caller must have `manage_billing` capability.
 * Returns a Stripe Checkout URL. The client redirects to it.
 */
export async function startWorkspaceUpgrade(
  planKey: WorkspacePlanKey,
  tenantSlug: string,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available yet. Contact support to upgrade." };
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageBilling) {
    return { ok: false, error: "You don't have permission to manage billing." };
  }

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createWorkspaceCheckoutSession({
    tenantId:    scope.tenantId,
    planKey,
    ownerEmail:  session.user.email ?? "",
    displayName: scope.membership.display_name ?? tenantSlug,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-billing-actions.startUpgrade", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}

/**
 * Creates a Stripe Billing Portal session for an existing subscriber.
 * Use this for: payment method updates, invoice downloads, plan cancellation.
 *
 * Authorization: caller must have `manage_billing` capability.
 */
export async function openSubscriptionPortal(
  tenantSlug: string,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing portal is not available." };
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageBilling) {
    return { ok: false, error: "You don't have permission to manage billing." };
  }

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createBillingPortalSession({
    tenantId: scope.tenantId,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-billing-actions.openPortal", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}
