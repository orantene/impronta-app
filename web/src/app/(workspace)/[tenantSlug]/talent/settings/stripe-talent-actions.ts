"use server";

/**
 * Stripe talent billing server actions — personal-page plan upgrade + portal.
 *
 * talent_basic (free) → no Stripe. All plan_key === "talent_basic" profiles stay free.
 * talent_pro / talent_portfolio → Stripe Checkout.
 * Existing subscribers → Stripe Billing Portal.
 */

import { headers } from "next/headers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  createTalentCheckoutSession,
  createTalentBillingPortalSession,
} from "@/lib/stripe/talent-billing";
import { loadTalentSelfProfile } from "../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type TalentBillingActionResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Starts a Stripe Checkout session for upgrading the talent's personal page.
 * Only talent_pro and talent_portfolio are paid — talent_basic is free.
 */
export async function startTalentUpgrade(
  planKey: TalentPlanKey,
  tenantSlug: string,
): Promise<TalentBillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available yet." };
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) return { ok: false, error: "Talent profile not found." };

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createTalentCheckoutSession({
    talentProfileId: talentProfile.id,
    userId:          session.user.id,
    planKey,
    email:           session.user.email ?? "",
    displayName:     talentProfile.displayName,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-talent-actions.startUpgrade", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}

/**
 * Opens the Stripe Billing Portal for an existing talent subscriber.
 */
export async function openTalentSubscriptionPortal(
  tenantSlug: string,
): Promise<TalentBillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing portal is not available." };
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createTalentBillingPortalSession({
    userId: session.user.id,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    logServerError("stripe-talent-actions.openPortal", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}
