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
import { logServerError } from "@/lib/server/safe-error";
import { discountAppliesToSubject } from "@/lib/billing/checkout-discounts";
import {
  computePromoPreview,
  discountAppliesToTier,
  PROMO_ERROR_MESSAGES,
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
    const expired = /expired|no longer|started|limit/i.test(validated.reason);
    return fail(expired ? "expired" : "invalid");
  }
  const d = validated.discount;
  if (!discountAppliesToSubject(d.appliesFamily, "talent")) return fail("not_applicable");

  const admin = createServiceRoleClient();
  if (!admin) return fail("invalid");
  try {
    const { data: tier } = await admin
      .from("product_tiers")
      .select("id")
      .eq("slug", tierSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!tier || !discountAppliesToTier(d.appliesTo, tier.id)) return fail("not_applicable");

    const { data: prices, error } = await admin
      .from("product_prices")
      .select("unit_amount, valid_from, valid_until")
      .eq("tier_id", tier.id)
      .eq("currency", "USD")
      .eq("interval", INTERVAL_COLUMN[interval === "year" ? "annual" : "monthly"])
      .eq("is_active", true)
      .is("archived_at", null);
    if (error) throw error;
    const canonical = (prices ?? []).find(
      (p) => p.valid_from === null && p.valid_until === null,
    );
    const cents = canonical?.unit_amount;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents <= 0) {
      return fail("not_applicable");
    }
    return { ok: true, preview: computePromoPreview(d, cents) };
  } catch (err) {
    logServerError("validate-promo-code", err);
    return fail("invalid");
  }
}
