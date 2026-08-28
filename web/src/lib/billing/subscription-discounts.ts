/**
 * subscription-discounts.ts — per-account subscription discounts, the Stripe half.
 *
 * WHY THIS EXISTS: until now the only lever for "give this one account a better
 * deal" was a PLAN OVERRIDE — a 100%-off grant whose `grant_kind='promo'` label
 * reads like a discount and has zero billing effect. Stripe never heard about
 * it, so the invoice charged full price. `subscription_discounts` is the honest
 * store; this module is its executor.
 *
 * Stripe has no customer-scoped coupon, so the shape is "private coupon +
 * attach": one coupon per row, NEVER a promotion code (a promotion code is a
 * typeable string — the whole point of an account discount is that nobody else
 * can redeem it), applied to the live subscription, or handed to Checkout when
 * the account has not subscribed yet.
 *
 * Stub contract is the house one (`lib/pricing/stripe-discount-sync.ts`): with
 * STRIPE_SECRET_KEY unset every write returns `{ ok: true, stub: true, reason }`
 * so the DB row still exists and the admin shows amber. `repairAccountDiscount`
 * replays the same idempotency key once the key is wired.
 *
 * `applyDiscountToSubscription` is the FIRST `stripe.subscriptions.update` in
 * this codebase — deliberately isolated here, with a deterministic idempotency
 * key and typed results, so the blast radius of the new capability is one file.
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountDiscountSubjectType = "workspace" | "talent";
export type AccountDiscountKind = "percent" | "fixed";
export type AccountDiscountDuration = "once" | "repeating" | "forever";
export type AccountDiscountStatus = "active" | "ended";

/** The `subscription_discounts` row, in app casing. */
export type AccountDiscountRow = {
  id: string;
  subjectType: AccountDiscountSubjectType;
  tenantId: string | null;
  talentProfileId: string | null;
  kind: AccountDiscountKind;
  value: number;
  currency: string | null;
  duration: AccountDiscountDuration;
  durationMonths: number | null;
  status: AccountDiscountStatus;
  stripeCouponId: string | null;
  appliedSubscriptionId: string | null;
  appliedAt: string | null;
  syncError: string | null;
  note: string | null;
  createdAt: string;
  endedAt: string | null;
};

/** Everything `buildAccountCouponParams` needs — a row, plus a display label. */
export type AccountCouponInput = {
  id: string;
  subjectType: AccountDiscountSubjectType;
  tenantId: string | null;
  talentProfileId: string | null;
  kind: AccountDiscountKind;
  value: number;
  currency: string | null;
  duration: AccountDiscountDuration;
  durationMonths: number | null;
  /** Human name for the coupon in the Stripe dashboard. Falls back to the id. */
  subjectLabel?: string | null;
};

export type AccountCouponResult =
  | { ok: true; couponId: string; stub: false }
  | { ok: true; couponId: null; stub: true; reason: string }
  | { ok: false; error: string };

export type StripeWriteResult =
  | { ok: true; stub: false }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string };

/** The four mirror columns on `workspace_subscriptions` / `talent_subscriptions`. */
export type SubscriptionDiscountMirror = {
  couponId: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  endsAt: string | null;
};

/**
 * Sentinel: `subscription.discounts` held a bare `di_…` id, so the discount was
 * not expanded and we cannot read its shape without a second API call. Distinct
 * from `null` ("there is genuinely no discount"), because the two must NOT do
 * the same thing — treating unexpanded as "none" would null the mirror columns
 * on every webhook that forgot the expand, silently erasing a live discount.
 */
export const UNEXPANDED_DISCOUNT = { unexpanded: true } as const;
export type UnexpandedDiscount = typeof UNEXPANDED_DISCOUNT;

export function isUnexpandedDiscount(
  value: SubscriptionDiscountMirror | UnexpandedDiscount | null,
): value is UnexpandedDiscount {
  return value !== null && "unexpanded" in value;
}

/** Empty mirror — what a subscription with no discount writes to the DB. */
export const EMPTY_DISCOUNT_MIRROR: SubscriptionDiscountMirror = {
  couponId: null,
  percentOff: null,
  amountOffCents: null,
  currency: null,
  endsAt: null,
};

// ─── Pure: coupon parameter mapping ──────────────────────────────────────────

