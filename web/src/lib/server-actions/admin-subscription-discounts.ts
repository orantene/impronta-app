"use server";

/**
 * admin-subscription-discounts.ts — the owner's "give this account 30% off"
 * lever, super_admin-gated.
 *
 * ATOMICITY, per the plan's stated convention: DB FIRST, then Stripe.
 * The row is the truth; Stripe is the executor. On a Stripe failure we KEEP the
 * row, stamp `sync_error`, and report a stub result so HQ paints amber and
 * `repairAccountDiscount` can replay it against the same deterministic
 * idempotency key. The reverse order (Stripe first) is what leaves orphaned
 * coupons nobody can see or delete.
 *
 * Ordering on removal is not cosmetic: detach from the subscription BEFORE
 * deleting the coupon, because deleting a coupon does not detach it.
 *
 * The `subscription_discounts` / `*_subscriptions` tables are platform-level
 * (no per-request tenant scope — this is HQ acting on any account), so the raw
 * `.from()` calls are grandfathered in eslint-suppressions.json exactly like
 * `admin-product-discounts.ts`.
 */

import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateCommerceSurfaces } from "@/lib/pricing/revalidate-commerce";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { DEFAULT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import {
  ACCOUNT_DISCOUNT_SELECT,
  applyDiscountToSubscription,
  createAccountCoupon,
  deleteAccountCoupon,
  normalizeAccountDiscount,
  removeDiscountFromSubscription,
  type AccountDiscountRow,
} from "@/lib/billing/subscription-discounts";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Result shapes ───────────────────────────────────────────────────────────

export type AccountDiscountStripeState = {
  /** True when the coupon exists in Stripe. */
  synced: boolean;
  /** True when it does not — DB row saved, HQ paints amber. */
  stub: boolean;
  reason?: string;
  couponId: string | null;
  /** Set when the coupon is attached to a live subscription. */
  appliedSubscriptionId: string | null;
};

export type SetAccountDiscountResult =
  | { ok: true; discountId: string; stripe: AccountDiscountStripeState }
  | { ok: false; error: string };

export type EndAccountDiscountResult =
  | { ok: true; stripe: AccountDiscountStripeState }
  | { ok: false; error: string };

export type LoadAccountDiscountsResult = {
  discounts: Array<AccountDiscountRow & { subjectLabel: string | null }>;
};

// ─── Auth gate (same shape as admin-product-discounts.ts) ────────────────────

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

// ─── Input schema ────────────────────────────────────────────────────────────

const setSchema = z
  .object({
    subjectType: z.enum(["workspace", "talent"]),
    tenantId: pgUuidSchema().nullable().optional(),
    talentProfileId: pgUuidSchema().nullable().optional(),
    kind: z.enum(["percent", "fixed"]),
    /** percent: 1-100. fixed: MAJOR units (10 = $10). */
    value: z.number().positive(),
    currency: z.enum(DEFAULT_CURRENCY_OPTIONS).nullable().optional(),
    duration: z.enum(["once", "repeating", "forever"]).default("forever"),
    durationMonths: z.number().int().positive().max(36).nullable().optional(),
    note: z.string().max(280).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.subjectType === "workspace" && !v.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A workspace discount needs a tenant.",
        path: ["tenantId"],
      });
    }
    if (v.subjectType === "talent" && !v.talentProfileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A talent discount needs a talent profile.",
        path: ["talentProfileId"],
      });
    }
    if (v.kind === "percent" && v.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percent must be 1-100.",
        path: ["value"],
      });
    }
    if (v.kind === "fixed" && !v.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fixed-amount discounts require a currency.",
        path: ["currency"],
      });
    }
    if (v.duration === "repeating" && !v.durationMonths) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A repeating discount needs a number of months.",
        path: ["durationMonths"],
      });
    }
  });

// ─── Internal helpers (not exported — "use server" allows only async exports) ─

type LiveSubscription = { subscriptionId: string; table: SubscriptionTable };
type SubscriptionTable = "workspace_subscriptions" | "talent_subscriptions";

