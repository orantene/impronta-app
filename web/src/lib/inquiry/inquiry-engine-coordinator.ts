import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { assignCoordinatorFromSettings } from "./coordinator-assignment";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

export async function assignCoordinator(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; coordinatorUserId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("assignCoordinator", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "assign_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, source_type, tenant_id")
      .eq("id", ctx.inquiryId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
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
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await supabase.from("inquiry_participants").delete().eq("inquiry_id", ctx.inquiryId).eq("role", "coordinator");

    await supabase.from("inquiry_participants").insert({
      inquiry_id: ctx.inquiryId,
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
  ctx: { inquiryId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("acceptCoordinatorAssignment", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "accept_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, coordinator_id")
      .eq("id", ctx.inquiryId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };
    if (inq.coordinator_id !== ctx.actorUserId) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: part } = await supabase
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", ctx.inquiryId)
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
  ctx: { inquiryId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("declineCoordinatorAssignment", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "decline_coordinator");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status, source_type, tenant_id")
      .eq("id", ctx.inquiryId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
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
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await supabase
      .from("inquiry_participants")
      .update({ status: "declined", decline_reason: "other" })
      .eq("inquiry_id", ctx.inquiryId)
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
  actorUserId: string,
  expectedVersion: number,
): Promise<EngineResult<{ coordinatorId: string | null }>> {
  const { data: inq } = await supabase
    .from("inquiries")
    .select("source_type, tenant_id, version")
    .eq("id", inquiryId)
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
    coordinatorUserId: res.coordinator_id,
    actorUserId,
    expectedVersion,
  }).then((r) =>
    r.success ? { success: true as const, data: { coordinatorId: res.coordinator_id } } : r,
  );
}