/**
 * Map one `subscription_discounts` row onto Stripe coupon-create params.
 *
 * PURE and exported for tests — the mapping is the part that silently bills the
 * wrong amount when it drifts. `value` is in MAJOR units for `fixed` (10 = $10)
 * exactly as the admin form takes it; Stripe wants minor units, so the ×100
 * lives here and nowhere else.
 *
 * "N months free" is not a kind: it is `percent 100 / repeating / N`.
 */
export function buildAccountCouponParams(
  input: AccountCouponInput,
): Stripe.CouponCreateParams {
  const subject =
    input.subjectLabel?.trim() ||
    input.tenantId ||
    input.talentProfileId ||
    input.id;

  const metadata: Record<string, string> = {
    subscription_discount_id: input.id,
    subject_type: input.subjectType,
  };
  if (input.tenantId) metadata.tenant_id = input.tenantId;
  if (input.talentProfileId) metadata.talent_profile_id = input.talentProfileId;

  const params: Stripe.CouponCreateParams = {
    name: `Account discount · ${subject}`,
    duration: input.duration,
    metadata,
  };

  if (input.duration === "repeating") {
    const months = Math.max(1, Math.round(input.durationMonths ?? 1));
    params.duration_in_months = months;
  }

  if (input.kind === "percent") {
    params.percent_off = input.value;
  } else {
    if (!input.currency) {
      throw new Error("Fixed-amount account discounts require a currency.");
    }
    params.amount_off = Math.round(input.value * 100);
    params.currency = input.currency.toLowerCase();
  }

  return params;
}

// ─── Pure: read-back extraction ──────────────────────────────────────────────

type DiscountLike = {
  end?: number | null;
  /** SDK v22 nests the coupon under `source`; older shapes had it top-level. */
  source?: { coupon?: string | CouponLike | null } | null;
  coupon?: string | CouponLike | null;
};

type CouponLike = {
  id?: string;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
};

function couponIdOf(coupon: string | CouponLike | null | undefined): string | null {
  if (!coupon) return null;
  return typeof coupon === "string" ? coupon : coupon.id ?? null;
}

/**
 * Read the FIRST discount off a Stripe subscription into our four mirror
 * columns. Returns `null` when there is none — the caller must write that
 * through as nulls, which is how a discount removed in the Stripe dashboard
 * propagates back into our tables instead of lingering forever.
 *
 * Returns {@link UNEXPANDED_DISCOUNT} when the entry is a bare `di_…` string:
 * the caller retrieves once with `expand: ["discounts"]` rather than guessing.
 */
export function extractSubscriptionDiscount(sub: {
  discounts?: Array<string | DiscountLike> | null;
}): SubscriptionDiscountMirror | UnexpandedDiscount | null {
  const entry = sub.discounts?.[0];
  if (entry == null) return null;
  if (typeof entry === "string") return UNEXPANDED_DISCOUNT;

  const rawCoupon = entry.source?.coupon ?? entry.coupon ?? null;
  const coupon = typeof rawCoupon === "string" ? null : rawCoupon;

  return {
    couponId: couponIdOf(rawCoupon),
    percentOff: coupon?.percent_off ?? null,
    amountOffCents: coupon?.amount_off ?? null,
    currency: coupon?.currency ?? null,
    endsAt: entry.end ? new Date(entry.end * 1000).toISOString() : null,
  };
}

// ─── Stripe writes ───────────────────────────────────────────────────────────

function stubbed(reason: string): { ok: true; stub: true; reason: string } {
  return { ok: true, stub: true, reason };
}

/**
 * Create the private coupon for one discount row.
 *
 * Idempotency key `subdisc-{rowId}` is deterministic on purpose: a repair run
 * for the same row returns the coupon the first attempt created rather than
 * minting a second one. NEVER paired with a promotion code — see the header.
 */
export async function createAccountCoupon(
  input: AccountCouponInput,
): Promise<AccountCouponResult> {
  if (!isStripeConfigured()) {
    return {
      ok: true,
      couponId: null,
      stub: true,
      reason: "STRIPE_SECRET_KEY not set — saved in DB only.",
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      couponId: null,
      stub: true,
      reason: "Stripe client unavailable — saved in DB only.",
    };
  }

  let params: Stripe.CouponCreateParams;
  try {
    params = buildAccountCouponParams(input);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid discount shape.",
    };
  }

  try {
    const coupon = await stripe.coupons.create(params, {
      idempotencyKey: `subdisc-${input.id}`,
    });
    return { ok: true, couponId: coupon.id, stub: false };
  } catch (err) {
    logServerError("subscription-discounts.createCoupon", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe API error",
    };
  }
}

