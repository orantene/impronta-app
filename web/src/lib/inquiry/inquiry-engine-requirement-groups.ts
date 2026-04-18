import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryAction } from "./inquiry-action-log";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

// ─────────────────────────────────────────────────────────────────────────────
// M2.2 — Requirement group engine actions (Admin Workspace V3).
// Ref: docs/admin-workspace-spec.md §3.5, §3.6, §3.7;
//      docs/admin-workspace-roadmap.md §M2.2.
//
// Each wrapper:
//   1. Gates on validateActorPermission — we reuse "reassign_coordinator" as
//      the permission key because requirement-group mutations are restricted
//      to the same staff role set (admin + active coordinator on the inquiry).
//      Adding a dedicated key would require a policy-layer change out of M2.2
//      scope; the RPC re-checks is_agency_staff() server-side as defence in
//      depth.
//   2. Calls the SECURITY DEFINER RPC. The RPC owns the compound write
//      (requirement_groups row + engine_emit_event) transactionally.
//   3. Maps RAISE EXCEPTION sentinels to an EngineResult.
//   4. Calls logInquiryAction on BOTH success and failure for
//      assignParticipantToGroup (participant_moved_group — spec §10.2).
//      Group CRUD does NOT have a dedicated action type in the Phase 1 closed
//      set; the staff_only engine event stream is the audit record for those.
//   5. Dispatches the in-process emitStandardEngineEvent for side-effects the
//      RPC doesn't own (improntaLog; no notifications in Phase 1 since these
//      are staff-only).
//
// No UI callers are wired in M2.2 — these wrappers are the server-side
// foundation for the M4/M5 drill-downs.
// ─────────────────────────────────────────────────────────────────────────────

function mapRequirementGroupRpcError(msg: string): string {
  // Short codes match the RPC's RAISE EXCEPTION literals 1:1 for easy filtering.
  if (msg.includes("inquiry_booked_use_adjustment_flow")) return "inquiry_booked_use_adjustment_flow";
  if (msg.includes("group_has_participants"))             return "group_has_participants";
  if (msg.includes("group_required"))                     return "group_required";
  if (msg.includes("participant_not_found"))              return "participant_not_found";
  if (msg.includes("not_talent_participant"))             return "not_talent_participant";
  if (msg.includes("group_not_on_inquiry"))               return "group_not_on_inquiry";
  if (msg.includes("group_not_found"))                    return "group_not_found";
  if (msg.includes("invalid_role_key"))                   return "invalid_role_key";
  if (msg.includes("invalid_quantity"))                   return "invalid_quantity";
  if (msg.includes("inquiry_frozen"))                     return "inquiry_frozen";
  if (msg.includes("not_found"))                          return "not_found";
  if (msg.includes("forbidden"))                          return "forbidden";
  return msg || "unknown";
}

export type AddRequirementGroupCtx = {
  inquiryId: string;
  roleKey: string;
  quantityRequired: number;
  notes?: string | null;
  actorUserId: string;
};

export async function addRequirementGroup(
  supabase: SupabaseClient,
  ctx: AddRequirementGroupCtx,
): Promise<EngineResult<{ groupId: string }>> {
  return runWithEngineLog("addRequirementGroup", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data, error } = await supabase.rpc("engine_add_requirement_group", {
      p_inquiry_id: ctx.inquiryId,
      p_role_key: ctx.roleKey,
      p_quantity_required: ctx.quantityRequired,
      p_notes: ctx.notes ?? null,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const reason = mapRequirementGroupRpcError(String(error.message || ""));
      return reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: reason };
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    const groupId = typeof data === "string" ? data : String(data ?? "");

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_ADDED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {
        groupId,
        roleKey: ctx.roleKey,
        quantityRequired: ctx.quantityRequired,
      },
    });

    return { success: true, data: { groupId } };
  });
}

export type UpdateRequirementGroupCtx = {
  inquiryId: string;
  groupId: string;
  patch: {
    roleKey?: string;
    quantityRequired?: number;
    notes?: string | null;
  };
  actorUserId: string;
};

export async function updateRequirementGroup(
  supabase: SupabaseClient,
  ctx: UpdateRequirementGroupCtx,
): Promise<EngineResult> {
  return runWithEngineLog("updateRequirementGroup", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { error } = await supabase.rpc("engine_update_requirement_group", {
      p_group_id: ctx.groupId,
      p_role_key: ctx.patch.roleKey ?? null,
      p_quantity_required: ctx.patch.quantityRequired ?? null,
      p_notes: ctx.patch.notes ?? null,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const reason = mapRequirementGroupRpcError(String(error.message || ""));
      return reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: reason };
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_UPDATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { groupId: ctx.groupId, patch: ctx.patch },
    });

    return { success: true };
  });
}

export type RemoveRequirementGroupCtx = {
  inquiryId: string;
  groupId: string;
  actorUserId: string;
};

export async function removeRequirementGroup(
  supabase: SupabaseClient,
  ctx: RemoveRequirementGroupCtx,
): Promise<EngineResult> {
  return runWithEngineLog("removeRequirementGroup", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { error } = await supabase.rpc("engine_remove_requirement_group", {
      p_group_id: ctx.groupId,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const reason = mapRequirementGroupRpcError(String(error.message || ""));
      return reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: reason };
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_REMOVED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { groupId: ctx.groupId },
    });

    return { success: true };
  });
}

export type AssignParticipantToGroupCtx = {
  inquiryId: string;
  participantId: string;
  groupId: string;
  actorUserId: string;
};

/**
 * Move a talent participant from their current requirement group to another
 * group on the same inquiry. Logs to inquiry_action_log on BOTH success and
 * failure as `participant_moved_group` (spec §10.2 closed set).
 */
export async function assignParticipantToGroup(
  supabase: SupabaseClient,
  ctx: AssignParticipantToGroupCtx,
): Promise<EngineResult> {
  return runWithEngineLog("assignParticipantToGroup", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "participant_moved_group",
        result: "failure",
        reason: "forbidden",
        metadata: { participant_id: ctx.participantId, new_group_id: ctx.groupId },
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { error } = await supabase.rpc("engine_assign_participant_to_group", {
      p_participant_id: ctx.participantId,
      p_group_id: ctx.groupId,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const reason = mapRequirementGroupRpcError(String(error.message || ""));
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "participant_moved_group",
        result: "failure",
        reason,
        metadata: { participant_id: ctx.participantId, new_group_id: ctx.groupId },
      });
      return reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: reason };
    }

    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "participant_moved_group",
      result: "success",
      metadata: { participant_id: ctx.participantId, new_group_id: ctx.groupId },
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.PARTICIPANT_GROUP_CHANGED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { participantId: ctx.participantId, newGroupId: ctx.groupId },
    });

    return { success: true };
  });
}
