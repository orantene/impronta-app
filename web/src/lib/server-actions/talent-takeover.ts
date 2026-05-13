"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import type { ServerActionResult } from "./result";

/**
 * F.7 — Talent take-over of an agency-managed profile.
 *
 * Workflow: an agency creates a talent profile (admin-managed), sends
 * the talent a claim invite, and the talent eventually signs up. At
 * that point the talent should be able to "take over" their own
 * profile: keep all the photos / bio / history the agency uploaded,
 * but assume edit rights, ownership of the profile URL, and the
 * agency_managed → claimed lifecycle transition.
 *
 * This action is talent-self-initiated (auth.uid() must match the
 * profile.user_id linkage that gets set during sign-up). Agencies
 * cannot trigger takeover on a talent's behalf — by design, the
 * talent owns the moment.
 *
 * The transition is logged via the existing talent_profile_audit_log
 * (when present) and revalidates roster + share routes so the new
 * ownership is visible immediately.
 */

export type TakeoverResult = ServerActionResult<{
  talentProfileId: string;
  previousWorkflowStatus: string;
  newWorkflowStatus: string;
}>;

export async function takeOverOwnProfile(
  talentProfileId: string,
): Promise<TakeoverResult> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in to claim your profile.", reason: "unauthenticated" };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Look up the target profile. Must already be linked to this user
    // (via the signup flow that matches invitation_email).
    const { data: talent } = await admin
      .from("talent_profiles")
      .select("id, user_id, workflow_status, display_name")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (!talent) return { ok: false, error: "Profile not found.", reason: "not_found" };

    const t = talent as {
      id: string;
      user_id: string | null;
      workflow_status: string;
      display_name: string | null;
    };

    if (t.user_id !== user.id) {
      return {
        ok: false,
        error: "This profile isn't linked to your account. Contact the agency to verify the invite.",
        reason: "forbidden",
      };
    }

    if (t.workflow_status === "claimed" || t.workflow_status === "approved" || t.workflow_status === "published") {
      // Already in a talent-owned state — takeover is a no-op.
      return {
        ok: false,
        error: "You already own this profile.",
        reason: "already_exists",
      };
    }

    const previousStatus = t.workflow_status;
    // Workflow transition: anything pre-claim ("draft", "invited",
    // "pending") → "claimed". From there the talent can submit for
    // approval and the agency can move them to "approved" / "published".
    const newStatus = "claimed";

    const { error: updateErr } = await admin
      .from("talent_profiles")
      .update({
        workflow_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", talentProfileId);

    if (updateErr) {
      logServerError("talent-takeover.update", updateErr);
      return { ok: false, error: "Couldn't complete takeover. Try again.", reason: "unexpected" };
    }

    // Mark any pending claim invite as redeemed.
    await admin
      .from("talent_claim_invitations")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user.id,
      })
      .eq("talent_profile_id", talentProfileId)
      .is("redeemed_at", null)
      .is("revoked_at", null);

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        talentProfileId,
        previousWorkflowStatus: previousStatus,
        newWorkflowStatus: newStatus,
      },
    };
  } catch (err) {
    logServerError("talent-takeover", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

/**
 * F.7 — Submit a claimed profile for agency review.
 *
 * After takeover the talent's workflow_status sits at "claimed". When
 * they're ready (added photos, filled bio, etc), they push this to
 * "review" and the agency can approve / reject from there.
 *
 * Talent-self-initiated. Validates the profile has the minimum fields
 * for review (display name + at least one photo).
 */
export async function submitProfileForReview(
  talentProfileId: string,
): Promise<ServerActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in first.", reason: "unauthenticated" };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: talent } = await admin
      .from("talent_profiles")
      .select("user_id, workflow_status, display_name")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (!talent) return { ok: false, error: "Profile not found.", reason: "not_found" };
    const t = talent as { user_id: string | null; workflow_status: string; display_name: string | null };

    if (t.user_id !== user.id) {
      return { ok: false, error: "Not your profile.", reason: "forbidden" };
    }

    if (!t.display_name?.trim()) {
      return {
        ok: false,
        error: "Add your display name before submitting.",
        reason: "validation_failed",
      };
    }

    if (t.workflow_status !== "claimed") {
      return {
        ok: false,
        error: t.workflow_status === "review"
          ? "Already submitted — the agency is reviewing."
          : "Take over your profile first.",
        reason: "already_exists",
      };
    }

    const { error: updateErr } = await admin
      .from("talent_profiles")
      .update({ workflow_status: "review", updated_at: new Date().toISOString() })
      .eq("id", talentProfileId);

    if (updateErr) {
      logServerError("talent-takeover.submitForReview", updateErr);
      return { ok: false, error: "Couldn't submit for review.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("talent-takeover.submitForReview", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
