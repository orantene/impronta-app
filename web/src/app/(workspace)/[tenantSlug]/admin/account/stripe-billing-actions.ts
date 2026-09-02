"use server";

/**
 * Stripe billing server actions — workspace plan upgrade + portal.
 *
 * These replace `changeWorkspacePlan` for PAID plan upgrades. The direct DB
 * write in billing-actions.ts stays for free-tier downgrades (no Stripe
 * subscription needed).
 *
 * Flow:
 *   Studio / Agency      → startWorkspaceUpgrade()      → { ok, redirectUrl } → client redirects to Stripe Checkout
 *   Network (with price) → startWorkspaceUpgrade()      → { ok, redirectUrl } → client redirects to Stripe Checkout
 *   Network (no price)   → startWorkspaceUpgrade()      → { ok:false, noStripe:true } → client opens sales mailto
 *   Manage sub           → openSubscriptionPortal()     → { ok, redirectUrl } → client redirects to Billing Portal
 *   Free downgrade       → changeWorkspacePlan("free")  (existing, no Stripe)
 */

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import { loadTenantCampaignPromo } from "@/lib/billing/tenant-campaign-promo";
import {
  createWorkspaceCheckoutSession,
  createBillingPortalSession,
  hasLiveWorkspaceSubscription,
} from "@/lib/stripe/workspace-billing";
import { deriveAppBaseUrl } from "@/lib/stripe/utils";
import { getRequestLocale } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";
import { type WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { resolveWorkspacePriceId } from "@/lib/stripe/price-catalog";

// ─── Actions ──────────────────────────────────────────────────────────────────

export type BillingActionResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string; noStripe?: boolean };

/**
 * Initiates a Stripe Checkout session for upgrading to a paid workspace plan.
 *
 * Authorization: caller must have `manage_billing` capability.
 * Returns a Stripe Checkout URL. The client redirects to it.
 */
export async function startWorkspaceUpgrade(
  planKey: WorkspacePlanKey,
  tenantSlug: string,
  /**
   * Optional `?promo=` carried from the page the button was clicked on, so a
   * campaign link works for an EXISTING customer the same way it does at
   * signup. Browser-supplied and re-validated server-side by
   * `resolveCheckoutDiscount`; never trusted as given.
   */
  promoCode?: string | null,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available yet. Contact support to upgrade." };
  }

  // Network has no catalog price, so it is not self-serve. Giving it an active
  // price row in the pricing dashboard is what would flip it.
  if (planKey === "network" && !(await resolveWorkspacePriceId("network", "monthly"))) {
    return { ok: false, error: "network_no_price", noStripe: true };
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

  // A workspace that ALREADY has a live Stripe subscription must not be sent
  // through Checkout again. `mode: "subscription"` Checkout always creates a
  // NEW subscription, so an "upgrade" would leave the customer paying for two
  // plans at once — the finance audit's P0-4, second half. Stripe's own Billing
  // Portal is the supported way to change the plan on an existing
  // subscription, so send them there instead.
  if (await hasLiveWorkspaceSubscription(scope.tenantId)) {
    const portal = await createBillingPortalSession({
      tenantId: scope.tenantId,
      appBaseUrl: await deriveAppBaseUrl(),
      tenantSlug,
      locale: await getRequestLocale(),
    });
    if (!portal.ok) {
      logServerError("stripe-billing-actions.startUpgrade.portal", portal.error);
      return { ok: false, error: "Couldn't open billing. Contact support and nothing will be charged twice." };
    }
    return { ok: true, redirectUrl: portal.data.url };
  }

  const appBaseUrl = await deriveAppBaseUrl();

  // A campaign code reaches an upgrade two ways: on the URL the operator just
  // followed, or — far more often — from the signup that created this
  // workspace months ago. The free-first funnel means most people who claimed
  // an offer never had a checkout to spend it at, so the recorded code IS the
  // promise. Explicit `?promo=` still wins.
  const campaignPromo =
    promoCode ?? (await loadTenantCampaignPromo(scope.tenantId));

  const result = await createWorkspaceCheckoutSession({
    tenantId:    scope.tenantId,
    planKey,
    ownerEmail:  session.user.email ?? "",
    displayName: scope.membership.display_name ?? tenantSlug,
    tenantSlug,
    appBaseUrl,
    // The app already resolved this owner's language; hand it to Stripe so
    // Checkout does not fall back to guessing from the browser.
    locale: await getRequestLocale(),
    promoCode: campaignPromo,
    buyerUserId: session.user.id,
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
    locale: await getRequestLocale(),
  });

  if (!result.ok) {
    logServerError("stripe-billing-actions.openPortal", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}
