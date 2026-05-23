"use server";

/**
 * inquiry-message-actions.ts — client-side message send.
 *
 * Wraps engine `sendMessage` for the client surface. Clients send on the
 * agency-client private thread; talent fan-out lives on the group thread.
 *
 * Used by the inline composer in ClientMessagesShell's Chat tab.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  sendMessage as engineSendMessage,
  markThreadRead as engineMarkThreadRead,
  editMessage as engineEditMessage,
  deleteMessage as engineDeleteMessage,
} from "@/lib/inquiry/inquiry-engine-messages";
import { logServerError } from "@/lib/server/safe-error";

export type ClientSendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendClientMessageAction(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<ClientSendMessageResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message is empty." };
    if (trimmed.length > 10_000) return { ok: false, error: "Message is too long." };

    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return { ok: false, error: "Not authenticated." };

    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };
    const tenantId = scope.tenantId;

    // Confirm the inquiry is owned by this client (single-tenant scope).
    const { data: inq, error: lookupErr } = await session.supabase
      .from("inquiries")
      .select("id, client_user_id, tenant_id")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (lookupErr || !inq) return { ok: false, error: "Inquiry not found." };
    if (inq.client_user_id !== session.user.id) {
      return { ok: false, error: "Not authorised to message this inquiry." };
    }

    // Self-elevate INSERT — RLS on inquiry_messages blocks even legitimate
    // clients on the agency-client thread (see engine-internal comment + RLS walk).
    const supabase = createSupabaseServerClient ? await createSupabaseServerClient() : null;
    const admin = createServiceRoleClient();
    const write = admin ?? supabase ?? session.supabase;

    const result = await engineSendMessage(write, {
      inquiryId,
      tenantId,
      actorUserId: session.user.id,
      threadType: "private",
      body: trimmed,
    });

    if (!result.success) {
      if (result.rateLimited) return { ok: false, error: "Sending too fast — wait a moment." };
      if (result.forbidden)   return { ok: false, error: "Not authorised to message this inquiry." };
      return { ok: false, error: result.error ?? "Failed to send." };
    }

    return { ok: true, messageId: result.data?.messageId ?? "" };
  } catch (err) {
    logServerError("client.sendInquiryMessage", err);
    return { ok: false, error: "Unexpected error. Try again." };
  }
}

/**
 * Mark the agency-client private thread on this inquiry read up to lastMessageId.
 * Called when the client opens the Chat tab (or selects a thread row).
 * Fire-and-forget — UI never blocks on this; errors are silent.
 */
export async function markClientThreadReadAction(
  tenantSlug: string,
  inquiryId: string,
  lastMessageId: string | null,
): Promise<{ ok: boolean }> {
  try {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return { ok: false };
    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false };

    // Confirm ownership before touching the read-marker table.
    const { data: inq } = await session.supabase
      .from("inquiries")
      .select("id, client_user_id")
      .eq("id", inquiryId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!inq || inq.client_user_id !== session.user.id) return { ok: false };

    const admin = createServiceRoleClient();
    const write = admin ?? session.supabase;
    const res = await engineMarkThreadRead(write, {
      inquiryId,
      tenantId: scope.tenantId,
      actorUserId: session.user.id,
      threadType: "private",
      lastMessageId,
    });
    return { ok: res.success };
  } catch (err) {
    logServerError("client.markThreadRead", err);
    return { ok: false };
  }
}

/**
 * Edit a message the client previously sent. Engine enforces:
 *   - actor must be the message's sender_user_id
 *   - within 15-minute edit window
 *   - send_message capability on this inquiry
 *
 * We additionally pre-check that the message lives on this tenant + that
 * the actor is the inquiry's client_user_id, then self-elevate the
 * UPDATE under that gate.
 */
export type ClientEditMessageResult =
  | { ok: true }
  | { ok: false; error: string };

export async function editClientMessageAction(
  tenantSlug: string,
  messageId: string,
  body: string,
): Promise<ClientEditMessageResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message is empty." };
    if (trimmed.length > 10_000) return { ok: false, error: "Message is too long." };

    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return { ok: false, error: "Not authenticated." };
    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };

    // Verify the message belongs to this client's inquiry on this tenant.
    const admin = createServiceRoleClient();
    const read = admin ?? session.supabase;
    const { data: msg } = await read
      .from("inquiry_messages")
      .select("id, inquiry_id, sender_user_id, tenant_id")
      .eq("id", messageId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!msg) return { ok: false, error: "Message not found." };
    if (msg.sender_user_id !== session.user.id) return { ok: false, error: "You can only edit your own messages." };

    const result = await engineEditMessage(read, {
      messageId,
      tenantId: scope.tenantId,
      actorUserId: session.user.id,
      body: trimmed,
    });
    if (!result.success) {
      if (result.error === "edit_window_expired") return { ok: false, error: "Edit window expired (15 min)." };
      if (result.forbidden) return { ok: false, error: "Not authorised to edit." };
      return { ok: false, error: result.error ?? "Failed to edit." };
    }
    return { ok: true };
  } catch (err) {
    logServerError("client.editInquiryMessage", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Delete (soft) a message the client previously sent. Engine sets
 * deleted_at = now() and re-checks ownership + capability.
 */
export type ClientDeleteMessageResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteClientMessageAction(
  tenantSlug: string,
  messageId: string,
): Promise<ClientDeleteMessageResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return { ok: false, error: "Not authenticated." };
    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };

    const admin = createServiceRoleClient();
    const read = admin ?? session.supabase;
    const { data: msg } = await read
      .from("inquiry_messages")
      .select("id, inquiry_id, sender_user_id, tenant_id")
      .eq("id", messageId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!msg) return { ok: false, error: "Message not found." };
    if (msg.sender_user_id !== session.user.id) return { ok: false, error: "You can only delete your own messages." };

    const result = await engineDeleteMessage(read, {
      messageId,
      tenantId: scope.tenantId,
      actorUserId: session.user.id,
    });
    if (!result.success) {
      if (result.forbidden) return { ok: false, error: "Not authorised to delete." };
      return { ok: false, error: result.error ?? "Failed to delete." };
    }
    return { ok: true };
  } catch (err) {
    logServerError("client.deleteInquiryMessage", err);
    return { ok: false, error: "Unexpected error." };
  }
}
