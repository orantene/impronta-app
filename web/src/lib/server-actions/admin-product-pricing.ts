"use server";

/**
 * admin-product-pricing.ts — server actions for the Product Pricing
 * dashboard at `/platform/admin/pricing` (Phase 1).
 *
 * All actions are super_admin-gated (platform-role check). The DB
 * tables (`product_*`) have no public RLS policies — only the
 * service-role client writes.
 *
 * Phase 1 surface:
 *   - updateTierPrice    — edit an existing price's amount (creates a new
 *                          row + archives old; mirrors Stripe immutability)
 *   - updateTierDisplay  — rename / re-tagline / toggle featured / active
 *   - verifyStripeAccount — re-pings /v1/account (cache-busts the card)
 *
 * Phase 2 will add: addPriceCurrency, removePrice, addTier, etc.
 *
 * Pattern follows admin-workspace-default-currency.ts (capability-gated,
 * service-role write, `{ ok, error }` result, revalidatePath on success).
 *
 * Eslint note: the `.from("product_prices")` / `.from("product_tiers")`
 * calls below trip `ratchet/no-untenanted-from`. These tables are
 * platform-level (no `tenant_id` column) — they're shared across every
 * tenant by design. The rule is meant to catch forgotten tenant
 * filters; for genuinely-platform-scoped tables the right answer is
 * the suppressions registry (same pattern used by
 * `admin-workspace-default-currency.ts` for the `agencies` self-row).
 * 6 call sites tracked in `eslint-suppressions.json`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_CURRENCY_OPTIONS,
  normalizeDefaultCurrency,
} from "@/lib/billing/currencies";
import {
  syncTierPriceToStripe,
  renameStripeProduct,
} from "@/lib/pricing/stripe-sync";

const PRICING_PATH = "/platform/admin/pricing";

// ─── Auth gate ────────────────────────────────────────────────────────────────

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

// ─── 1. updateTierPrice ──────────────────────────────────────────────────────

const updatePriceSchema = z
  .object({
    priceId: z.string().uuid(),
    unitAmount: z.number().int().min(0).max(99_999_999),
    // Phase 1 only writes USD; the schema accepts any supported code so
    // Phase 2 doesn't need a parallel action.
    currency: z.enum(DEFAULT_CURRENCY_OPTIONS).optional(),
    interval: z.enum(["month", "year", "once", "lifetime"]).optional(),
    notes: z.string().max(280).nullable().optional(),
  })
  .strict();

export type UpdateTierPriceInput = z.infer<typeof updatePriceSchema>;

export type UpdateTierPriceResult =
  | { ok: true; stripe: { synced: boolean; stub: boolean; reason?: string; newPriceId: string | null } }
  | { ok: false; error: string };

export async function updateTierPrice(
  raw: UpdateTierPriceInput,
): Promise<UpdateTierPriceResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updatePriceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-pricing.update-price.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // 1. Load current price row + tier in two queries. We tried `select` with
  //    `product_tiers!inner(…)` first but the generated Supabase types
  //    refuse to narrow it cleanly (PostgREST embed types are widened to
  //    GenericStringError | T). Two simple selects are easier to reason
  //    about and the round-trip cost is negligible.
  const priceLoad = await admin
    .from("product_prices")
    .select(
      "id, tier_id, currency, interval, unit_amount, stripe_price_id",
    )
    .eq("id", input.priceId)
    .maybeSingle();
  if (priceLoad.error || !priceLoad.data) {
    logServerError("admin-product-pricing.update-price.load-price", priceLoad.error);
    return { ok: false, error: "Price not found." };
  }
  const current = priceLoad.data as {
    id: string;
    tier_id: string;
    currency: string;
    interval: "month" | "year" | "once" | "lifetime";
    unit_amount: number;
    stripe_price_id: string | null;
  };

  const tierLoad = await admin
    .from("product_tiers")
    .select("id, name, stripe_product_id")
    .eq("id", current.tier_id)
    .maybeSingle();
  if (tierLoad.error || !tierLoad.data) {
    logServerError("admin-product-pricing.update-price.load-tier", tierLoad.error);
    return { ok: false, error: "Tier not found." };
  }
  const tierTyped = tierLoad.data as {
    id: string;
    name: string;
    stripe_product_id: string | null;
  };

  const currency = (
    input.currency ?? normalizeDefaultCurrency(current.currency) ?? current.currency
  ).toUpperCase();
  const interval = input.interval ?? current.interval;

  // 2. Sync to Stripe (or stub) BEFORE the DB write — if Stripe fails
  //    hard we don't want a dangling DB price with no Stripe ID.
  const stripe = await syncTierPriceToStripe({
    stripeProductId: tierTyped.stripe_product_id,
    oldStripePriceId: current.stripe_price_id,
    currency,
    interval,
    unitAmount: input.unitAmount,
    tierName: tierTyped.name,
  });
  if (!stripe.ok) {
    return { ok: false, error: stripe.error };
  }

  // 3. Archive the old DB row + insert the new one in one transaction-ish
  //    pair. (Supabase REST doesn't expose multi-statement TX; the worst
  //    case here is the old row archived but the new insert fails, which
  //    leaves the tier price-less for that (currency × interval). The
  //    insert is dead simple so this is acceptable for v1.)
  const nowIso = new Date().toISOString();

  const { error: archiveErr } = await admin
    .from("product_prices")
    .update({
      is_active: false,
      archived_at: nowIso,
    })
    .eq("id", current.id);
  if (archiveErr) {
    logServerError("admin-product-pricing.update-price.archive", archiveErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { error: insertErr } = await admin.from("product_prices").insert({
    tier_id: current.tier_id,
    currency,
    interval,
    unit_amount: input.unitAmount,
    stripe_price_id: stripe.stub ? null : stripe.stripePriceId,
    is_active: true,
    notes: input.notes ?? null,
  });
  if (insertErr) {
    logServerError("admin-product-pricing.update-price.insert", insertErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);

  return {
    ok: true,
    stripe: {
      synced: !stripe.stub,
      stub: stripe.stub,
      reason: stripe.stub ? stripe.reason : undefined,
      newPriceId: stripe.stub ? null : stripe.stripePriceId,
    },
  };
}

// ─── 2. updateTierDisplay ────────────────────────────────────────────────────

const updateDisplaySchema = z
  .object({
    tierId: z.string().uuid(),
    name: z.string().min(1).max(60).optional(),
    tagline: z.string().max(160).nullable().optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== undefined ||
      v.tagline !== undefined ||
      v.isActive !== undefined ||
      v.isFeatured !== undefined,
    { message: "No fields to update." },
  );

export type UpdateTierDisplayInput = z.infer<typeof updateDisplaySchema>;
export type UpdateTierDisplayResult =
  | { ok: true; stripe: { renamed: boolean; stub: boolean; reason?: string } }
  | { ok: false; error: string };

export async function updateTierDisplay(
  raw: UpdateTierDisplayInput,
): Promise<UpdateTierDisplayResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateDisplaySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-pricing.update-display.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Load current tier — we need the stripe_product_id to sync renames.
  const { data: tierRow, error: loadErr } = await admin
    .from("product_tiers")
    .select("id, name, tagline, stripe_product_id")
    .eq("id", input.tierId)
    .maybeSingle();
  if (loadErr || !tierRow) {
    return { ok: false, error: "Tier not found." };
  }
  const current = tierRow as {
    id: string;
    name: string;
    tagline: string | null;
    stripe_product_id: string | null;
  };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined)      updates.name = input.name;
  if (input.tagline !== undefined)   updates.tagline = input.tagline;
  if (input.isActive !== undefined)  updates.is_active = input.isActive;
  if (input.isFeatured !== undefined) updates.is_featured = input.isFeatured;

  const { error: updateErr } = await admin
    .from("product_tiers")
    .update(updates)
    .eq("id", input.tierId);
  if (updateErr) {
    logServerError("admin-product-pricing.update-display.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Only sync to Stripe if the name OR tagline changed.
  const nameChanged =
    input.name !== undefined && input.name !== current.name;
  const taglineChanged =
    input.tagline !== undefined && input.tagline !== current.tagline;

  let stripeResult: Awaited<ReturnType<typeof renameStripeProduct>> = {
    ok: true,
    stub: true,
    reason: "Display change didn't include name/tagline.",
  };
  if (nameChanged || taglineChanged) {
    stripeResult = await renameStripeProduct({
      stripeProductId: current.stripe_product_id,
      newName: input.name ?? current.name,
      newTagline:
        input.tagline === undefined
          ? current.tagline
          : input.tagline,
    });
    if (!stripeResult.ok) {
      // DB already updated; surface the Stripe error so the user can
      // re-sync manually if needed. The DB rename succeeded.
      return { ok: false, error: `DB updated, Stripe sync failed: ${stripeResult.error}` };
    }
  }

  revalidatePath(PRICING_PATH);

  return {
    ok: true,
    stripe: {
      renamed: stripeResult.ok && !stripeResult.stub,
      stub: stripeResult.ok && stripeResult.stub,
      reason: stripeResult.ok && stripeResult.stub ? stripeResult.reason : undefined,
    },
  };
}

// ─── 3. verifyStripeAccount ──────────────────────────────────────────────────

export type VerifyStripeAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Lightweight cache-busting action. The StripeAccountCard reads from
 * `loadStripeAccountInfo` which is React-`cache()`-wrapped per request;
 * to force a fresh `/v1/account` ping we revalidate the page so the
 * next render starts a new request scope. No DB write.
 */
