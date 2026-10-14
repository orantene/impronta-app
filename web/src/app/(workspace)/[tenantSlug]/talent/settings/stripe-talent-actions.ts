"use server";

/**
 * Stripe talent billing server actions — personal-page plan upgrade + portal.
 *
 * talent_basic (free) → no Stripe. All plan_key === "talent_basic" profiles stay free.
 * talent_pro / talent_portfolio → Stripe Checkout.
 * Existing subscribers → Stripe Billing Portal.
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  createTalentCheckoutSession,
  createTalentBillingPortalSession,
} from "@/lib/stripe/talent-billing";
import { deriveAppBaseUrl } from "@/lib/stripe/utils";
import { resolveTalentPriceId } from "@/lib/stripe/price-catalog";
import { yearlyCheckoutPlans } from "@/lib/billing/checkout-interval";
import { isAlreadySubscribedError } from "@/lib/billing/duplicate-subscription";
import { signCheckoutReturn } from "@/lib/billing/checkout-return";
import { isSafeReturnPath } from "@/lib/billing/trial-door";
import { getRequestLocale } from "@/i18n/request-locale";
import { loadTalentSelfProfile } from "../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

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
  /**
   * Optional `?promo=` carried from the page the button was clicked on. Same
   * contract as the workspace action: browser-supplied, re-validated inside
   * `resolveCheckoutDiscount` before it can discount anything.
   */
  promoCode?: string | null,
  /**
   * Where to land after Checkout: the spot the trial door opened from. A
   * browser-supplied path, accepted only as a same-origin path inside this
   * workspace and signed here so only what this action issued can round-trip.
   */
  returnPath?: string | null,
  /** TUL-830 toggle ("month" | "year"). Parsed server-side; yearly needs a catalog price. */
  interval?: string | null,
): Promise<TalentBillingActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available yet." };
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
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
    // The app already resolved this talent's language; hand it to Stripe so
    // Checkout does not fall back to guessing from the browser.
    locale: await getRequestLocale(),
    promoCode: promoCode ?? null,
    returnToken: isSafeReturnPath(returnPath, tenantSlug)
      ? signCheckoutReturn({ subjectId: talentProfile.id, path: returnPath })
      : null,
    interval: interval ?? null,
  });

  // TUL-830: an existing active/trialing/past_due plan is never sent through
  // Checkout again (that would mint a second subscription); change it in the portal.
  if (!result.ok && isAlreadySubscribedError(result.error)) {
    const portal = await createTalentBillingPortalSession({
      userId: session.user.id,
      tenantSlug,
      appBaseUrl,
      locale: await getRequestLocale(),
    });
    if (portal.ok) return { ok: true, redirectUrl: portal.data.url };
    logServerError("stripe-talent-actions.startUpgrade.portal", portal.error);
    return { ok: false, error: result.error };
  }

  if (!result.ok) {
    logServerError("stripe-talent-actions.startUpgrade", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}

/**
 * Paid talent plans that have a yearly catalog price (TUL-830). The upgrade
 * modal offers the yearly toggle only for these; read-only, no ids accepted.
 */
export async function loadTalentYearlyCheckoutPlans(): Promise<TalentPlanKey[]> {
  const session = await getCachedActorSession();
  if (!session.user) return [];
  return yearlyCheckoutPlans(
    ["talent_pro", "talent_portfolio"] as const,
    (k) => resolveTalentPriceId(k, "annual"),
  );
}

/**
 * Opens the Stripe Billing Portal for an existing talent subscriber.
 */
export async function openTalentSubscriptionPortal(
  tenantSlug: string,
): Promise<TalentBillingActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
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
    locale: await getRequestLocale(),
  });

  if (!result.ok) {
    logServerError("stripe-talent-actions.openPortal", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, redirectUrl: result.data.url };
}