/** The subscription a discount can actually attach to, if the account has one. */
async function findLiveSubscription(
  admin: SupabaseClient,
  row: Pick<AccountDiscountRow, "subjectType" | "tenantId" | "talentProfileId">,
): Promise<LiveSubscription | null> {
  const table: SubscriptionTable =
    row.subjectType === "workspace"
      ? "workspace_subscriptions"
      : "talent_subscriptions";
  const column = row.subjectType === "workspace" ? "tenant_id" : "talent_profile_id";
  const subjectId = row.subjectType === "workspace" ? row.tenantId : row.talentProfileId;
  if (!subjectId) return null;

  const { data, error } = await admin
    .from(table)
    .select("stripe_subscription_id, status")
    .eq(column, subjectId)
    .maybeSingle();
  if (error || !data) return null;

  const found = data as { stripe_subscription_id: string | null; status: string | null };
  // past_due counts: the subscription still exists and a discount applies to
  // the next invoice, which is exactly when a concession tends to be granted.
  const LIVE = new Set(["active", "trialing", "past_due", "paused"]);
  if (!found.stripe_subscription_id || !LIVE.has(found.status ?? "")) return null;
  return { subscriptionId: found.stripe_subscription_id, table };
}

/** Write (or clear) the four mirror columns on the subscription row. */
async function writeSubscriptionMirror(
  admin: SupabaseClient,
  target: LiveSubscription,
  mirror: {
    couponId: string | null;
    percentOff: number | null;
    amountOffCents: number | null;
  },
): Promise<void> {
  const { error } = await admin
    .from(target.table)
    .update({
      stripe_coupon_id: mirror.couponId,
      discount_percent_off: mirror.percentOff,
      discount_amount_off_cents: mirror.amountOffCents,
      // Left to the webhook read-back: only Stripe knows the real end date of a
      // repeating coupon, and guessing here would be a number we invented.
      discount_ends_at: null,
    })
    .eq("stripe_subscription_id", target.subscriptionId);
  if (error) {
    logServerError("admin-subscription-discounts.mirror", error);
  }
}

/**
 * Coupon-create → attach → mirror, shared by `setAccountDiscount` and
 * `repairAccountDiscount`. Never throws; every failure lands in `sync_error`.
 */
async function syncAccountDiscount(
  admin: SupabaseClient,
  row: AccountDiscountRow,
  subjectLabel: string | null,
): Promise<AccountDiscountStripeState> {
  let couponId = row.stripeCouponId;

  if (!couponId) {
    const created = await createAccountCoupon({
      id: row.id,
      subjectType: row.subjectType,
      tenantId: row.tenantId,
      talentProfileId: row.talentProfileId,
      kind: row.kind,
      value: row.value,
      currency: row.currency,
      duration: row.duration,
      durationMonths: row.durationMonths,
      subjectLabel,
    });
    if (!created.ok) {
      await admin
        .from("subscription_discounts")
        .update({ sync_error: created.error })
        .eq("id", row.id);
      return {
        synced: false,
        stub: true,
        reason: created.error,
        couponId: null,
        appliedSubscriptionId: null,
      };
    }
    if (created.stub) {
      await admin
        .from("subscription_discounts")
        .update({ sync_error: created.reason })
        .eq("id", row.id);
      return {
        synced: false,
        stub: true,
        reason: created.reason,
        couponId: null,
        appliedSubscriptionId: null,
      };
    }
    couponId = created.couponId;
    await admin
      .from("subscription_discounts")
      .update({ stripe_coupon_id: couponId, sync_error: null })
      .eq("id", row.id);
  }

  // Attach if — and only if — the account already pays us. A grant made before
  // the account subscribes stays unattached; checkout picks the coupon up via
  // resolveCheckoutDiscount and the webhook stamps it back.
  const live = await findLiveSubscription(admin, row);
  if (!live) {
    await admin
      .from("subscription_discounts")
      .update({ sync_error: null })
      .eq("id", row.id);
    return {
      synced: true,
      stub: false,
      couponId,
      appliedSubscriptionId: null,
    };
  }

  const attached = await applyDiscountToSubscription(live.subscriptionId, couponId);
  if (!attached.ok) {
    await admin
      .from("subscription_discounts")
      .update({ sync_error: attached.error })
      .eq("id", row.id);
    return {
      synced: false,
      stub: true,
      reason: attached.error,
      couponId,
      appliedSubscriptionId: null,
    };
  }
  if (attached.stub) {
    return {
      synced: false,
      stub: true,
      reason: attached.reason,
      couponId,
      appliedSubscriptionId: null,
    };
  }

  await admin
    .from("subscription_discounts")
    .update({
      applied_subscription_id: live.subscriptionId,
      applied_at: new Date().toISOString(),
      sync_error: null,
    })
    .eq("id", row.id);
  await writeSubscriptionMirror(admin, live, {
    couponId,
    percentOff: row.kind === "percent" ? row.value : null,
    amountOffCents: row.kind === "fixed" ? Math.round(row.value * 100) : null,
  });

  return {
    synced: true,
    stub: false,
    couponId,
    appliedSubscriptionId: live.subscriptionId,
  };
}

