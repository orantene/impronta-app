import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

export async function sendMessage(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
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

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "send_message");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: row, error } = await supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: ctx.inquiryId,
        thread_type: ctx.threadType,
        sender_user_id: ctx.actorUserId,
        body: ctx.body,
        metadata: {},
      })
      .select("id")
      .single();

    if (error || !row) return { success: false, error: error?.message ?? "insert_failed" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "inquiry.message_sent",
      payload: { thread_type: ctx.threadType },
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.MESSAGE_SENT,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { threadType: ctx.threadType, messageId: row.id as string },
    });

    return { success: true, data: { messageId: row.id as string } };
  });
}

export async function markThreadRead(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    actorUserId: string;
    threadType: "private" | "group";
    lastMessageId?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("markThreadRead", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "mark_thread_read");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { error } = await supabase.from("inquiry_message_reads").upsert(
      {
        inquiry_id: ctx.inquiryId,
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
  ctx: { messageId: string; actorUserId: string; body: string },
): Promise<EngineResult> {
  return runWithEngineLog("editMessage", undefined, ctx.actorUserId, async () => {
    const { data: msg } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, inquiry_id, created_at")
      .eq("id", ctx.messageId)
      .maybeSingle();
    if (!msg || msg.sender_user_id !== ctx.actorUserId) return { success: false, forbidden: true, reason: "forbidden" };

    const created = new Date(msg.created_at as string).getTime();
    if (Date.now() - created > 15 * 60_000) return { success: false, error: "edit_window_expired" };

    const p = await validateActorPermission(supabase, msg.inquiry_id as string, ctx.actorUserId, "edit_message");
    if (!p.ok) return { success: false, forbidden: true, reason: "forbidden" };

    await supabase
      .from("inquiry_messages")
      .update({ body: ctx.body, edited_at: new Date().toISOString() })
      .eq("id", ctx.messageId);

    return { success: true };
  });
}

export async function deleteMessage(
  supabase: SupabaseClient,
  ctx: { messageId: string; actorUserId: string },
): Promise<EngineResult> {
  return runWithEngineLog("deleteMessage", undefined, ctx.actorUserId, async () => {
    const { data: msg } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, inquiry_id")
      .eq("id", ctx.messageId)
      .maybeSingle();
    if (!msg) return { success: false, error: "not_found" };

    const can = await validateActorPermission(supabase, msg.inquiry_id as string, ctx.actorUserId, "delete_message");
    if (!can.ok && msg.sender_user_id !== ctx.actorUserId) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    await supabase
      .from("inquiry_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ctx.messageId);

    return { success: true };
  });
}
