/**
 * stripe-sync.ts — server-only Stripe sync for the Product Pricing
 * dashboard.
 *
 * Stripe Prices are IMMUTABLE — editing a tier's price means:
 *   1. Create a NEW Stripe Price with the new amount.
 *   2. Update `product_prices.stripe_price_id` to the new ID.
 *   3. Archive the OLD Stripe Price (`active: false`) so existing
 *      subscribers stay valid but no new subscriptions use it.
 *
 * Sync is one-way (dashboard → Stripe). NEVER auto-deletes Stripe
 * objects — archive only (subscribers depend on them).
 *
 * Phase 1 behavior when Stripe is NOT configured (`STRIPE_SECRET_KEY`
 * unset or invalid): returns `{ ok: true, stub: true }` so the DB write
 * proceeds and the UI shows a "Stripe not connected — price saved in
 * DB only" warning. When the user wires up the correct Stripe account
 * (see StripeAccountCard), they can re-run sync to backfill IDs.
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import type { PricingInterval } from "./pricing-types";

export type StripeSyncResult =
  | { ok: true; stripePriceId: string; stub: false }
  | { ok: true; stripePriceId: null; stub: true; reason: string }
  | { ok: false; error: string };

export type StripeRenameResult =
  | { ok: true; stub: false }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string };

const STRIPE_INTERVAL_MAP: Record<PricingInterval, "month" | "year" | null> = {
  month: "month",
  year: "year",
  once: null,
  lifetime: null,
};

/**
 * Create a new Stripe Price for the given tier + amount, then archive
 * the old one. Returns the new Stripe Price ID. When Stripe isn't
 * configured, returns a stub success so callers can still persist the
 * DB row (the audit trail can fill in IDs later).
 *
 * `stripeProductId` is REQUIRED — Stripe Prices are scoped to a Product.
 * Tiers without a `stripe_product_id` (e.g., the Free / Hub / Client
 * trust tiers) can't be price-synced and should be gated by the caller.
 */
export async function syncTierPriceToStripe(input: {
  stripeProductId: string | null;
  oldStripePriceId: string | null;
  currency: string;
  interval: PricingInterval;
  unitAmount: number;
  tierName: string;
}): Promise<StripeSyncResult> {
  if (!isStripeConfigured()) {
    return {
      ok: true,
      stripePriceId: null,
      stub: true,
      reason: "STRIPE_SECRET_KEY not set — saved in DB only.",
    };
  }

  if (!input.stripeProductId) {
    return {
      ok: true,
      stripePriceId: null,
      stub: true,
      reason: "Tier has no Stripe Product yet — saved in DB only. Create the Product in Stripe first.",
    };
  }

  const interval = STRIPE_INTERVAL_MAP[input.interval];
  if (input.interval !== "once" && input.interval !== "lifetime" && !interval) {
    return { ok: false, error: `Unsupported interval: ${input.interval}` };
  }

  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      stripePriceId: null,
      stub: true,
      reason: "Stripe client unavailable — saved in DB only.",
    };
  }

  try {
    // 1. Create the new Price.
    const newPrice = await stripe.prices.create({
      product: input.stripeProductId,
      currency: input.currency.toLowerCase(),
      unit_amount: input.unitAmount,
      ...(interval
        ? { recurring: { interval } }
        : {}),
      nickname: `${input.tierName} · ${input.currency.toUpperCase()} · ${input.interval}`,
    });

    // 2. Archive the old Price (best-effort — if it errors we still
    //    return success with the new ID; the old one can be archived
    //    by hand in the Stripe dashboard).
    if (input.oldStripePriceId && input.oldStripePriceId !== newPrice.id) {
      try {
        await stripe.prices.update(input.oldStripePriceId, { active: false });
      } catch (archiveErr) {
        logServerError("stripe-sync.archive-old", archiveErr);
        // Non-fatal: continue.
      }
    }

    return { ok: true, stripePriceId: newPrice.id, stub: false };
  } catch (err) {
    logServerError("stripe-sync.create-price", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    return { ok: false, error: message };
  }
}

/**
 * Rename a Stripe Product (Product is mutable, single API call). Used
 * when the dashboard renames a tier (e.g., Portfolio → Max).
 */
export async function renameStripeProduct(input: {
  stripeProductId: string | null;
  newName: string;
  newTagline: string | null;
}): Promise<StripeRenameResult> {
  if (!isStripeConfigured()) {
    return { ok: true, stub: true, reason: "STRIPE_SECRET_KEY not set." };
  }
  if (!input.stripeProductId) {
    return { ok: true, stub: true, reason: "Tier has no Stripe Product yet." };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: true, stub: true, reason: "Stripe client unavailable." };
  }
  try {
    await stripe.products.update(input.stripeProductId, {
      name: input.newName,
      ...(input.newTagline ? { description: input.newTagline } : {}),
    });
    return { ok: true, stub: false };
  } catch (err) {
    logServerError("stripe-sync.rename-product", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    return { ok: false, error: message };
  }
}
