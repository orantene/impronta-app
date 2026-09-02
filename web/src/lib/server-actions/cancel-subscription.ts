"use server";

import { revalidatePath } from "next/cache";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { notifyWorkspacePlanChange } from "@/lib/notifications/producers/workspace-plan-notify";
import {
  cancelWorkspaceSubscriptionAtPeriodEnd,
  pauseWorkspaceSubscriptionCollection,
  hasLiveWorkspaceSubscription,
} from "@/lib/stripe/workspace-billing";
import type { ServerActionResult } from "./result";

/**
 * F.6 — Self-service cancellation / downgrade.
 *
 * Two paths share this surface:
 *
 *   1. cancelSubscription — stop billing. For a tenant with a live Stripe
 *      subscription this sets `cancel_at_period_end` AT STRIPE and leaves the
 *      plan tier untouched: they keep what they paid for until the period ends,
 *      and the `customer.subscription.deleted` webhook drops them to free when
 *      it does. For a free or comped tenant (no Stripe subscription) the plan
 *      is written directly, which is correct — there is nothing to cancel.
 *
 *   2. downgradePlan(plan) — move to a lower PAID tier. Refused while a live
 *      Stripe subscription exists; see the note on that action.
 *
 * Win-back: `pauseSubscription` now uses Stripe `pause_collection` so invoices
 * during the pause are voided rather than piling up.
 *
 * ── What this used to do, and why it changed (finance audit, 2026-09-01) ──────
 * Every path here wrote `agencies.plan_tier` directly and never contacted
 * Stripe. The comment in the code was explicit that this was temporary. The
 * result: a customer who cancelled lost access immediately and KEPT BEING
 * CHARGED, and because `syncStripeSubscriptionToDb` keeps `plan_tier` in step
 * with Stripe, the next `customer.subscription.updated` webhook silently put
 * the cancelled tier back.
 *
 * The rule now is: when Stripe owns the subscription, Stripe decides when the
 * plan changes and the webhook writes the tier. This module never races it.
 */

export type CancelReason =
  | "too_expensive"
  | "not_using"
  | "missing_feature"
  | "found_alternative"
  | "paused_business"
  | "technical_issue"
  | "other";

const VALID_REASONS = new Set<CancelReason>([
  "too_expensive",
  "not_using",
  "missing_feature",
  "found_alternative",
  "paused_business",
  "technical_issue",
  "other",
]);

const VALID_PLANS = new Set(["free", "studio", "agency", "network"]);

export type CancelSubscriptionInput = {
  reason: CancelReason;
  feedback?: string | null;
  /** Defaults to 'free' (full cancel). Use 'studio' / 'agency' for downgrade. */
  toPlan?: "free" | "studio" | "agency";
};

