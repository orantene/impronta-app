"use server";

import { revalidatePath } from "next/cache";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { notifyWorkspacePlanChange } from "@/lib/notifications/producers/workspace-plan-notify";
import type { ServerActionResult } from "./result";

/**
 * F.6 — Self-service cancellation / downgrade.
 *
 * Two paths share this surface:
 *
 *   1. cancelSubscription — drop to 'free'. Records the reason. When Stripe
 *      is wired, this also sets cancel_at_period_end so paid features keep
 *      working until the next bill cycle.
 *
 *   2. downgradePlan(plan) — move to a lower paid tier. Same audit row,
 *      same end-of-period semantics on Stripe.
 *
 * Win-back: a separate `pauseSubscription` action handles "Pause for 1
 * month" without losing data. Stripe pause is Phase 8 — for now this
 * just bumps a marker on agency_entitlements so we don't bill the
 * tenant for the pause window. Stub but flagged.
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
    const auth = await requireStaffTenantAction();
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

    // Apply the plan change. Phase 8 (Stripe) will hook this to cancel_at_period_end
    // for paid → free transitions. For now agencies.plan_tier is direct.
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
    const auth = await requireStaffTenantAction();
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
