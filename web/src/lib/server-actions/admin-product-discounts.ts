"use server";

/**
 * admin-product-discounts.ts — Phase 3 discount-code server actions.
 *
 * Split out of `admin-product-pricing.ts` to keep both files under the
 * 800-line max-lines cap. All exports here are super_admin-gated except
 * `validateDiscount`, which is a public action used by the marketing
 * funnel when `?promo=CODE` is present (the code itself was on the URL,
 * so revealing whether it's valid leaks no secret).
 *
 * Same eslint suppression pattern as `admin-product-pricing.ts`: the
 * `product_*` tables are platform-level (no `tenant_id`), so the
 * `ratchet/no-untenanted-from` rule's grandfathering registry is the
 * right escape hatch.
 */

import { revalidateCommerceSurfaces } from "@/lib/pricing/revalidate-commerce";
import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { DEFAULT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import {
  syncDiscountToStripe,
  archiveDiscountInStripe,
} from "@/lib/pricing/stripe-discount-sync";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import { pgUuidSchema } from "@/lib/site-admin/validators";


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
    appliesTo: z
      .union([z.literal("all"), z.array(pgUuidSchema()).min(1)])
      .default("all"),
    maxRedemptions: z.number().int().positive().optional(),
    perCustomerLimit: z.number().int().positive().default(1),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
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

  // Refuse duplicate codes BEFORE hitting Stripe so we don't leak a
  // Coupon object that has no DB row.
  const dupe = await admin
    .from("product_discounts")
    .select("id")
    .eq("code", input.code)
    .maybeSingle();
  if (dupe.data) {
    return { ok: false, error: `Code "${input.code}" already exists.` };
  }

  // Stripe sync first — same reasoning as updateTierPrice.
  const stripe = await syncDiscountToStripe({
    code: input.code,
    name: input.name,
    kind: input.kind,
    value: input.value,
    currency: input.currency ?? null,
    maxRedemptions: input.maxRedemptions ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  });
  if (!stripe.ok) {
    return { ok: false, error: stripe.error };
  }

  const insert = await admin
    .from("product_discounts")
    .insert({
      code: input.code,
      name: input.name,
      kind: input.kind,
      value: input.value,
      currency: input.currency ?? null,
      applies_to: input.appliesTo,
      max_redemptions: input.maxRedemptions ?? null,
      per_customer_limit: input.perCustomerLimit,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      stripe_coupon_id: stripe.stub ? null : stripe.couponId,
      stripe_promotion_code_id: stripe.stub ? null : stripe.promotionCodeId,
      is_active: true,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    logServerError("admin-product-discounts.create.insert", insert.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidateCommerceSurfaces();

  return {
    ok: true,
    discountId: (insert.data as { id: string }).id,
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
    .select(
      "id, code, name, kind, value, currency, applies_to, max_redemptions, redemption_count, per_customer_limit, starts_at, ends_at, stripe_coupon_id, stripe_promotion_code_id, is_active",
    )
    .eq("code", code)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, reason: "Code not found." };
  }
  const row = load.data as {
    id: string;
    code: string;
    name: string;
    kind: PricingDiscountRow["kind"];
    value: number;
    currency: string | null;
    applies_to: unknown;
    max_redemptions: number | null;
    redemption_count: number;
    per_customer_limit: number;
    starts_at: string | null;
    ends_at: string | null;
    stripe_coupon_id: string | null;
    stripe_promotion_code_id: string | null;
    is_active: boolean;
  };

  if (!row.is_active) {
    return { ok: false, reason: "Code is no longer active." };
  }
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) {
    return { ok: false, reason: "Code hasn’t started yet." };
  }
  if (row.ends_at && new Date(row.ends_at).getTime() < now) {
    return { ok: false, reason: "Code has expired." };
  }
  if (
    row.max_redemptions != null &&
    row.redemption_count >= row.max_redemptions
  ) {
    return { ok: false, reason: "Code has reached its redemption limit." };
  }

  const appliesTo: "all" | string[] =
    row.applies_to === "all" || row.applies_to === null
      ? "all"
      : Array.isArray(row.applies_to)
      ? (row.applies_to as string[])
      : "all";

  const discount: PricingDiscountRow = {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    value: Number(row.value),
    currency: row.currency,
    appliesTo,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    perCustomerLimit: row.per_customer_limit,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    stripeCouponId: row.stripe_coupon_id,
    stripePromotionCodeId: row.stripe_promotion_code_id,
    isActive: row.is_active,
  };

  let label: string;
  if (row.kind === "percent") {
    label = `${row.value}% off · ${row.code}`;
  } else if (row.kind === "fixed") {
    label = `${row.currency ?? "USD"} ${row.value} off · ${row.code}`;
  } else {
    const n = Math.round(Number(row.value));
    label = `First ${n} month${n === 1 ? "" : "s"} free · ${row.code}`;
  }

  return { ok: true, discount, label };
}
