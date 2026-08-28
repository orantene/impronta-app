"use server";

/**
 * admin-product-discounts.ts — the code-discount server actions.
 *
 * All exports here are super_admin-gated except `validateDiscount`, which is a
 * public action used by the marketing funnel when `?promo=CODE` is present (the
 * code itself was on the URL, so revealing whether it is valid leaks nothing).
 *
 * ATOMICITY — DB FIRST, then Stripe, per the plan's stated convention.
 * `createDiscount` used to call Stripe BEFORE inserting the row. When the
 * insert then failed, the coupon and promotion code stayed in Stripe with no
 * DB row pointing at them: an orphan the admin could not see, could not
 * archive, and which a customer could still type at checkout. Now the row is
 * written first, its id becomes the Stripe idempotency key (`pdisc-{id}`), and
 * a Stripe failure leaves a visible amber row that can be repaired instead of
 * an invisible live discount.
 *
 * PER-PRODUCT SCOPE is enforced here, not hoped for: when the operator checks a
 * subset of tiers, every checked tier must have a `stripe_product_id`, or the
 * save is REFUSED. Creating the coupon without the restriction Stripe never
 * received would produce a discount valid on the entire catalog — the failure
 * mode that costs money, so it is a hard error rather than a warning.
 *
 * Same eslint suppression pattern as `admin-product-pricing.ts`: the
 * `product_*` tables are platform-level (no `tenant_id`), so the
 * `ratchet/no-untenanted-from` rule's grandfathering registry is the right
 * escape hatch.
 */

import { revalidateCommerceSurfaces } from "@/lib/pricing/revalidate-commerce";
import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { DEFAULT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import {
  loadDiscountRedemptions,
  type DiscountRedemptionRow,
} from "@/lib/billing/discount-redemptions";
import {
  syncDiscountToStripe,
  archiveDiscountInStripe,
} from "@/lib/pricing/stripe-discount-sync";
import { applyDiscountEdit } from "@/lib/billing/discount-edit";
import {
  PRODUCT_DISCOUNT_SELECT,
  normalizeProductDiscount,
  type RawProductDiscountRow,
} from "@/lib/pricing/discount-row";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

// ─── Auth gate (duplicated from admin-product-pricing.ts) ────────────────────

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

// ─── createDiscount ──────────────────────────────────────────────────────────

const CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

const createDiscountSchema = z
  .object({
    code: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => CODE_REGEX.test(s), {
        message: "Code must be 3-32 chars: A-Z, 0-9, _ or -",
      }),
    name: z.string().min(1).max(80),
    kind: z.enum(["percent", "fixed", "free_months"]),
    value: z.number().positive(),
    currency: z.enum(DEFAULT_CURRENCY_OPTIONS).optional(),
    duration: z.enum(["once", "repeating", "forever"]).default("once"),
    durationMonths: z.number().int().positive().max(36).nullable().optional(),
    appliesTo: z
      .union([z.literal("all"), z.array(pgUuidSchema()).min(1)])
      .default("all"),
    appliesFamily: z.enum(["workspace", "talent"]).nullable().optional(),
    maxRedemptions: z.number().int().positive().optional(),
    perCustomerLimit: z.number().int().positive().default(1),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    firstTimeOnly: z.boolean().default(false),
    minimumAmountCents: z.number().int().positive().nullable().optional(),
    minimumAmountCurrency: z
      .enum(DEFAULT_CURRENCY_OPTIONS)
      .nullable()
      .optional(),
    campaign: z.string().max(60).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "fixed" && !v.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fixed-amount discounts require a currency.",
        path: ["currency"],
      });
    }
    if (v.kind === "percent" && v.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percent must be 1-100.",
        path: ["value"],
      });
    }
    if (v.kind === "free_months" && (v.value < 1 || v.value > 12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Free months must be 1-12.",
        path: ["value"],
      });
    }
    if (v.kind !== "free_months" && v.duration === "repeating" && !v.durationMonths) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A repeating discount needs a number of months.",
        path: ["durationMonths"],
      });
    }
    if (v.minimumAmountCents != null && !v.minimumAmountCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A minimum spend needs a currency.",
        path: ["minimumAmountCurrency"],
      });
    }
    if (v.startsAt && v.endsAt && new Date(v.startsAt) >= new Date(v.endsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be before end date.",
        path: ["startsAt"],
      });
    }
  });

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type CreateDiscountResult =
  | {
      ok: true;
      discountId: string;
      stripe: {
        synced: boolean;
        stub: boolean;
        reason?: string;
        couponId: string | null;
        promotionCodeId: string | null;
      };
    }
  | { ok: false; error: string };