/** Detach + delete + clear the mirror for one row. Best-effort, idempotent. */
async function teardownAccountDiscount(
  admin: SupabaseClient,
  row: AccountDiscountRow,
): Promise<AccountDiscountStripeState> {
  let reason: string | undefined;

  const live =
    (await findLiveSubscription(admin, row)) ??
    (row.appliedSubscriptionId
      ? {
          subscriptionId: row.appliedSubscriptionId,
          table: (row.subjectType === "workspace"
            ? "workspace_subscriptions"
            : "talent_subscriptions") as SubscriptionTable,
        }
      : null);

  if (live) {
    const detached = await removeDiscountFromSubscription(live.subscriptionId);
    if (!detached.ok) reason = detached.error;
    else if (detached.stub) reason = detached.reason;
    await writeSubscriptionMirror(admin, live, {
      couponId: null,
      percentOff: null,
      amountOffCents: null,
    });
  }

  // AFTER the detach, never before — see the file header.
  if (row.stripeCouponId) {
    const deleted = await deleteAccountCoupon(row.stripeCouponId);
    if (!deleted.ok) reason = reason ?? deleted.error;
    else if (deleted.stub) reason = reason ?? deleted.reason;
  }

  return {
    synced: reason === undefined,
    stub: reason !== undefined,
    reason,
    couponId: null,
    appliedSubscriptionId: null,
  };
}

async function loadSubjectLabel(
  admin: SupabaseClient,
  subjectType: "workspace" | "talent",
  subjectId: string,
): Promise<string | null> {
  try {
    if (subjectType === "workspace") {
      const { data } = await admin
        .from("agencies")
        .select("display_name")
        .eq("id", subjectId)
        .maybeSingle();
      return (data as { display_name?: string | null } | null)?.display_name ?? null;
    }
    const { data } = await admin
      .from("talent_profiles")
      .select("display_name")
      .eq("id", subjectId)
      .maybeSingle();
    return (data as { display_name?: string | null } | null)?.display_name ?? null;
  } catch (err) {
    logServerError("admin-subscription-discounts.subjectLabel", err);
    return null;
  }
}

