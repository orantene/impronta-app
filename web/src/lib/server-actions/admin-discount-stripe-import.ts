"use server";

/**
 * admin-discount-stripe-import.ts — pull Stripe-only promotion codes into the
 * DB discount store.
 *
 * SPLIT FROM `admin-product-discounts.ts` on 2026-09-02. That file sat at
 * 791 of its 800-line budget, so adding audit coverage to its four write
 * actions pushed it over. The repo's answer to that cap is to split rather
 * than to raise the budget (its own header records Phase 3 actions being moved
 * out for exactly this reason), and this action is the natural seam: it is the
 * only one that reads FROM Stripe rather than writing to it, and it shares no
 * state with the CRUD actions beyond the auth gate.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { auditDiscountImported } from "@/lib/billing/commerce-audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import { DISCOUNT_CODE_REGEX } from "@/lib/pricing/discount-row";
import { revalidateCommerceSurfaces } from "@/lib/pricing/revalidate-commerce";

// ─── Auth gate (duplicated from admin-product-discounts.ts, as that file
// already duplicates it from admin-product-pricing.ts) ───────────────────────

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requirePlatformAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

// ─── importStripePromotionCodes ──────────────────────────────────────────────

/**
 * Pull every promotion code that exists in Stripe into `product_discounts`.
 *
 * WHY THIS EXISTS: there were two discount systems. The Billing page's
 * discount-codes screen wrote to STRIPE ONLY, with no DB row — so the codes it
 * minted were invisible to `validateDiscount`, and a visitor arriving on
 * `?promo=FRIENDS_FREE` was told "Code not found" for a code that was live and
 * redeemable in Stripe's own checkout box. The Pricing page's Discounts tab
 * wrote to the DB and mirrored to Stripe. Neither could see the other's codes.
 *
 * Consolidating onto the DB store means the Stripe-only codes have to come
 * ACROSS before the old surface is deleted, or they are stranded: still live at
 * Stripe, still redeemable, and with no screen anywhere that lists them. This
 * is that migration, written as a re-runnable action rather than a one-shot
 * script, because Stripe-side codes can still appear (someone mints one in the
 * Stripe dashboard) long after the old screen is gone.
 *
 * Idempotent by construction:
 *   - keyed on `code`, which is UNIQUE in our table;
 *   - an existing row only ever gains MISSING Stripe ids, never a changed
 *     value / name / window. Admin-set fields win, always, so a re-run is a
 *     no-op and an operator's later edit is never undone by the importer.
 */
export type ImportStripePromotionCodesResult =
  | {
      ok: true;
      imported: number;
      linked: number;
      skipped: number;
      stub?: boolean;
      reason?: string;
    }
  | { ok: false; error: string };