export async function verifyStripeAccount(): Promise<VerifyStripeAccountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  revalidatePath(PRICING_PATH);
  return { ok: true };
}

// ─── 4. addTierPrice (Phase 2 — add a price for a NEW currency) ──────────────

const addPriceSchema = z
  .object({
    tierId: z.string().uuid(),
    currency: z.enum(DEFAULT_CURRENCY_OPTIONS),
    interval: z.enum(["month", "year", "once", "lifetime"]),
    unitAmount: z.number().int().min(0).max(99_999_999),
    notes: z.string().max(280).nullable().optional(),
  })
  .strict();

export type AddTierPriceInput = z.infer<typeof addPriceSchema>;
export type AddTierPriceResult =
  | { ok: true; priceId: string; stripe: { synced: boolean; stub: boolean; reason?: string; newPriceId: string | null } }
  | { ok: false; error: string };

export async function addTierPrice(
  raw: AddTierPriceInput,
): Promise<AddTierPriceResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = addPriceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;
  const currency = input.currency.toUpperCase();

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-pricing.add-price.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Load the tier to grab the Stripe Product ID + name for the sync call.
  const tierLoad = await admin
    .from("product_tiers")
    .select("id, name, stripe_product_id")
    .eq("id", input.tierId)
    .maybeSingle();
  if (tierLoad.error || !tierLoad.data) {
    return { ok: false, error: "Tier not found." };
  }
  const tier = tierLoad.data as {
    id: string;
    name: string;
    stripe_product_id: string | null;
  };

  // Refuse to create a duplicate active row for the same (currency × interval).
  const dupeCheck = await admin
    .from("product_prices")
    .select("id")
    .eq("tier_id", input.tierId)
    .eq("currency", currency)
    .eq("interval", input.interval)
    .eq("is_active", true)
    .is("archived_at", null)
    .is("valid_from", null)
    .is("valid_until", null)
    .maybeSingle();
  if (dupeCheck.data) {
    return {
      ok: false,
      error: `${currency} ${input.interval} price already exists. Edit it instead.`,
    };
  }

  // Create the Stripe Price (or stub).
  const stripe = await syncTierPriceToStripe({
    stripeProductId: tier.stripe_product_id,
    oldStripePriceId: null,
    currency,
    interval: input.interval,
    unitAmount: input.unitAmount,
    tierName: tier.name,
  });
  if (!stripe.ok) {
    return { ok: false, error: stripe.error };
  }

  const insert = await admin
    .from("product_prices")
    .insert({
      tier_id: input.tierId,
      currency,
      interval: input.interval,
      unit_amount: input.unitAmount,
      stripe_price_id: stripe.stub ? null : stripe.stripePriceId,
      is_active: true,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    logServerError("admin-product-pricing.add-price.insert", insert.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);

  return {
    ok: true,
    priceId: (insert.data as { id: string }).id,
    stripe: {
      synced: !stripe.stub,
      stub: stripe.stub,
      reason: stripe.stub ? stripe.reason : undefined,
      newPriceId: stripe.stub ? null : stripe.stripePriceId,
    },
  };
}

// ─── 5. archiveTierPrice (Phase 2 — soft-delete a row) ───────────────────────

const archivePriceSchema = z.object({ priceId: z.string().uuid() }).strict();

export type ArchiveTierPriceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Soft-delete: marks is_active=false + archived_at=now() on the row,
 * archives the underlying Stripe Price (best-effort). We never delete
 * the DB row or the Stripe Price object — existing subscribers depend
 * on them and the audit trail matters.
 *
 * Refuses to archive the LAST active price for a tier (would leave the
 * marketing page unable to render). Operators should add a replacement
 * first, then archive the old one.
 */
export async function archiveTierPrice(
  raw: { priceId: string },
): Promise<ArchiveTierPriceResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = archivePriceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-pricing.archive-price.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const load = await admin
    .from("product_prices")
    .select("id, tier_id, stripe_price_id")
    .eq("id", parsed.data.priceId)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, error: "Price not found." };
  }
  const current = load.data as {
    id: string;
    tier_id: string;
    stripe_price_id: string | null;
  };

  // Guard: don't archive the last active row.
  const otherActive = await admin
    .from("product_prices")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", current.tier_id)
    .eq("is_active", true)
    .is("archived_at", null)
    .neq("id", current.id);
  if ((otherActive.count ?? 0) === 0) {
    return {
      ok: false,
      error: "This is the only active price — add another before archiving.",
    };
  }

  const upd = await admin
    .from("product_prices")
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
    })
    .eq("id", current.id);
  if (upd.error) {
    logServerError("admin-product-pricing.archive-price.update", upd.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Best-effort Stripe archive.
  if (current.stripe_price_id) {
    try {
      const { getStripe, isStripeConfigured } = await import("@/lib/stripe/client");
      if (isStripeConfigured()) {
        const stripe = getStripe();
        await stripe?.prices.update(current.stripe_price_id, { active: false });
      }
    } catch (err) {
      logServerError("admin-product-pricing.archive-price.stripe", err);
      // Non-fatal — DB row is archived, the Stripe Price can be archived
      // by hand in the dashboard.
    }
  }

  revalidatePath(PRICING_PATH);
  return { ok: true };
}
