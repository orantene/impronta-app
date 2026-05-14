import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import { resolveInquiryRecipients } from "@/lib/notifications/recipients";
import { emitNotificationToUsers } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";

// SaaS P1.B STEP A: tenant-scoped by construction. Every read/write against
// inquiries / inquiry_messages / inquiry_message_reads filters on tenant_id,
// and inserts include tenant_id so the Phase-1B trigger has no slack.

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

export async function sendMessage(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    threadType: "private" | "group";
    body: string;
  },
): Promise<EngineResult<{ messageId: string }>> {
  return runWithEngineLog("sendMessage", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(
      engineRateKey("sendMessage", ctx.actorUserId, ctx.inquiryId),
      30,
      60_000,
    );
    if (!rl.ok) {
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }

    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "send_message");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    // 2026-05-14 — self-elevate INSERT to service-role after permission
    // gate. RLS walk confirmed pure clients (the inquiry's own submitter)
    // get "new row violates row-level security policy" on inquiry_messages
    // even when they're a participant. validateActorPermission above is
    // the security gate. See qa-evidence/2026-05-14/step-06.
    const writeMsg = await inquiryWriteClient(supabase);
    const { data: row, error } = await writeMsg
      .from("inquiry_messages")
      .insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: ctx.threadType,
        sender_user_id: ctx.actorUserId,
        body: ctx.body,
        metadata: {},
      })
      .select("id")
      .single();

    if (error || !row) return { success: false, error: error?.message ?? "insert_failed" };

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.MESSAGE_SENT,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { threadType: ctx.threadType, messageId: row.id as string },
    });

    // Fire-and-forget notification fanout — best-effort, never blocks the
    // send. Workspace recipients (staff) always get notified; talent/client
    // only on the group thread (private thread is staff-internal).
    resolveInquiryRecipients(supabase, ctx.inquiryId, ctx.tenantId)
      .then(async (recipients) => {
        const title = "New message";
        const body = ctx.body.length > 120 ? `${ctx.body.slice(0, 117)}…` : ctx.body;

        const workspaceTargets = recipients.workspaceUserIds.filter((id) => id !== ctx.actorUserId);
        const promises: Array<Promise<void>> = [];
        if (workspaceTargets.length > 0) {
          promises.push(
            emitNotificationToUsers(workspaceTargets, {
              tenantId: ctx.tenantId,
              kind: "message",
              surface: "workspace",
              title,
              body,
              actorUserId: ctx.actorUserId,
              targetDrawer: "inquiry-workspace",
              targetPayload: { inquiryId: ctx.inquiryId, threadType: ctx.threadType },
              originKind: "message_sent",
              originInquiryId: ctx.inquiryId,
            }),
          );
        }

        if (ctx.threadType === "group") {
          const talentTargets = recipients.talentUserIds.filter((id) => id !== ctx.actorUserId);
          if (talentTargets.length > 0) {
            promises.push(
              emitNotificationToUsers(talentTargets, {
                tenantId: ctx.tenantId,
                kind: "message",
                surface: "talent",
                title,
                body,
                actorUserId: ctx.actorUserId,
                targetDrawer: "talent-inquiry",
                targetPayload: { inquiryId: ctx.inquiryId },
                originKind: "message_sent",
                originInquiryId: ctx.inquiryId,
              }),
            );
          }
          if (recipients.clientUserId && recipients.clientUserId !== ctx.actorUserId) {
            promises.push(
              emitNotificationToUsers([recipients.clientUserId], {
                tenantId: ctx.tenantId,
                kind: "message",
                surface: "client",
                title,
                body,
                actorUserId: ctx.actorUserId,
                targetDrawer: "client-inquiry",
                targetPayload: { inquiryId: ctx.inquiryId },
                originKind: "message_sent",
                originInquiryId: ctx.inquiryId,
              }),
            );
          }
        }

        await Promise.all(promises);
      })
      .catch((err) => logServerError("inquiry-engine-messages.notifyFanout", err));

    return { success: true, data: { messageId: row.id as string } };
  });
}

export async function markThreadRead(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    threadType: "private" | "group";
    lastMessageId?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("markThreadRead", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "mark_thread_read");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { error } = await supabase.from("inquiry_message_reads").upsert(
      {
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: ctx.threadType,
        user_id: ctx.actorUserId,
        last_read_at: new Date().toISOString(),
        last_read_message_id: ctx.lastMessageId ?? null,
      },
      { onConflict: "inquiry_id,thread_type,user_id" },
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  });
}

export async function editMessage(
  supabase: SupabaseClient,
  ctx: { messageId: string; tenantId: string; actorUserId: string; body: string },
): Promise<EngineResult> {
  return runWithEngineLog("editMessage", undefined, ctx.actorUserId, async () => {
    const { data: msg } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, inquiry_id, created_at")
      .eq("id", ctx.messageId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!msg || msg.sender_user_id !== ctx.actorUserId) return { success: false, forbidden: true, reason: "forbidden" };

    const created = new Date(msg.created_at as string).getTime();
    if (Date.now() - created > 15 * 60_000) return { success: false, error: "edit_window_expired" };

    const p = await validateActorPermission(supabase, msg.inquiry_id as string, ctx.actorUserId, "edit_message");
    if (!p.ok) return { success: false, forbidden: true, reason: "forbidden" };

    await supabase
      .from("inquiry_messages")
      .update({ body: ctx.body, edited_at: new Date().toISOString() })
      .eq("id", ctx.messageId)
      .eq("tenant_id", ctx.tenantId);

    return { success: true };
  });
}

export async function deleteMessage(
  supabase: SupabaseClient,
  ctx: { messageId: string; tenantId: string; actorUserId: string },
): Promise<EngineResult> {
  return runWithEngineLog("deleteMessage", undefined, ctx.actorUserId, async () => {
    const { data: msg } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, inquiry_id")
      .eq("id", ctx.messageId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!msg) return { success: false, error: "not_found" };

    const can = await validateActorPermission(supabase, msg.inquiry_id as string, ctx.actorUserId, "delete_message");
    if (!can.ok && msg.sender_user_id !== ctx.actorUserId) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    await supabase
      .from("inquiry_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ctx.messageId)
      .eq("tenant_id", ctx.tenantId);

    return { success: true };
  });
}
