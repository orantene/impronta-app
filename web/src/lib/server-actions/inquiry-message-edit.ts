"use server";

import {
  editMessage as engineEditMessage,
  deleteMessage as engineDeleteMessage,
} from "@/lib/inquiry/inquiry-engine-messages";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "./result";

/**
 * G.3 — Server actions for inquiry message edit + delete.
 *
 * Wraps the existing engine primitives (inquiry-engine-messages.ts) with
 * tenant-scoped auth so the UI can wire an edit / undo-send button.
 *
 * Window semantics:
 *   - 30s "undo send" — delete-only, no audit trail, sender-initiated.
 *   - 15min "edit"    — modify body, sets edited_at marker (engine-enforced).
 *
 * Both staff and non-staff (talent / client) can act on their OWN messages
 * within the window. Staff can also delete OTHER participants' messages
 * per engine permissions (moderation), with the engine's audit trail.
 */

// Window constants — UNDO_SEND_WINDOW_MS retained as documentation of
// the engine contract (used in commit history + UI gating); referenced
// in the error-copy below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _UNDO_SEND_WINDOW_MS = 30_000;
const EDIT_WINDOW_MS = 15 * 60_000;

async function resolveTenantContext(): Promise<
  | { ok: true; tenantId: string; userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; error: string }
> {
  // Try staff path first — common case (admin moderating a thread).
  const staffAuth = await requireStaffTenantAction();
  if (staffAuth.ok) {
    return { ok: true, tenantId: staffAuth.tenantId, userId: staffAuth.user.id, supabase: staffAuth.supabase };
  }
  // Fall back to participant path — talent / client editing their own.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Service unavailable." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  // No tenant binding via staff role — read it from the message itself.
  // Caller passes the message id; we look up its tenant_id.
  return { ok: true, tenantId: "", userId: user.id, supabase };
}

export async function editInquiryMessage(
  messageId: string,
  newBody: string,
): Promise<ServerActionResult> {
  try {
    const trimmed = newBody.trim();
    if (!trimmed) return { ok: false, error: "Message is empty.", reason: "validation_failed" };
    if (trimmed.length > 10_000) return { ok: false, error: "Message too long.", reason: "validation_failed" };

    const ctx = await resolveTenantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, reason: "unauthenticated" };
    let tenantId = ctx.tenantId;

    if (!tenantId) {
      const { data: msg } = await ctx.supabase!
        .from("inquiry_messages")
        .select("tenant_id")
        .eq("id", messageId)
        .maybeSingle();
      const resolved = (msg as { tenant_id?: string } | null)?.tenant_id;
      if (!resolved) return { ok: false, error: "Message not found.", reason: "not_found" };
      tenantId = resolved;
    }

    const result = await engineEditMessage(ctx.supabase!, {
      messageId,
      tenantId,
      actorUserId: ctx.userId,
      body: trimmed,
    });

    if (!result.success) {
      if (result.forbidden) return { ok: false, error: "Not your message.", reason: "forbidden" };
      if (result.error === "edit_window_expired") {
        return {
          ok: false,
          error: `Edit window closed (${Math.round(EDIT_WINDOW_MS / 60_000)} min after send).`,
          reason: "edit_window_expired",
        };
      }
      return { ok: false, error: result.error ?? "Edit failed.", reason: "unexpected" };
    }
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("inquiry-message-edit.editInquiryMessage", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

export async function deleteInquiryMessage(
  messageId: string,
): Promise<ServerActionResult> {
  try {
    const ctx = await resolveTenantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, reason: "unauthenticated" };
    let tenantId = ctx.tenantId;

    if (!tenantId) {
      const { data: msg } = await ctx.supabase!
        .from("inquiry_messages")
        .select("tenant_id")
        .eq("id", messageId)
        .maybeSingle();
      const resolved = (msg as { tenant_id?: string } | null)?.tenant_id;
      if (!resolved) return { ok: false, error: "Message not found.", reason: "not_found" };
      tenantId = resolved;
    }

    const result = await engineDeleteMessage(ctx.supabase!, {
      messageId,
      tenantId,
      actorUserId: ctx.userId,
    });

    if (!result.success) {
      if (result.forbidden) return { ok: false, error: "Not your message.", reason: "forbidden" };
      if (result.error === "not_found") return { ok: false, error: "Message not found.", reason: "not_found" };
      return { ok: false, error: result.error ?? "Delete failed.", reason: "unexpected" };
    }
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("inquiry-message-edit.deleteInquiryMessage", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

// Note: window constants are NOT re-exported — Next.js forbids non-async
// exports in "use server" files. UI consumers should reference the
// engine's source of truth in `@/lib/inquiry/inquiry-engine-messages`
// or define their own UI-side constants. (The 30s/15min windows are
// engine-enforced, so a duplicate UI const would only drive the
// "show Undo send / Edit affordance" gate.)