async function loadRow(
  admin: SupabaseClient,
  discountId: string,
): Promise<AccountDiscountRow | null> {
  const { data, error } = await admin
    .from("subscription_discounts")
    .select(ACCOUNT_DISCOUNT_SELECT)
    .eq("id", discountId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeAccountDiscount(data as Parameters<typeof normalizeAccountDiscount>[0]);
}

// ─── setAccountDiscount ──────────────────────────────────────────────────────

/**
 * Grant (or replace) the one active discount for an account.
 *
 * Replacement is explicit: the DB allows exactly one active row per subject, so
 * an existing grant is torn down first. Doing it silently in the UI would be
 * worse than the constraint error — the operator asked for "this deal now".
 */
export async function setAccountDiscount(
  raw: unknown,
): Promise<SetAccountDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = setSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-subscription-discounts.set.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const subjectId =
    input.subjectType === "workspace" ? input.tenantId! : input.talentProfileId!;
  const subjectColumn =
    input.subjectType === "workspace" ? "tenant_id" : "talent_profile_id";

  // Replace any existing active grant for this subject.
  const existing = await admin
    .from("subscription_discounts")
    .select(ACCOUNT_DISCOUNT_SELECT)
    .eq("status", "active")
    .eq(subjectColumn, subjectId)
    .maybeSingle();
  if (existing.data) {
    const prior = normalizeAccountDiscount(
      existing.data as Parameters<typeof normalizeAccountDiscount>[0],
    );
    await teardownAccountDiscount(admin, prior);
    await admin
      .from("subscription_discounts")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ended_by: gate.userId,
      })
      .eq("id", prior.id);
  }

  const insert = await admin
    .from("subscription_discounts")
    .insert({
      subject_type: input.subjectType,
      tenant_id: input.subjectType === "workspace" ? subjectId : null,
      talent_profile_id: input.subjectType === "talent" ? subjectId : null,
      kind: input.kind,
      value: input.value,
      currency: input.currency ?? null,
      duration: input.duration,
      duration_months: input.duration === "repeating" ? input.durationMonths! : null,
      status: "active",
      note: input.note ?? null,
      set_by: gate.userId,
    })
    .select(ACCOUNT_DISCOUNT_SELECT)
    .single();
  if (insert.error || !insert.data) {
    logServerError("admin-subscription-discounts.set.insert", insert.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const row = normalizeAccountDiscount(
    insert.data as Parameters<typeof normalizeAccountDiscount>[0],
  );
  const label = await loadSubjectLabel(admin, input.subjectType, subjectId);
  const stripe = await syncAccountDiscount(admin, row, label);

  revalidateCommerceSurfaces();
  return { ok: true, discountId: row.id, stripe };
}

// ─── endAccountDiscount ──────────────────────────────────────────────────────

export async function endAccountDiscount(
  raw: unknown,
): Promise<EndAccountDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = z.object({ discountId: pgUuidSchema() }).strict().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-subscription-discounts.end.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const row = await loadRow(admin, parsed.data.discountId);
  if (!row) return { ok: false, error: "Discount not found." };

  // DB first, so a Stripe hiccup cannot leave HQ showing a discount the
  // operator already ended.
  const upd = await admin
    .from("subscription_discounts")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ended_by: gate.userId,
    })
    .eq("id", row.id);
  if (upd.error) {
    logServerError("admin-subscription-discounts.end.update", upd.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const stripe = await teardownAccountDiscount(admin, row);
  if (stripe.reason) {
    await admin
      .from("subscription_discounts")
      .update({ sync_error: stripe.reason })
      .eq("id", row.id);
  }

  revalidateCommerceSurfaces();
  return { ok: true, stripe };
}

// ─── repairAccountDiscount ───────────────────────────────────────────────────

/**
 * Replay the Stripe half for a stub row — the post-key-cutover button, and the
 * retry after a transient Stripe failure. The idempotency key is derived from
 * the row id, so a repair that races a half-finished first attempt returns the
 * same coupon instead of minting a second one.
 */
export async function repairAccountDiscount(
  raw: unknown,
): Promise<SetAccountDiscountResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = z.object({ discountId: pgUuidSchema() }).strict().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-subscription-discounts.repair.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const row = await loadRow(admin, parsed.data.discountId);
  if (!row) return { ok: false, error: "Discount not found." };
  if (row.status !== "active") {
    return { ok: false, error: "Only an active discount can be repaired." };
  }

  const subjectId = row.tenantId ?? row.talentProfileId;
  const label = subjectId
    ? await loadSubjectLabel(admin, row.subjectType, subjectId)
    : null;
  const stripe = await syncAccountDiscount(admin, row, label);

  revalidateCommerceSurfaces();
  return { ok: true, discountId: row.id, stripe };
}

// ─── loadAccountDiscounts ────────────────────────────────────────────────────

/**
 * Every account discount, newest first, with the subject's display name so the
 * list reads as "Impronta — 30% off" rather than a uuid.
 */
export async function loadAccountDiscounts(): Promise<LoadAccountDiscountsResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { discounts: [] };

  const admin = createServiceRoleClient();
  if (!admin) return { discounts: [] };

  const { data, error } = await admin
    .from("subscription_discounts")
    .select(ACCOUNT_DISCOUNT_SELECT)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) {
    if (error) logServerError("admin-subscription-discounts.load", error);
    return { discounts: [] };
  }

  const rows = (data as Parameters<typeof normalizeAccountDiscount>[0][]).map(
    normalizeAccountDiscount,
  );
  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((v): v is string => !!v))];
  const talentIds = [
    ...new Set(rows.map((r) => r.talentProfileId).filter((v): v is string => !!v)),
  ];

  const labels = new Map<string, string>();
  if (tenantIds.length) {
    const { data: agencies } = await admin
      .from("agencies")
      .select("id, display_name")
      .in("id", tenantIds);
    for (const a of (agencies ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (a.display_name) labels.set(a.id, a.display_name);
    }
  }
  if (talentIds.length) {
    const { data: talents } = await admin
      .from("talent_profiles")
      .select("id, display_name")
      .in("id", talentIds);
    for (const t of (talents ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (t.display_name) labels.set(t.id, t.display_name);
    }
  }

  return {
    discounts: rows.map((row) => ({
      ...row,
      subjectLabel: labels.get(row.tenantId ?? row.talentProfileId ?? "") ?? null,
    })),
  };
}
