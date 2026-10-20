"use server";

/**
 * TUL-1374: apply the Friends collective preset to the signed-in owner's
 * workspace. It records the model (`agencies.work_model`) and points the
 * workspace's default coordinator at the owner, so every new request lands in
 * the owner's inbox; members already see only the job card and their own talent
 * thread (messaging/thread-rule.ts). Owner only, seat-checked, idempotent,
 * audited. The onboarding model picker (TUL-1370) and the owner screen
 * (TUL-1369) call this; nothing else writes `work_model`.
 */
import { revalidatePath } from "next/cache";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { decideFriendsCollectivePreset } from "./friends-collective";

export type ApplyPresetResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "unauthenticated" | "owner_only" | "over_seat_cap" | "model_already_set" | "unavailable"; message?: string };

export async function applyFriendsCollectivePreset(): Promise<ApplyPresetResult> {
  await requireNotImpersonating();
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: membership } = await tenantScopedQuery(supabase, "agency_memberships", tenantId)
      .select("role")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const role = (membership as { role?: string } | null)?.role ?? null;

    // Before the held migration the column does not exist: say so, change nothing.
    const { data: agency, error: agencyErr } = await admin
      .from("agencies")
      .select("work_model, default_coordinator_user_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (agencyErr || !agency) return { ok: false, reason: "unavailable" };
    const row = agency as { work_model: string | null; default_coordinator_user_id: string | null };

    // additionalSeats = 0: ok only when the roster already fits the plan's cap.
    const seats = await checkRosterSeatAvailability(admin, tenantId, 0);

    const decision = decideFriendsCollectivePreset({
      role,
      ownerUserId: user.id,
      currentModel: row.work_model,
      defaultCoordinatorUserId: row.default_coordinator_user_id,
      seatOk: seats.ok,
    });
    if (!decision.ok) {
      return { ok: false, reason: decision.reason, ...(decision.reason === "over_seat_cap" ? { message: seats.message } : {}) };
    }
    if (decision.changed) {
      const { error } = await admin.from("agencies").update(decision.set).eq("id", tenantId);
      if (error) {
        logServerError("friends-collective.apply", error);
        return { ok: false, reason: "unavailable" };
      }
      scheduleWorkspaceAudit({
        tenantId,
        category: "settings",
        action: "workspace.work_model.set",
        summary: "Set the workspace model to Friends collective",
        targetType: "agency",
        targetId: tenantId,
        metadata: { work_model: decision.set.work_model, coordinator: "owner" },
      });
      revalidatePath("/", "layout");
    }
    return { ok: true, changed: decision.changed };
  } catch (err) {
    logServerError("friends-collective.apply", err);
    return { ok: false, reason: "unavailable" };
  }
}