export async function createDiscount(
  raw: unknown,
): Promise<CreateDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createDiscountSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-discounts.create.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Refuse duplicate codes up front so the operator gets "pick another code"
  // rather than a Stripe error after a row already exists.
  const dupe = await admin
    .from("product_discounts")
    .select("id")
    .eq("code", input.code)
    .maybeSingle();
  if (dupe.data) {
    return { ok: false, error: `Code "${input.code}" already exists.` };
  }

  // Per-product scope: resolve the checked tiers to Stripe product ids BEFORE
  // writing anything. A tier with no Stripe product cannot be scoped, and a
  // coupon that quietly loses its restriction is valid on the whole catalog.
  let productIds: string[] | null = null;
  if (input.appliesTo !== "all") {
    const tiers = await admin
      .from("product_tiers")
      .select("id, name, stripe_product_id")
      .in("id", input.appliesTo);
    if (tiers.error) {
      logServerError("admin-product-discounts.create.tiers", tiers.error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    const rows = (tiers.data ?? []) as Array<{
      id: string;
      name: string;
      stripe_product_id: string | null;
    }>;
    if (rows.length !== input.appliesTo.length) {
      return { ok: false, error: "One of the selected plans no longer exists." };
    }
    const unscopable = rows.filter((r) => !r.stripe_product_id);
    if (unscopable.length > 0) {
      return {
        ok: false,
        error:
          `These plans have no Stripe product yet, so the code cannot be limited to them: ` +
          `${unscopable.map((r) => r.name).join(", ")}. Create their Stripe products first, ` +
          `or leave the code valid on every plan.`,
      };
    }
    productIds = rows.map((r) => r.stripe_product_id as string);
  }

  // DB FIRST. The row id is the idempotency key; a Stripe failure below leaves
  // a visible amber row, never an invisible live coupon.
  const insert = await admin
    .from("product_discounts")
    .insert({
      code: input.code,
      name: input.name,
      kind: input.kind,
      value: input.value,
      currency: input.currency ?? null,
      duration: input.kind === "free_months" ? "repeating" : input.duration,
      duration_months:
        input.kind === "free_months"
          ? Math.round(input.value)
          : input.duration === "repeating"
            ? (input.durationMonths ?? null)
            : null,
      applies_to: input.appliesTo,
      applies_family: input.appliesFamily ?? null,
      max_redemptions: input.maxRedemptions ?? null,
      per_customer_limit: input.perCustomerLimit,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      first_time_only: input.firstTimeOnly,
      minimum_amount_cents: input.minimumAmountCents ?? null,
      minimum_amount_currency: input.minimumAmountCurrency ?? null,
      campaign: input.campaign?.trim() || null,
      source: "admin",
      is_active: true,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    logServerError("admin-product-discounts.create.insert", insert.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const discountId = (insert.data as { id: string }).id;

  const stripe = await syncDiscountToStripe(
    {
      code: input.code,
      name: input.name,
      kind: input.kind,
      value: input.value,
      currency: input.currency ?? null,
      duration: input.duration,
      durationMonths: input.durationMonths ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      productIds,
      firstTimeOnly: input.firstTimeOnly,
      minimumAmountCents: input.minimumAmountCents ?? null,
      minimumAmountCurrency: input.minimumAmountCurrency ?? null,
    },
    `pdisc-${discountId}`,
  );

  revalidateCommerceSurfaces();

  if (!stripe.ok) {
    // The row survives on purpose. An admin can see it, archive it, or fix the
    // Stripe side; the alternative is a half-created discount nobody knows about.
    return {
      ok: true,
      discountId,
      stripe: {
        synced: false,
        stub: true,
        reason: stripe.error,
        couponId: null,
        promotionCodeId: null,
      },
    };
  }

  if (!stripe.stub) {
    const back = await admin
      .from("product_discounts")
      .update({
        stripe_coupon_id: stripe.couponId,
        stripe_promotion_code_id: stripe.promotionCodeId,
      })
      .eq("id", discountId);
    if (back.error) {
      logServerError("admin-product-discounts.create.writeback", back.error);
    }
  }

  return {
    ok: true,
    discountId,
    stripe: {
      synced: !stripe.stub,
      stub: stripe.stub,
      reason: stripe.stub ? stripe.reason : undefined,
      couponId: stripe.stub ? null : stripe.couponId,
      promotionCodeId: stripe.stub ? null : stripe.promotionCodeId,
    },
  };
}

// ─── archiveDiscount ─────────────────────────────────────────────────────────

export type ArchiveDiscountResult =
  | { ok: true }
  | { ok: false; error: string };

export async function archiveDiscount(
  raw: { discountId: string },
): Promise<ArchiveDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = z
    .object({ discountId: pgUuidSchema() })
    .strict()
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-discounts.archive.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const load = await admin
    .from("product_discounts")
    .select("id, stripe_promotion_code_id")
    .eq("id", parsed.data.discountId)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, error: "Discount not found." };
  }
  const row = load.data as {
    id: string;
    stripe_promotion_code_id: string | null;
  };

  const upd = await admin
    .from("product_discounts")
    .update({ is_active: false })
    .eq("id", row.id);
  if (upd.error) {
    logServerError("admin-product-discounts.archive.update", upd.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  if (row.stripe_promotion_code_id) {
    await archiveDiscountInStripe({
      stripePromotionCodeId: row.stripe_promotion_code_id,
    });
  }

  revalidateCommerceSurfaces();
  return { ok: true };
}

// ─── updateDiscount ──────────────────────────────────────────────────────────

/**
 * The four fields a live code can still change.
 *
 * EVERYTHING ELSE IS FROZEN BY STRIPE, not by us. A coupon's `percent_off`,
 * `amount_off`, `duration`, `duration_in_months` and `max_redemptions` are
 * immutable once it exists, and a promotion code accepts only `active` and
 * `metadata` — so changing a cap or a percentage genuinely means archiving the
 * code and minting a new one. (That is why TULALA2FREE had to be rebuilt to go
 * from uncapped to 30 spots.) The drawer shows those fields locked rather than
 * hiding them, so the constraint is discovered before a campaign ships instead
 * of after.
 *
 * What is safe here:
 *   - `name`     — Stripe allows a coupon rename; we mirror it, best-effort.
 *   - `campaign` — ours entirely; a reporting label.
 *   - `perCustomerLimit` — ours entirely; the redemption LEDGER enforces it at
 *     checkout, so it takes effect immediately with no Stripe involvement.
 *   - `startsAt` — ours entirely; we hold the code back before this time, since
 *     Stripe has no start date. Clearable.
 */
const updateDiscountSchema = z
  .object({
    discountId: pgUuidSchema(),
    name: z.string().trim().min(1, "Give the code an internal name.").max(120),
    campaign: z.string().trim().max(60).nullable(),
    perCustomerLimit: z.number().int().min(1).max(1000),
    startsAt: z.string().trim().min(1).nullable(),
  })
  .strict();

export type UpdateDiscountResult = { ok: true } | { ok: false; error: string };

export async function updateDiscount(
  raw: unknown,
): Promise<UpdateDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateDiscountSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  // A start date is only meaningful as a real instant; a half-typed one would
  // otherwise persist as an epoch date and hold the code back forever.
  let startsAt: string | null = null;
  if (input.startsAt) {
    const when = new Date(input.startsAt);
    if (Number.isNaN(when.getTime())) {
      return { ok: false, error: "Start date is not a valid date." };
    }
    startsAt = when.toISOString();
  }

  const outcome = await applyDiscountEdit(
    {
      discountId: input.discountId,
      name: input.name,
      campaign: input.campaign,
      perCustomerLimit: input.perCustomerLimit,
      startsAt,
    },
    CLIENT_ERROR.update,
  );
  if (!outcome.ok) return outcome;

  revalidateCommerceSurfaces();
  return { ok: true };
}

// ─── listDiscountRedemptions ─────────────────────────────────────────────────

/**
 * The people behind the `12/30`.
 *
 * Called when the usage drawer OPENS rather than loaded with the tab: the list
 * is per-code and unbounded in principle, and nobody pages through redemptions
 * on the way to editing a price.
 */
export async function listDiscountRedemptions(
  raw: { discountId: string },
): Promise<
  | { ok: true; redemptions: DiscountRedemptionRow[] }
  | { ok: false; error: string }
> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = z
    .object({ discountId: pgUuidSchema() })
    .strict()
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  return {
    ok: true,
    redemptions: await loadDiscountRedemptions(parsed.data.discountId),
  };
}

// ─── validateDiscount (PUBLIC — not super_admin-gated) ───────────────────────

export type ValidateDiscountResult =
  | {
      ok: true;
      discount: PricingDiscountRow;
      /** Pre-formatted human label, e.g. "50% off · LATAM50" or
       *  "First 3 months free · LAUNCH3FREE". */
      label: string;
    }
  | { ok: false; reason: string };

export async function validateDiscount(
  rawCode: string,
): Promise<ValidateDiscountResult> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    return { ok: false, reason: "Invalid code format." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, reason: "Pricing service unavailable." };
  }

  const load = await admin
    .from("product_discounts")
    .select(PRODUCT_DISCOUNT_SELECT)
    .eq("code", code)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, reason: "Code not found." };
  }
  const discount = normalizeProductDiscount(
    load.data as unknown as RawProductDiscountRow,
  );

  if (!discount.isActive) {
    return { ok: false, reason: "Code is no longer active." };
  }
  const now = Date.now();
  if (discount.startsAt && new Date(discount.startsAt).getTime() > now) {
    return { ok: false, reason: "Code hasn’t started yet." };
  }
  if (discount.endsAt && new Date(discount.endsAt).getTime() < now) {
    return { ok: false, reason: "Code has expired." };
  }
  if (
    discount.maxRedemptions != null &&
    discount.redemptionCount >= discount.maxRedemptions
  ) {
    return { ok: false, reason: "Code has reached its redemption limit." };
  }

  let label: string;
  if (discount.kind === "percent") {
    label = `${discount.value}% off · ${discount.code}`;
  } else if (discount.kind === "fixed") {
    label = `${discount.currency ?? "USD"} ${discount.value} off · ${discount.code}`;
  } else {
    const n = Math.round(discount.value);
    label = `First ${n} month${n === 1 ? "" : "s"} free · ${discount.code}`;
  }

  return { ok: true, discount, label };
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
  if (!code || !CODE_REGEX.test(code)) return "skipped";

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
