import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { getCoordinatorTimeoutHours, getInquiryExpiryHours } from "./inquiry-settings";
import {
  ENGINE_EVENT_TYPES,
  emitStandardEngineEvent,
  engineListenerCount,
  runEngineListener,
  type EngineEvent,
  type EngineEventType,
  type EngineEventPriority,
} from "./inquiry-events";
import { inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import { buildInquiryBells } from "./inquiry-notifications";
import { logServerError } from "@/lib/server/safe-error";
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

/** Attempt cap — mirrors the original `.lt("attempt_count", 5)` selection. */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Exponential backoff between retries: ~5min, 25min, ~2h, ~10h, then capped.
 * Keyed on the NEXT attempt number so a fresh failure (attempt_count 0→1)
 * waits ~5min, not zero. A poison row can't hot-loop the sweep.
 */
function nextRetryBackoffMs(nextAttempt: number): number {
  const base = 5 * 60 * 1000; // 5 minutes
  const capped = Math.min(nextAttempt, 4); // cap the exponent
  return base * Math.pow(5, capped - 1);
}

type FailedEffectRow = {
  id: string;
  inquiry_id: string;
  event_id: string;
  listener_name: string;
  engine_action: string;
  priority: EngineEventPriority | null;
  attempt_count: number | null;
  event_type: string | null;
  event_payload: EngineEvent["payload"] | null;
  event_actor_user_id: string | null;
  created_at: string | null;
};

/**
 * Cron: re-run post-commit engine effects that failed the first time. Tenant-less
 * by design (system sweep across all tenants).
 *
 * Each unresolved row records exactly ONE listener (`listener_${i}`) that threw
 * inside `emitEngineEvents`. The fix: reconstruct the original `EngineEvent`
 * from the persisted `event_*` columns and RE-INVOKE ONLY that one listener via
 * `runEngineListener` — never the whole chain, so listeners that already
 * succeeded are not double-applied. `event_id` is preserved, so the dispatcher's
 * `dedupe_key` no-ops anything that partially landed.
 *
 * A row is marked `resolved = true` ONLY after the listener re-runs cleanly.
 * On failure (or when the row predates the replay-context migration and so
 * can't be faithfully replayed) we increment `attempt_count` and push
 * `next_retry_at` out on an exponential backoff — we never falsely resolve.
 * Rows that exhaust the attempt cap stay unresolved for the ops alert.
 */
export async function retryFailedEngineEffects(supabase: SupabaseClient): Promise<{ retried: number }> {
  const nowIso = new Date().toISOString();

  const { data: rows } = await supabase
    .from("failed_engine_effects")
    .select(
      "id, inquiry_id, event_id, listener_name, engine_action, priority, attempt_count, event_type, event_payload, event_actor_user_id, created_at",
    )
    .eq("resolved", false)
    .lt("attempt_count", MAX_RETRY_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(50);

  let retried = 0;
  for (const row of (rows ?? []) as FailedEffectRow[]) {
    const attemptsSoFar = row.attempt_count ?? 0;
    const nextAttempt = attemptsSoFar + 1;

    const listenerIndex = parseListenerIndex(row.listener_name);
    const eventType = (row.event_type ?? row.engine_action) as EngineEventType;

    // A row is faithfully replayable only if we captured the original event
    // payload (added in migration 20261032000002). Legacy rows logged before
    // that lack `event_payload` — we can't reconstruct the input, so we MUST
    // NOT mark them resolved. Back them off and leave them for the ops alert.
    const replayable =
      listenerIndex !== null &&
      listenerIndex < engineListenerCount() &&
      row.event_payload != null;

    let succeeded = false;
    if (replayable) {
      const event: EngineEvent = {
        type: eventType,
        inquiryId: row.inquiry_id,
        actorUserId: row.event_actor_user_id,
        eventId: row.event_id,
        timestamp: row.created_at ?? nowIso,
        priority: (row.priority ?? "medium") as EngineEventPriority,
        payload: row.event_payload as EngineEvent["payload"],
      };
      try {
        await runEngineListener(supabase, listenerIndex as number, event);
        succeeded = true;
      } catch (err) {
        logServerError(
          "inquiry-engine-lifecycle/retryFailedEngineEffects",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    if (succeeded) {
      await supabase
        .from("failed_engine_effects")
        .update({
          attempt_count: nextAttempt,
          retried_at: nowIso,
          resolved: true,
        })
        .eq("id", row.id);
      retried += 1;
    } else {
      // Re-run failed (or row not replayable). Increment the counter and back
      // off — NEVER resolve without a successful re-run.
      await supabase
        .from("failed_engine_effects")
        .update({
          attempt_count: nextAttempt,
          retried_at: nowIso,
          next_retry_at: new Date(Date.now() + nextRetryBackoffMs(nextAttempt)).toISOString(),
        })
        .eq("id", row.id);
    }
  }

  // `retried` counts only successful re-runs (rows actually resolved), so the
  // cron's success metric reflects effects recovered, not rows merely touched.
  return { retried };
}

/** Parse the listener index out of a `listener_${i}` name. Returns null if the
 *  name doesn't match (e.g. an older free-form failed_step label). */
function parseListenerIndex(listenerName: string): number | null {
  const m = /^listener_(\d+)$/.exec(listenerName);
  if (!m) return null;
  const idx = Number.parseInt(m[1], 10);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}
