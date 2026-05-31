import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { getCoordinatorTimeoutHours, getInquiryExpiryHours } from "./inquiry-settings";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import { buildInquiryBells } from "./inquiry-notifications";
import type { EngineResult } from "./inquiry-engine.types";

// SaaS P1.B STEP A: tenant-scoped by construction. Staff lifecycle actions
// require a tenantId in ctx. Cron helpers (processCoordinatorTimeouts,
// processExpirations, retryFailedEngineEffects) intentionally stay tenant-less
// — they are system-level sweeps across all tenants.

void resolveNextActionBy;

async function inquiryInTenant(
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

export async function freezeInquiry(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    reason: string;
    expectedVersion: number;
  },
): Promise<EngineResult> {
  return runWithEngineLog("freezeInquiry", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "freeze_inquiry");
    if (!perm.ok || !perm.isStaff) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, error: "not_found" };

    const writeFreeze = await inquiryWriteClient(supabase);
    await writeFreeze
      .from("inquiries")
      .update({
        is_frozen: true,
        frozen_at: new Date().toISOString(),
        frozen_by_user_id: ctx.actorUserId,
        freeze_reason: ctx.reason,
        version: (inq.version as number) + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_FROZEN,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { reason: ctx.reason },
      notifications: await buildInquiryBells({
        inquiryId: ctx.inquiryId,
        tenantId: ctx.tenantId,
        audiences: ["client", "talent"],
        title: "Inquiry paused",
        body: "A coordinator paused this inquiry. No action is needed right now.",
        excludeUserId: ctx.actorUserId,
      }),
    });

    return { success: true };
  });
}

export async function unfreezeInquiry(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("unfreezeInquiry", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "unfreeze_inquiry");
    if (!perm.ok || !perm.isStaff) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    const writeUnfreeze = await inquiryWriteClient(supabase);
    await writeUnfreeze
      .from("inquiries")
      .update({
        is_frozen: false,
        frozen_at: null,
        frozen_by_user_id: null,
        freeze_reason: null,
        version: ((inq?.version as number) ?? 1) + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_UNFROZEN,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
    });

    return { success: true };
  });
}

export async function archiveInquiry(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("archiveInquiry", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "archive_inquiry");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("status, version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, error: "not_found" };

    const t = canTransition(inq.status as string, "archived");
    if (!t.ok) return { success: false, reason: t.reason };

    const writeArchive = await inquiryWriteClient(supabase);
    await writeArchive
      .from("inquiries")
      .update({
        status: "archived" as never,
        next_action_by: null,
        version: (inq.version as number) + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_ARCHIVED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
    });

    return { success: true };
  });
}

/**
 * Client cancels their own inquiry. Maps to the canonical `rejected`
 * status with close_reason='client_cancelled'. The engine doesn't have
 * a separate "cancelled" status — by lifecycle convention, rejected +
 * close_reason carries the cancellation semantics.
 *
 * Allowed from submitted / coordination / offer_pending / approved.
 * Disallowed from booked (use a separate booking-cancellation flow,
 * which isn't yet built and would need to refund / release talent etc).
 */
export async function clientCancelInquiry(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    reason?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("clientCancelInquiry", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "client_cancel");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("status, version, is_frozen")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, error: "not_found" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const t = canTransition(inq.status as string, "rejected");
    if (!t.ok) return { success: false, reason: t.reason };

    const writeClient = await inquiryWriteClient(supabase);
    const { error: updateErr } = await writeClient
      .from("inquiries")
      .update({
        status: "rejected" as never,
        close_reason: "client_cancelled",
        closed_at: new Date().toISOString(),
        next_action_by: null,
        version: (inq.version as number) + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);
    if (updateErr) return { success: false, error: updateErr.message };

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_CANCELLED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { reason: ctx.reason ?? null, by: "client" },
      notifications: await buildInquiryBells({
        inquiryId: ctx.inquiryId,
        tenantId: ctx.tenantId,
        audiences: ["client", "talent"],
        title: "Inquiry cancelled",
        body: "This inquiry was cancelled. No further action is needed.",
        excludeUserId: ctx.actorUserId,
      }),
    });

    return { success: true };
  });
}

/** Cron: coordinator assignment timeout (Contract 13). Tenant-less by design. */
export async function processCoordinatorTimeouts(supabase: SupabaseClient): Promise<{ processed: number }> {
  const hours = await getCoordinatorTimeoutHours(supabase);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("inquiries")
    .select("id, coordinator_id, coordinator_assigned_at, version, source_type, tenant_id")
    .eq("status", "submitted" as never)
    .not("coordinator_id", "is", null)
    .lt("coordinator_assigned_at", cutoff);

  let processed = 0;
  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("inquiries")
      .update({
        coordinator_id: null,
        version: (row.version as number) + 1,
      })
      .eq("id", row.id as string)
      .eq("status", "submitted" as never)
      .not("coordinator_id", "is", null)
      .lt("coordinator_assigned_at", cutoff);

    if (!error) {
      processed += 1;
      await emitStandardEngineEvent(supabase, {
        type: ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNMENT_TIMED_OUT,
        inquiryId: row.id as string,
        actorUserId: (row.coordinator_id as string) ?? null,
        data: { automated: true },
        notifications: await buildInquiryBells({
          inquiryId: row.id as string,
          tenantId: row.tenant_id as string,
          audiences: ["workspaceAdmins"],
          title: "Inquiry needs a coordinator",
          body: "A coordinator assignment timed out. Please reassign this inquiry.",
        }),
      });
    }
  }

  return { processed };
}

export async function processExpirations(supabase: SupabaseClient): Promise<{ processed: number }> {
  const hours = await getInquiryExpiryHours(supabase);
  const now = new Date().toISOString();
  void hours;

  const { data: rows } = await supabase
    .from("inquiries")
    .select("id, version, tenant_id")
    .in("status", ["submitted", "coordination", "offer_pending"] as never[])
    .not("expires_at", "is", null)
    .lt("expires_at", now);

  let processed = 0;
  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("inquiries")
      .update({
        status: "expired" as never,
        next_action_by: null,
        version: (row.version as number) + 1,
      })
      .eq("id", row.id as string)
      .in("status", ["submitted", "coordination", "offer_pending"] as never[])
      .lt("expires_at", now);

    if (!error) {
      processed += 1;
      await emitStandardEngineEvent(supabase, {
        type: ENGINE_EVENT_TYPES.INQUIRY_EXPIRED,
        inquiryId: row.id as string,
        actorUserId: null,
        data: { automated: true },
        notifications: await buildInquiryBells({
          inquiryId: row.id as string,
          tenantId: row.tenant_id as string,
          audiences: ["coordinator", "workspaceAdmins"],
          title: "Inquiry expired",
          body: "This inquiry expired before it was booked.",
        }),
      });
    }
  }

  return { processed };
}

export async function retryFailedEngineEffects(supabase: SupabaseClient): Promise<{ retried: number }> {
  const { data: rows } = await supabase
    .from("failed_engine_effects")
    .select("id")
    .eq("resolved", false)
    .lt("attempt_count", 5)
    .limit(50);

  let retried = 0;
  for (const row of rows ?? []) {
    await supabase
      .from("failed_engine_effects")
      .update({ attempt_count: 1, retried_at: new Date().toISOString(), resolved: true })
      .eq("id", row.id as string);
    retried += 1;
  }
  return { retried };
}
