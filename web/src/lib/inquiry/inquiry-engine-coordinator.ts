import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { assignCoordinatorFromSettings } from "./coordinator-assignment";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { logInquiryAction } from "./inquiry-action-log";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

// SaaS P1.B STEP A: every inquiry-scoped engine helper takes `tenantId` and
// applies `.eq("tenant_id", tenantId)` on inquiry + child-table reads/writes.
// Cross-tenant inquiry ids surface as a `not_found` / `forbidden` outcome at
// the engine boundary, so the action layer no longer has to rely solely on a
// `assertRowBelongsToTenant` pre-flight.

export async function assignCoordinator(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; coordinatorUserId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("assignCoordinator", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "assign_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, source_type, tenant_id")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const v = inq.version as number;

    const { data: updated, error } = await supabase
      .from("inquiries")
      .update({
        coordinator_id: ctx.coordinatorUserId,
        coordinator_assigned_at: new Date().toISOString(),
        version: v + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
        next_action_by: resolveNextActionBy(inq.status as string),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await supabase
      .from("inquiry_participants")
      .delete()
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "coordinator");

    await supabase.from("inquiry_participants").insert({
      inquiry_id: ctx.inquiryId,
      tenant_id: ctx.tenantId,
      user_id: ctx.coordinatorUserId,
      role: "coordinator",
      status: "invited",
    });

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "coordinator_assigned",
      payload: { coordinator_user_id: ctx.coordinatorUserId },
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { coordinatorUserId: ctx.coordinatorUserId },
      notifications: [
        { userId: ctx.coordinatorUserId, title: "New coordinator assignment", body: "You were assigned to an inquiry." },
      ],
    });

    return { success: true };
  });
}

export async function acceptCoordinatorAssignment(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("acceptCoordinatorAssignment", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "accept_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, coordinator_id")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };
    if (inq.coordinator_id !== ctx.actorUserId) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: part } = await supabase
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.actorUserId)
      .eq("role", "coordinator")
      .maybeSingle();

    if (part?.status === "active") {
      return { success: true, already: true };
    }

    const t = canTransition(inq.status as string, "coordination", { isFrozen: !!inq.is_frozen });
    if (!t.ok) return { success: false, reason: t.reason };

    const next = resolveNextActionBy("coordination");

    const { data: updated, error } = await supabase
      .from("inquiries")
      .update({
        status: "coordination" as never,
        coordinator_accepted_at: new Date().toISOString(),
        owner_user_id: ctx.actorUserId,
        next_action_by: next,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await supabase
      .from("inquiry_participants")
      .update({
        status: "active",
        accepted_at: new Date().toISOString(),
    })
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.actorUserId)
      .eq("role", "coordinator");

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "coordinator_accepted",
      payload: {},
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.COORDINATOR_ACCEPTED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { coordinatorUserId: ctx.actorUserId },
      systemMessage: {
        threadType: "private",
        body: "Coordinator accepted assignment.",
        eventType: "coordinator_accepted",
      },
    });

    return { success: true };
  });
}

export async function declineCoordinatorAssignment(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("declineCoordinatorAssignment", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "decline_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, source_type, tenant_id")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const { data: updated, error } = await supabase
      .from("inquiries")
      .update({
        coordinator_id: null,
        coordinator_assigned_at: null,
        next_action_by: "coordinator",
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await supabase
      .from("inquiry_participants")
      .update({ status: "declined", decline_reason: "other" })
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.actorUserId)
      .eq("role", "coordinator");

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "coordinator_declined",
      payload: {},
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.COORDINATOR_DECLINED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
      systemMessage: {
        threadType: "private",
        body: "Coordinator declined assignment.",
        eventType: "coordinator_declined",
      },
    });

    return { success: true };
  });
}

