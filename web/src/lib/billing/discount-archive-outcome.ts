/**
 * discount-archive-outcome.ts (TUL-833 audit) · what "disable this code" must
 * report once the Stripe half has run.
 *
 * `archiveDiscount` flips our row inactive first and then deactivates the
 * Stripe promotion code. It used to ignore the second result. That mattered:
 * Checkout falls back to `allow_promotion_codes`, so a code that is off in our
 * table but still active in Stripe can still be typed in Stripe's own box and
 * discounts the purchase. A failed Stripe step must therefore reach the
 * operator, who can retry (the retry is idempotent) instead of believing the
 * campaign is closed.
 */
import type { DiscountArchiveResult } from "@/lib/pricing/stripe-discount-sync";

export function archiveOutcome(stripe: DiscountArchiveResult): { ok: true } | { ok: false; error: string } {
  if (stripe.ok) return { ok: true };
  return {
    ok: false,
    error:
      "The code is off in Tulala, but Stripe did not confirm turning it off, so it may still work in Stripe's own code box. " +
      "Try again. If it keeps failing, deactivate the promotion code in the Stripe dashboard. " +
      `(${stripe.error})`,
  };
}