/**
 * Attach a coupon to a live subscription — the first `subscriptions.update` in
 * this codebase. `discounts: [{ coupon }]` REPLACES whatever discount the
 * subscription carried, which is what we want: one account discount at a time,
 * matching the one-active-per-subject index in the DB.
 */
export async function applyDiscountToSubscription(
  subscriptionId: string,
  couponId: string,
): Promise<StripeWriteResult> {
  if (!isStripeConfigured()) {
    return stubbed("STRIPE_SECRET_KEY not set — discount not attached.");
  }
  const stripe = getStripe();
  if (!stripe) {
    return stubbed("Stripe client unavailable — discount not attached.");
  }
  try {
    await stripe.subscriptions.update(subscriptionId, {
      discounts: [{ coupon: couponId }],
    });
    return { ok: true, stub: false };
  } catch (err) {
    logServerError("subscription-discounts.applyToSubscription", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe API error",
    };
  }
}

/** True when Stripe is telling us there was nothing to remove. */
function isMissingDiscountError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  const code = (err as { code?: string } | null)?.code ?? "";
  return (
    code === "resource_missing" ||
    message.includes("no active discount") ||
    message.includes("no such discount") ||
    message.includes("does not have a discount")
  );
}

/**
 * Detach the discount from a subscription. IDEMPOTENT: "there is no discount"
 * is success, not an error — an end-discount action must be safe to re-run
 * after a partial failure, and the operator's goal (no discount on this sub) is
 * already met.
 */
export async function removeDiscountFromSubscription(
  subscriptionId: string,
): Promise<StripeWriteResult> {
  if (!isStripeConfigured()) {
    return stubbed("STRIPE_SECRET_KEY not set — nothing detached.");
  }
  const stripe = getStripe();
  if (!stripe) {
    return stubbed("Stripe client unavailable — nothing detached.");
  }
  try {
    await stripe.subscriptions.deleteDiscount(subscriptionId);
    return { ok: true, stub: false };
  } catch (err) {
    if (isMissingDiscountError(err)) return { ok: true, stub: false };
    logServerError("subscription-discounts.removeFromSubscription", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe API error",
    };
  }
}

/**
 * Delete the coupon. Best-effort and ALWAYS called AFTER the detach: deleting a
 * coupon does not detach it from subscriptions already using it, so the reverse
 * order leaves an undeletable discount billing forever.
 */
export async function deleteAccountCoupon(
  couponId: string,
): Promise<StripeWriteResult> {
  if (!isStripeConfigured()) {
    return stubbed("STRIPE_SECRET_KEY not set — coupon not deleted.");
  }
  const stripe = getStripe();
  if (!stripe) {
    return stubbed("Stripe client unavailable — coupon not deleted.");
  }
  try {
    await stripe.coupons.del(couponId);
    return { ok: true, stub: false };
  } catch (err) {
    if (isMissingDiscountError(err)) return { ok: true, stub: false };
    logServerError("subscription-discounts.deleteCoupon", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe API error",
    };
  }
}

// ─── Read-back for the webhook sync ──────────────────────────────────────────

/**
 * Resolve the mirror columns for a subscription the webhook just received.
 *
 * The common path costs ZERO extra API calls: `expand: ["discounts"]` on the
 * retrieve means the array is already objects, and a subscription with no
 * discount short-circuits before any network work. Only the two degraded shapes
 * pay: an unexpanded `di_…` (one subscription retrieve) and an unexpanded
 * coupon reference (one coupon retrieve, so the percentage the MRR math nets
 * out is not silently null).
 */
export async function resolveSubscriptionDiscountMirror(
  subscription: Stripe.Subscription,
): Promise<SubscriptionDiscountMirror> {
  let extracted = extractSubscriptionDiscount(
    subscription as unknown as { discounts?: Array<string | DiscountLike> | null },
  );
  if (extracted === null) return EMPTY_DISCOUNT_MIRROR;

  const stripe = getStripe();

  if (isUnexpandedDiscount(extracted)) {
    if (!stripe) return EMPTY_DISCOUNT_MIRROR;
    try {
      const fresh = await stripe.subscriptions.retrieve(subscription.id, {
        expand: ["discounts"],
      });
      extracted = extractSubscriptionDiscount(
        fresh as unknown as { discounts?: Array<string | DiscountLike> | null },
      );
    } catch (err) {
      logServerError("subscription-discounts.reexpand", err);
      return EMPTY_DISCOUNT_MIRROR;
    }
    if (extracted === null) return EMPTY_DISCOUNT_MIRROR;
    if (isUnexpandedDiscount(extracted)) return EMPTY_DISCOUNT_MIRROR;
  }

  const mirror: SubscriptionDiscountMirror = extracted;
  if (
    mirror.couponId &&
    mirror.percentOff == null &&
    mirror.amountOffCents == null &&
    stripe
  ) {
    try {
      const coupon = await stripe.coupons.retrieve(mirror.couponId);
      return {
        ...mirror,
        percentOff: coupon.percent_off ?? null,
        amountOffCents: coupon.amount_off ?? null,
        currency: coupon.currency ?? null,
      };
    } catch (err) {
      logServerError("subscription-discounts.couponRetrieve", err);
    }
  }
  return mirror;
}