export async function autoAssignCoordinatorFromSettings(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
  actorUserId: string,
  expectedVersion: number,
): Promise<EngineResult<{ coordinatorId: string | null }>> {
  const { data: inq } = await supabase
    .from("inquiries")
    .select("source_type, tenant_id, version")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!inq) return { success: false, error: "not_found" };

  const res = await assignCoordinatorFromSettings(supabase, {
    source_type: (inq.source_type as "agency" | "hub") ?? "agency",
    tenant_id: (inq.tenant_id as string | null) ?? null,
  });

  if (!res.coordinator_id) {
    return { success: true, data: { coordinatorId: null } };
  }

  return assignCoordinator(supabase, {
    inquiryId,
    tenantId,
    coordinatorUserId: res.coordinator_id,
    actorUserId,
    expectedVersion,
  }).then((r) =>
    r.success ? { success: true as const, data: { coordinatorId: res.coordinator_id } } : r,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M2.1 — Multi-coordinator engine actions (Admin Workspace V3).
// Ref: docs/admin-workspace-spec.md §2.3, §2.3a, §4.3; docs/admin-workspace-roadmap.md §M2.1.
//
// Each wrapper:
//   1. Gates on validateActorPermission("reassign_coordinator") to fail fast
//      (the RPC re-checks is_agency_staff() server-side as defence in depth).
//   2. Calls the SECURITY DEFINER RPC which does the compound write
//      (inquiry_coordinators + inquiry_participants thread membership +
//      engine_emit_event). No additional DB writes happen on this side.
//   3. Maps the RPC's RAISE EXCEPTION sentinels to an EngineResult.
//   4. Calls logInquiryAction on BOTH success and failure branches (spec §10.2).
//   5. Dispatches the in-process emitStandardEngineEvent for side-effects the
//      RPC doesn't own (system messages, notifications, improntaLog).
//   6. Pre-flights the tenant filter on the inquiries row so cross-tenant ids
//      are denied at the engine boundary before the RPC runs.
// ─────────────────────────────────────────────────────────────────────────────

type CoordinatorActionCtx = {
  inquiryId: string;
  tenantId: string;
  userId: string;
  actorUserId: string;
};

function mapCoordinatorRpcError(msg: string): { reason: string; field: "reason" | "error" } {
  // "reason" column on inquiry_action_log is short free text; we use the same
  // short codes the RPC raises so downstream filtering is trivial.
  if (msg.includes("cannot_remove_primary")) return { reason: "cannot_remove_primary", field: "reason" };
  if (msg.includes("already_primary"))        return { reason: "already_primary", field: "reason" };
  if (msg.includes("not_coordinator"))        return { reason: "not_coordinator", field: "reason" };
  if (msg.includes("target_not_active"))      return { reason: "target_not_active", field: "reason" };
  if (msg.includes("inquiry_frozen"))         return { reason: "inquiry_frozen", field: "reason" };
  if (msg.includes("not_found"))              return { reason: "not_found", field: "reason" };
  if (msg.includes("forbidden"))              return { reason: "forbidden", field: "reason" };
  return { reason: msg || "unknown", field: "error" };
}

async function preflightInquiryInTenant(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

export async function addSecondaryCoordinator(
  supabase: SupabaseClient,
  ctx: CoordinatorActionCtx,
): Promise<EngineResult> {
  return runWithEngineLog("addSecondaryCoordinator", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await preflightInquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_assigned",
        result: "failure",
        reason: "forbidden",
        metadata: { target_user_id: ctx.userId },
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { error } = await supabase.rpc("engine_add_secondary_coordinator", {
      p_inquiry_id: ctx.inquiryId,
      p_user_id: ctx.userId,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const mapped = mapCoordinatorRpcError(String(error.message || ""));
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_assigned",
        result: "failure",
        reason: mapped.reason,
        metadata: { target_user_id: ctx.userId },
      });
      return mapped.reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: mapped.reason };
    }

    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "coordinator_assigned",
      result: "success",
      metadata: { target_user_id: ctx.userId, role: "secondary" },
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_ASSIGNED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { targetUserId: ctx.userId },
      notifications: [
        { userId: ctx.userId, title: "Added as coordinator", body: "You were assigned as a secondary coordinator on an inquiry." },
      ],
    });

    return { success: true };
  });
}

export async function removeSecondaryCoordinator(
  supabase: SupabaseClient,
  ctx: CoordinatorActionCtx,
): Promise<EngineResult> {
  return runWithEngineLog("removeSecondaryCoordinator", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await preflightInquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_removed",
        result: "failure",
        reason: "forbidden",
        metadata: { target_user_id: ctx.userId },
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { error } = await supabase.rpc("engine_remove_secondary_coordinator", {
      p_inquiry_id: ctx.inquiryId,
      p_user_id: ctx.userId,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const mapped = mapCoordinatorRpcError(String(error.message || ""));
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_removed",
        result: "failure",
        reason: mapped.reason,
        metadata: { target_user_id: ctx.userId },
      });
      return mapped.reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: mapped.reason };
    }

    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "coordinator_removed",
      result: "success",
      metadata: { target_user_id: ctx.userId },
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_UNASSIGNED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { targetUserId: ctx.userId },
    });

    return { success: true };
  });
}

export async function promoteToPrimary(
  supabase: SupabaseClient,
  ctx: CoordinatorActionCtx,
): Promise<EngineResult> {
  return runWithEngineLog("promoteToPrimary", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await preflightInquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reassign_coordinator");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_promoted",
        result: "failure",
        reason: "forbidden",
        metadata: { target_user_id: ctx.userId },
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { error } = await supabase.rpc("engine_promote_to_primary", {
      p_inquiry_id: ctx.inquiryId,
      p_user_id: ctx.userId,
      p_actor_user_id: ctx.actorUserId,
    });

    if (error) {
      const mapped = mapCoordinatorRpcError(String(error.message || ""));
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "coordinator_promoted",
        result: "failure",
        reason: mapped.reason,
        metadata: { target_user_id: ctx.userId },
      });
      return mapped.reason === "forbidden"
        ? { success: false, forbidden: true, reason: "forbidden" }
        : { success: false, error: mapped.reason };
    }

    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "coordinator_promoted",
      result: "success",
      metadata: { target_user_id: ctx.userId },
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.PRIMARY_COORDINATOR_CHANGED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { newPrimaryUserId: ctx.userId },
      notifications: [
        { userId: ctx.userId, title: "Promoted to lead coordinator", body: "You were promoted to lead coordinator on an inquiry." },
      ],
    });

    return { success: true };
  });
}
