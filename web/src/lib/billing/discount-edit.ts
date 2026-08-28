import "server-only";

/**
 * discount-edit.ts — the write behind `updateDiscount`.
 *
 * Lives here rather than in the action file for two reasons that point the same
 * way: `admin-product-discounts.ts` is at its 800-line cap, and its raw
 * `.from()` calls are grandfathered by COUNT in the eslint suppressions, so two
 * new ones there would break the ratchet for everybody. The action keeps the
 * gate and the schema; the table access lives with the other billing libs.
 *
 * Order is the house convention: database first, Stripe second. A failed
 * rename leaves the operator's label correct where it is read from, and only
 * the Stripe dashboard lagging.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { renameDiscountInStripe } from "@/lib/pricing/stripe-discount-sync";

export type DiscountEditInput = {
  discountId: string;
  name: string;
  campaign: string | null;
  perCustomerLimit: number;
  /** Already normalised to ISO, or null to clear the hold-back. */
  startsAt: string | null;
};

export type DiscountEditOutcome =
  | { ok: true }
  | { ok: false; error: string };

export async function applyDiscountEdit(
  input: DiscountEditInput,
  genericError: string,
): Promise<DiscountEditOutcome> {
  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("discount-edit.service-role", null);
    return { ok: false, error: genericError };
  }

  const load = await admin
    .from("product_discounts")
    .select("id, stripe_coupon_id, name")
    .eq("id", input.discountId)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, error: "Discount not found." };
  }
  const row = load.data as {
    id: string;
    stripe_coupon_id: string | null;
    name: string;
  };

  const upd = await admin
    .from("product_discounts")
    .update({
      name: input.name,
      campaign: input.campaign,
      per_customer_limit: input.perCustomerLimit,
      starts_at: input.startsAt,
    })
    .eq("id", row.id);
  if (upd.error) {
    logServerError("discount-edit.write", upd.error);
    return { ok: false, error: genericError };
  }

  // Courtesy mirror, best-effort: the database is what the app reads.
  if (input.name !== row.name) {
    await renameDiscountInStripe({
      stripeCouponId: row.stripe_coupon_id,
      name: input.name,
    });
  }

  return { ok: true };
}
