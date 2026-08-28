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

export type StripeProductCreateResult =
  | { ok: true; stripeProductId: string; stub: false }
  | { ok: true; stripeProductId: null; stub: true; reason: string }
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
  /** Stable `ws_<slug>_<interval>` / `talent_<slug>_<interval>` key. Optional: omitted for sale rows, which must not steal the canonical key. */
  lookupKey?: string | null;
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
      // A stable lookup_key lets a price be resolved by MEANING rather than by
      // an opaque id, which is what makes an account migration survivable: the
      // same key can be re-pointed at a new account's price. Convention is the
      // one already used by the 2026 catalog (see docs/stripe-lineup-2026-catalog.md).
      // Stripe requires it to be unique among ACTIVE prices, so a repriced tier
      // only works because we archive the old price in the same call below.
      ...(input.lookupKey ? { lookup_key: input.lookupKey, transfer_lookup_key: true } : {}),
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

/**
 * Create the Stripe Product a tier needs before it can carry any price.
 *
 * WHY THIS EXISTS: `product_tiers.stripe_product_id` was only ever written by
 * migration seed data. Every tier born in the admin UI therefore had a null
 * Product, and `syncTierPriceToStripe` above refuses to price such a tier — so
 * a newly created tier could be configured, displayed and marketed while being
 * permanently unbuyable, with only a small amber hint to say so. This closes
 * that loop: the caller creates the Product, stores the id, and prices work.
 *
 * Metadata mirrors the conventions the 2026 live catalog already uses
 * (`side` = which ladder, `tier` = the app's plan key) so a human reading the
 * Stripe dashboard can tell what a Product is without consulting us, plus
 * `managed_by` to mark objects this app owns.
 */
export async function createStripeProductForTier(input: {
  tierId: string;
  tierName: string;
  tagline: string | null;
  /** 'person' for the talent ladder, 'business' for workspaces — the catalog's own vocabulary. */
  side: "person" | "business";
  /** The app-side plan key / tier slug this Product represents. */
  tierKey: string;
}): Promise<StripeProductCreateResult> {
  if (!isStripeConfigured()) {
    return {
      ok: true,
      stripeProductId: null,
      stub: true,
      reason: "STRIPE_SECRET_KEY not set — tier saved in DB only.",
    };
  }

  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      stripeProductId: null,
      stub: true,
      reason: "Stripe client unavailable — tier saved in DB only.",
    };
  }

  try {
    const product = await stripe.products.create(
      {
        name: input.tierName,
        ...(input.tagline ? { description: input.tagline } : {}),
        metadata: {
          side: input.side,
          tier: input.tierKey,
          managed_by: "tulala_catalog",
        },
      },
      // Keyed on the tier row, so a retry after a network failure adopts the
      // Product the first attempt already created instead of making a twin.
      { idempotencyKey: `tier-product-${input.tierId}` },
    );
    return { ok: true, stripeProductId: product.id, stub: false };
  } catch (err) {
    logServerError("stripe-sync.create-product", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    return { ok: false, error: message };
  }
}
