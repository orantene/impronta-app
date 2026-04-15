import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { assignCoordinatorFromSettings } from "./coordinator-assignment";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

export type SubmitInquiryInput = {
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  company?: string | null;
  event_date?: string | null;
  event_location?: string | null;
  quantity?: number | null;
  message?: string | null;
  event_type_id?: string | null;
  raw_ai_query?: string | null;
  interpreted_query?: Record<string, unknown> | null;
  source_page?: string | null;
  source_channel: string;
  client_user_id: string | null;
  talent_profile_ids: string[];
  actorUserId: string;
};

export async function submitInquiry(
  supabase: SupabaseClient,
  input: SubmitInquiryInput,
): Promise<EngineResult<{ inquiryId: string }>> {
  return runWithEngineLog("submitInquiry", undefined, input.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("submitInquiry", input.actorUserId), 5, 60 * 60_000);
    if (!rl.ok) {
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }

    const perm = await validateActorPermission(supabase, "", input.actorUserId, "submit_inquiry");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const assignment = await assignCoordinatorFromSettings(supabase, {
      source_type: "agency",
      tenant_id: null,
    });

    const status = "submitted" as const;
    const next = resolveNextActionBy(status);

    const { data: row, error } = await supabase
      .from("inquiries")
      .insert({
        client_user_id: input.client_user_id,
        contact_name: input.contact_name,
        contact_email: input.contact_email,
        contact_phone: input.contact_phone ?? null,
        company: input.company ?? null,
        event_date: input.event_date ?? null,
        event_location: input.event_location ?? null,
        quantity: input.quantity ?? null,
        message: input.message ?? null,
        event_type_id: input.event_type_id ?? null,
        raw_ai_query: input.raw_ai_query ?? null,
        interpreted_query: input.interpreted_query ?? null,
        source_page: input.source_page ?? null,
        source_channel: input.source_channel as never,
        status: status as never,
        uses_new_engine: true,
        source_type: "agency",
        coordinator_id: assignment.coordinator_id,
        coordinator_assigned_at: assignment.coordinator_id ? new Date().toISOString() : null,
        next_action_by: next,
        version: 1,
      })
      .select("id")
      .single();

    if (error || !row) {
      return { success: false, error: error?.message ?? "insert_failed" };
    }

    const inquiryId = row.id as string;

    if (input.client_user_id) {
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        user_id: input.client_user_id,
        role: "client",
        status: "active",
      });
    }

    if (assignment.coordinator_id) {
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        user_id: assignment.coordinator_id,
        role: "coordinator",
        status: "invited",
      });
    }

    let sort = 0;
    for (const tid of input.talent_profile_ids) {
      const { data: tp } = await supabase
        .from("talent_profiles")
        .select("user_id")
        .eq("id", tid)
        .maybeSingle();
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        user_id: tp?.user_id ?? null,
        talent_profile_id: tid,
        role: "talent",
        status: "invited",
        sort_order: sort++,
        added_by_user_id: input.actorUserId,
      });
    }

    await logInquiryActivity(supabase, {
      inquiryId,
      actorUserId: input.actorUserId,
      eventType: "inquiry.submitted_v2",
      payload: { coordinator_assigned: Boolean(assignment.coordinator_id) },
    });

    await assertConsistencyAfterWrite(supabase, inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId,
      actorUserId: input.actorUserId,
      data: {
        coordinatorAssigned: Boolean(assignment.coordinator_id),
        talentCount: input.talent_profile_ids.length,
        sourceChannel: input.source_channel,
      },
    });

    return { success: true, data: { inquiryId } };
  });
}

export async function moveToCoordination(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("moveToCoordination", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "move_to_coordination");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("status, version, is_frozen, uses_new_engine")
      .eq("id", ctx.inquiryId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const t = canTransition(inq.status as string, "coordination", { isFrozen: !!inq.is_frozen });
    if (!t.ok) return { success: false, reason: t.reason };

    const next = resolveNextActionBy("coordination");

    const { data: updated, error } = await supabase
      .from("inquiries")
      .update({
        status: "coordination" as never,
        next_action_by: next,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "inquiry.moved_to_coordination",
      payload: {},
    });
    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_MOVED_TO_COORDINATION,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
    });

    return { success: true };
  });
}

export async function setPriority(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    actorUserId: string;
    expectedVersion: number;
    priority: "low" | "normal" | "high" | "urgent";
  },
): Promise<EngineResult> {
  return runWithEngineLog("setPriority", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "set_priority");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen")
      .eq("id", ctx.inquiryId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const { data: updated, error } = await supabase
      .from("inquiries")
      .update({
        priority: ctx.priority,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "inquiry.priority_set",
      payload: { priority: ctx.priority },
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_PRIORITY_SET,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { priority: ctx.priority },
    });

    return { success: true };
  });
}
