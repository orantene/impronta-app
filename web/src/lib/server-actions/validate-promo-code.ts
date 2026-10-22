"use server";

/**
 * validatePromoCode (TUL-833) · "what would this subscription code do to this
 * plan?" for the upgrade modal's "Have a code?" box. Read-only: it redeems
 * nothing and calls no Stripe API. Checkout re-validates the code on its own
 * (`resolveCheckoutDiscount`), so a preview here is never authority.
 *
 * Reuses `validateDiscount` (the existing product_discounts validator); there
 * is no second promo store. Not the talent-facing Promos engine (TUL-934).
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { validateDiscount } from "@/lib/server-actions/admin-product-discounts";
import { TALENT_TIER_SLUG, INTERVAL_COLUMN } from "@/lib/stripe/price-catalog";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";
import { isStripeConfigured } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import { discountAppliesToSubject } from "@/lib/billing/checkout-discounts";
import { loadActiveTierId, loadCanonicalUsdPriceCents } from "@/lib/billing/promo-catalog-reads";
import {
  computePromoPreview,
  discountAppliesToTier,
  PROMO_ERROR_MESSAGES,
  promoErrorFromReason,
  isPromoSyncedToStripe,
  type PromoErrorCode,
  type PromoPreview,
} from "@/lib/billing/promo-preview";

export type ValidatePromoCodeResult =
  | { ok: true; preview: PromoPreview }
  | { ok: false; code: PromoErrorCode; message: { en: string; es: string } };

function fail(code: PromoErrorCode): ValidatePromoCodeResult {
  return { ok: false, code, message: PROMO_ERROR_MESSAGES[code] };
}

export async function validatePromoCode(
  code: string,
  plan: TalentPlanKey,
  interval: "month" | "year",
): Promise<ValidatePromoCodeResult> {
  const tierSlug = TALENT_TIER_SLUG[plan];
  if (!tierSlug || (interval !== "month" && interval !== "year")) return fail("invalid");

  const validated = await validateDiscount(String(code ?? ""));
  if (!validated.ok) {
    return fail(promoErrorFromReason(validated.reason));
  }
  const d = validated.discount;
  if (!isPromoSyncedToStripe(d, isStripeConfigured())) return fail("invalid");
  if (!discountAppliesToSubject(d.appliesFamily, "talent")) return fail("not_applicable");

  const admin = createServiceRoleClient();
  if (!admin) return fail("invalid");
  try {
    const tierId = await loadActiveTierId(admin, tierSlug);
    if (!tierId || !discountAppliesToTier(d.appliesTo, tierId)) return fail("not_applicable");

    const cents = await loadCanonicalUsdPriceCents(
      admin,
      tierId,
      INTERVAL_COLUMN[interval === "year" ? "annual" : "monthly"],
    );
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents <= 0) {
      return fail("not_applicable");
    }
    return { ok: true, preview: computePromoPreview(d, cents) };
  } catch (err) {
    logServerError("validate-promo-code", err);
    return fail("invalid");
  }
}