export async function cancelSubscription(
  input: CancelSubscriptionInput,
): Promise<ServerActionResult<{ fromPlan: string; toPlan: string; effectiveAt: string }>> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;

    if (!VALID_REASONS.has(input.reason)) {
      return { ok: false, error: "Pick a reason for cancelling.", reason: "validation_failed" };
    }

    const toPlan = input.toPlan ?? "free";
    if (!VALID_PLANS.has(toPlan)) {
      return { ok: false, error: "Invalid target plan.", reason: "validation_failed" };
    }

    // Owner / admin only.
    const { data: myMembership } = await supabase
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const myRole = (myMembership as { role?: string } | null)?.role;
    if (myRole !== "owner" && myRole !== "admin") {
      return { ok: false, error: "Only the owner or admin can change the plan.", reason: "forbidden" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Read current plan for the audit row.
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle();
    const fromPlan = (agencyRow as { plan_tier?: string } | null)?.plan_tier ?? "free";

    if (fromPlan === toPlan) {
      return {
        ok: false,
        error: `You're already on ${toPlan}.`,
        reason: "already_exists",
      };
    }

    // Record the cancellation event. Failure here is non-blocking — the
    // plan change still proceeds even if audit insert fails.
    const effectiveAt = new Date().toISOString();
    const { error: insertErr } = await admin
      .from("subscription_cancellations")
      .insert({
        tenant_id: tenantId,
        cancelled_by_user_id: user.id,
        from_plan: fromPlan,
        to_plan: toPlan,
        reason: input.reason,
        feedback: input.feedback?.trim() || null,
        effective_at: effectiveAt,
      });
    if (insertErr) {
      logServerError("cancel-subscription.audit-insert", insertErr);
      // Continue — don't block the plan change on audit failure.
    }

    // ── Stripe first, then (only if Stripe has nothing) the local plan ───────
    //
    // A tenant with a live Stripe subscription must be cancelled AT STRIPE.
    // Writing plan_tier here instead is what caused the audit finding: access
    // vanished, billing continued, and the next webhook restored the tier.
    const stripeHasSubscription = await hasLiveWorkspaceSubscription(tenantId);

    if (stripeHasSubscription && toPlan !== "free") {
      // A paid → lower-paid move needs the price to change at the next renewal
      // while the customer keeps the tier they have already paid for. Doing
      // that correctly needs a Stripe subscription schedule, which is not built
      // yet. Refusing is the honest answer: the previous behaviour dropped
      // their features AND kept charging the higher price.
      return {
        ok: false,
        error:
          "Changing between paid plans isn't self-serve yet. Contact support and we'll move you at your next renewal, with nothing charged twice.",
        reason: "validation_failed",
      };
    }

    if (stripeHasSubscription) {
      const cancelled = await cancelWorkspaceSubscriptionAtPeriodEnd(tenantId);
      if (!cancelled.ok) {
        return { ok: false, error: cancelled.error, reason: "unexpected" };
      }
      // Deliberately NO plan_tier write. They keep the plan they paid for; the
      // customer.subscription.deleted webhook drops it to free at period end.
      const endsAt = cancelled.data.effectiveAt ?? effectiveAt;
      revalidatePath("/", "layout");
      return { ok: true, data: { fromPlan, toPlan, effectiveAt: endsAt } };
    }

    // No Stripe subscription (free or comped tenant): nothing to cancel, so the
    // direct plan write is the correct and only thing to do.
    const seatLimit = seatCapForPlan(toPlan);
    const { error: updateErr } = await admin
      .from("agencies")
      .update({
        plan_tier: toPlan,
        talent_seat_limit: seatLimit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateErr) {
      logServerError("cancel-subscription.plan-update", updateErr);
      return { ok: false, error: "Couldn't apply plan change. Try again.", reason: "unexpected" };
    }

    // Slice 15.4: billing plan-change notice (spec §6.6, REQUIRED category).
    // Routes through the notification catalog so the workspace owner(s) get the
    // right channel mix — a full cancel (→ free) emails the cancellation
    // receipt, a downgrade (→ lower paid tier) sends the plan-change email +
    // in-app bell. The dispatcher resolves the tenant brand + recipients and
    // no-ops without RESEND_API_KEY; fire-and-forget, never blocks the change.
    notifyWorkspacePlanChange({
      tenantId,
      fromPlan,
      toPlan,
      effectiveAtIso: effectiveAt,
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: { fromPlan, toPlan, effectiveAt },
    };
  } catch (err) {
    logServerError("cancel-subscription", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

/**
 * Pause-subscription stub — keeps the plan tier intact but flags a
 * "paused until" date for billing to skip charges. Stripe wiring is
 * Phase 8; this action just records the intent so product can A/B the
 * win-back flow without waiting on billing infra.
 */
export async function pauseSubscription(
  pauseUntilIso: string,
): Promise<ServerActionResult<{ pausedUntil: string }>> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    const pauseDate = new Date(pauseUntilIso);
    if (Number.isNaN(pauseDate.getTime()) || pauseDate.getTime() < Date.now()) {
      return { ok: false, error: "Pause date must be in the future.", reason: "validation_failed" };
    }
    // Cap at 90 days.
    const maxPause = Date.now() + 90 * 86_400_000;
    if (pauseDate.getTime() > maxPause) {
      return { ok: false, error: "Maximum pause is 90 days.", reason: "validation_failed" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Actually stop the invoices. Previously this action recorded an analytics
    // row and nothing else, so a customer who "paused" kept being billed
    // through the whole pause window.
    const paused = await pauseWorkspaceSubscriptionCollection(tenantId, pauseDate.toISOString());
    if (!paused.ok) {
      return { ok: false, error: paused.error, reason: "unexpected" };
    }

    // Record as a "paused_business" cancellation row for analytics; the
    // plan stays where it is.
    await admin.from("subscription_cancellations").insert({
      tenant_id: tenantId,
      cancelled_by_user_id: user.id,
      from_plan: "paused",
      to_plan: "paused",
      reason: "paused_business",
      feedback: `Paused until ${pauseDate.toISOString()}`,
      effective_at: new Date().toISOString(),
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { pausedUntil: pauseDate.toISOString() } };
  } catch (err) {
    logServerError("pause-subscription", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
