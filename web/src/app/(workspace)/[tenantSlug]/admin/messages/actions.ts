"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThreadType, WorkspaceMessage } from "../../_data-bridge";
import { loadInquiryMessages } from "../../_data-bridge";

async function inquiryBelongsToTenant(
  supabase: SupabaseClient,
  tenantId: string,
  inquiryId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("inquiries")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", inquiryId)
    .maybeSingle();
  return Boolean(data);
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

export async function sendMessage(
  tenantSlug: string,
  inquiryId: string,
  threadType: ThreadType,
  body: string,
  replyToMessageId?: string | null,
): Promise<{ id: string; created_at: string } | { error: string }> {
  try {
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 10000) {
      return { error: "Message body is empty or too long." };
    }

    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return { error: "Workspace not found." };

    const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
    if (!canView) return { error: "Not authorised." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Database unavailable." };

    if (!(await inquiryBelongsToTenant(supabase, scope.tenantId, inquiryId))) {
      return { error: "Inquiry not found in this workspace." };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data, error } = await supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        thread_type: threadType,
        sender_user_id: user.id,
        body: trimmed,
        tenant_id: scope.tenantId,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      })
      .select("id, created_at")
      .single();

    if (error) {
      logServerError("messages.sendMessage", error);
      return { error: "Failed to send message." };
    }

    // Mark read for the sender immediately after sending
    await markThreadRead(tenantSlug, inquiryId, threadType);

    return { id: data.id, created_at: data.created_at };
  } catch (err) {
    logServerError("messages.sendMessage", err);
    return { error: "Unexpected error." };
  }
}

// ─── fetchMessages ────────────────────────────────────────────────────────────

export async function fetchMessages(
  tenantSlug: string,
  inquiryId: string,
  threadType: ThreadType,
): Promise<WorkspaceMessage[]> {
  try {
    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return [];
    const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
    if (!canView) return [];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    if (!(await inquiryBelongsToTenant(supabase, scope.tenantId, inquiryId))) return [];
    return loadInquiryMessages(scope.tenantId, inquiryId, threadType);
  } catch (err) {
    logServerError("messages.fetchMessages", err);
    return [];
  }
}

// ─── markThreadRead ───────────────────────────────────────────────────────────

export async function markThreadRead(
  tenantSlug: string,
  inquiryId: string,
  threadType: ThreadType,
): Promise<void> {
  try {
    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return;

    const supabase = await createSupabaseServerClient();
    if (!supabase) return;

    if (!(await inquiryBelongsToTenant(supabase, scope.tenantId, inquiryId))) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc("inquiry_mark_thread_read", {
      p_inquiry_id: inquiryId,
      p_thread_type: threadType,
    });
    if (error) {
      logServerError("messages.markThreadRead.rpc", error);
      return;
    }
  } catch (err) {
    logServerError("messages.markThreadRead", err);
  }
}