export async function importStripePromotionCodes(): Promise<ImportStripePromotionCodesResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-discounts.import.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  if (!isStripeConfigured()) {
    return {
      ok: true,
      imported: 0,
      linked: 0,
      skipped: 0,
      stub: true,
      reason: "STRIPE_SECRET_KEY not set — nothing to import from.",
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      imported: 0,
      linked: 0,
      skipped: 0,
      stub: true,
      reason: "Stripe client unavailable — nothing to import from.",
    };
  }

  // Reverse map so an imported coupon's product restriction lands on OUR tier
  // ids instead of being flattened to "all", which would silently widen the
  // scope of an imported code.
  const tierRows = await admin
    .from("product_tiers")
    .select("id, stripe_product_id");
  const tierByProduct = new Map<string, string>();
  for (const row of (tierRows.data ?? []) as Array<{
    id: string;
    stripe_product_id: string | null;
  }>) {
    if (row.stripe_product_id) tierByProduct.set(row.stripe_product_id, row.id);
  }

  let imported = 0;
  let linked = 0;
  let skipped = 0;

  try {
    let startingAfter: string | undefined;
    // Bounded: 20 pages × 100 = 2,000 codes, far past any plausible catalog.
    // A hard stop beats an unbounded loop inside a server action.
    for (let page = 0; page < 20; page += 1) {
      const list = await stripe.promotionCodes.list({
        limit: 100,
        // SDK v22: the coupon hangs off `promotion`, NOT a flat `coupon` field.
        // The old screen's `expand: ["data.coupon"]` predates the SDK bump and
        // expands nothing on this shape.
        expand: ["data.promotion.coupon"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const promo of list.data) {
        const outcome = await importOnePromotionCode(admin, promo, tierByProduct);
        if (outcome === "imported") imported += 1;
        else if (outcome === "linked") linked += 1;
        else skipped += 1;
      }

      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (err) {
    logServerError("admin-product-discounts.import", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    return { ok: false, error: message };
  }

  revalidateCommerceSurfaces();
  await auditDiscountImported({ actorId: gate.userId, imported, linked, skipped });

  return { ok: true, imported, linked, skipped };
}

type ImportOutcome = "imported" | "linked" | "skipped";

/** One promotion code → one `product_discounts` row. See the header for why. */
async function importOnePromotionCode(
  admin: SupabaseClient,
  promo: Stripe.PromotionCode,
  tierByProduct: Map<string, string>,
): Promise<ImportOutcome> {
  const code = promo.code?.trim().toUpperCase();
  if (!code || !DISCOUNT_CODE_REGEX.test(code)) return "skipped";

  const coupon = promo.promotion?.coupon;
  if (!coupon || typeof coupon === "string") {
    // Unexpanded or absent — we cannot read the discount math, and guessing it
    // would import a code whose value is wrong. Skipping is the honest outcome.
    return "skipped";
  }

  const existing = await admin
    .from("product_discounts")
    .select("id, stripe_coupon_id, stripe_promotion_code_id")
    .eq("code", code)
    .maybeSingle();
  if (existing.data) {
    const row = existing.data as {
      id: string;
      stripe_coupon_id: string | null;
      stripe_promotion_code_id: string | null;
    };
    const patch: Record<string, string> = {};
    if (!row.stripe_coupon_id) patch.stripe_coupon_id = coupon.id;
    if (!row.stripe_promotion_code_id) {
      patch.stripe_promotion_code_id = promo.id;
    }
    if (Object.keys(patch).length === 0) return "skipped";
    const upd = await admin
      .from("product_discounts")
      .update(patch)
      .eq("id", row.id);
    if (upd.error) {
      logServerError("admin-product-discounts.import.link", upd.error);
      return "skipped";
    }
    return "linked";
  }

  // A 100%-off repeating coupon IS our `free_months` kind — this is the exact
  // inverse of what `buildDiscountCouponParams` emits, so a code minted here
  // and re-imported round-trips to the same row instead of mutating shape.
  let kind: PricingDiscountRow["kind"];
  let value: number;
  if (
    coupon.percent_off === 100 &&
    coupon.duration === "repeating" &&
    coupon.duration_in_months
  ) {
    kind = "free_months";
    value = coupon.duration_in_months;
  } else if (coupon.percent_off != null) {
    kind = "percent";
    value = coupon.percent_off;
  } else if (coupon.amount_off != null && coupon.currency) {
    kind = "fixed";
    value = coupon.amount_off / 100;
  } else {
    return "skipped";
  }
  if (!(value > 0)) return "skipped";

  const scopedProducts = coupon.applies_to?.products ?? [];
  const mappedTierIds = scopedProducts
    .map((productId) => tierByProduct.get(productId))
    .filter((id): id is string => Boolean(id));
  // Only narrow when EVERY restricted product is one of ours. A partial map
  // would claim a scope the coupon does not actually have.
  const appliesTo =
    scopedProducts.length > 0 && mappedTierIds.length === scopedProducts.length
      ? mappedTierIds
      : "all";

  const insert = await admin.from("product_discounts").insert({
    code,
    name: coupon.name?.trim() || code,
    kind,
    value,
    currency: kind === "fixed" ? (coupon.currency ?? "usd").toUpperCase() : null,
    duration: coupon.duration,
    duration_months: coupon.duration_in_months ?? null,
    applies_to: appliesTo,
    max_redemptions: promo.max_redemptions ?? null,
    per_customer_limit: 1,
    ends_at: promo.expires_at
      ? new Date(promo.expires_at * 1000).toISOString()
      : null,
    first_time_only: promo.restrictions?.first_time_transaction === true,
    minimum_amount_cents: promo.restrictions?.minimum_amount ?? null,
    minimum_amount_currency:
      promo.restrictions?.minimum_amount_currency?.toUpperCase() ?? null,
    source: "stripe_import",
    stripe_coupon_id: coupon.id,
    stripe_promotion_code_id: promo.id,
    is_active: promo.active,
  });
  if (insert.error) {
    logServerError("admin-product-discounts.import.insert", insert.error);
    return "skipped";
  }
  return "imported";
}