// ─── DB reads / reconciliation ───────────────────────────────────────────────

type RawRow = {
  id: string;
  subject_type: string;
  tenant_id: string | null;
  talent_profile_id: string | null;
  kind: string;
  value: number;
  currency: string | null;
  duration: string;
  duration_months: number | null;
  status: string;
  stripe_coupon_id: string | null;
  applied_subscription_id: string | null;
  applied_at: string | null;
  sync_error: string | null;
  note: string | null;
  created_at: string;
  ended_at: string | null;
};

export const ACCOUNT_DISCOUNT_SELECT =
  "id, subject_type, tenant_id, talent_profile_id, kind, value, currency, duration, duration_months, status, stripe_coupon_id, applied_subscription_id, applied_at, sync_error, note, created_at, ended_at";

/** Normalize a DB row. Exported so the action layer shares one shape. */
export function normalizeAccountDiscount(raw: RawRow): AccountDiscountRow {
  return {
    id: raw.id,
    subjectType: raw.subject_type === "talent" ? "talent" : "workspace",
    tenantId: raw.tenant_id,
    talentProfileId: raw.talent_profile_id,
    kind: raw.kind === "fixed" ? "fixed" : "percent",
    value: Number(raw.value),
    currency: raw.currency,
    duration:
      raw.duration === "once" || raw.duration === "repeating"
        ? raw.duration
        : "forever",
    durationMonths: raw.duration_months,
    status: raw.status === "ended" ? "ended" : "active",
    stripeCouponId: raw.stripe_coupon_id,
    appliedSubscriptionId: raw.applied_subscription_id,
    appliedAt: raw.applied_at,
    syncError: raw.sync_error,
    note: raw.note,
    createdAt: raw.created_at,
    endedAt: raw.ended_at,
  };
}

export type AccountDiscountSubject = {
  subjectType: AccountDiscountSubjectType;
  tenantId?: string | null;
  talentProfileId?: string | null;
};

/**
 * The one ACTIVE discount for a subject, or null. Used by checkout (to hand the
 * coupon to a Session) and by the admin (to replace an existing grant).
 */
export async function loadActiveAccountDiscount(
  subject: AccountDiscountSubject,
): Promise<AccountDiscountRow | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  const subjectId =
    subject.subjectType === "workspace"
      ? subject.tenantId
      : subject.talentProfileId;
  if (!subjectId) return null;

  try {
    const { data, error } = await sb
      .from("subscription_discounts")
      .select(ACCOUNT_DISCOUNT_SELECT)
      .eq("status", "active")
      .eq(
        subject.subjectType === "workspace" ? "tenant_id" : "talent_profile_id",
        subjectId,
      )
      .maybeSingle();
    if (error || !data) return null;
    return normalizeAccountDiscount(data as RawRow);
  } catch (err) {
    logServerError("subscription-discounts.loadActive", err);
    return null;
  }
}

/**
 * Confirm a grant against what Stripe actually reports.
 *
 * This is how a discount granted BEFORE the account subscribed gets stamped:
 * the row sat with `applied_subscription_id` null until the customer checked
 * out with the coupon; the first webhook that reports that coupon on a
 * subscription closes the loop. Best-effort — a failure here must never fail a
 * webhook, it just leaves the row unconfirmed for the next event.
 */
export async function reconcileAppliedDiscount(input: {
  couponId: string;
  subscriptionId: string;
}): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) return;
  try {
    await sb
      .from("subscription_discounts")
      .update({
        applied_subscription_id: input.subscriptionId,
        applied_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("status", "active")
      .eq("stripe_coupon_id", input.couponId);
  } catch (err) {
    logServerError("subscription-discounts.reconcile", err);
  }
}
