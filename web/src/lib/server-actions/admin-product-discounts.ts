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
import {
  auditDiscountCreated,
  auditDiscountArchived,
  auditDiscountUpdated,
  auditDiscountImported,
} from "@/lib/billing/commerce-audit";
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
import { DISCOUNT_CODE_REGEX } from "@/lib/pricing/discount-row";
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

const CODE_REGEX = DISCOUNT_CODE_REGEX;

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

  await auditDiscountCreated({
    actorId: gate.userId,
    discountId,
    code: input.code,
    kind: input.kind,
    value: input.value,
    stripeSynced: !stripe.stub,
    couponId: stripe.stub ? null : stripe.couponId,
    promotionCodeId: stripe.stub ? null : stripe.promotionCodeId,
  });

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

  await auditDiscountArchived({
    actorId: gate.userId,
    discountId: row.id,
    stripePromotionCodeId: row.stripe_promotion_code_id ?? null,
  });

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

  await auditDiscountUpdated({
    actorId: gate.userId,
    discountId: input.discountId,
    after: {
      name: input.name,
      campaign: input.campaign,
      per_customer_limit: input.perCustomerLimit,
      starts_at: startsAt,
    },
  });

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
