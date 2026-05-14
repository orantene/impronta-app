"use server";

/**
 * inquiry-message-actions.ts — client-side message send.
 *
 * Wraps engine `sendMessage` for the client surface. Clients can only
 * send on the GROUP thread (private thread is staff-internal).
 *
 * Used by the inline composer in ClientMessagesShell's Chat tab.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { sendMessage as engineSendMessage } from "@/lib/inquiry/inquiry-engine-messages";
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
    // clients on group thread (see engine-internal comment + RLS walk).
    const supabase = createSupabaseServerClient ? await createSupabaseServerClient() : null;
    const admin = createServiceRoleClient();
    const write = admin ?? supabase ?? session.supabase;

    const result = await engineSendMessage(write, {
      inquiryId,
      tenantId,
      actorUserId: session.user.id,
      threadType: "group",
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
