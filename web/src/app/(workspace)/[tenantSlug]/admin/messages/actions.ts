"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import type { ThreadType, WorkspaceMessage } from "../../_data-bridge";
import { loadInquiryMessages } from "../../_data-bridge";

// ─── sendMessage ──────────────────────────────────────────────────────────────

export async function sendMessage(
  tenantSlug: string,
  inquiryId: string,
  threadType: ThreadType,
  body: string,
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get the latest message id in this thread
    const { data: lastMsg } = await supabase
      .from("inquiry_messages")
      .select("id")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", scope.tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase
      .from("inquiry_message_reads")
      .upsert({
        inquiry_id: inquiryId,
        thread_type: threadType,
        user_id: user.id,
        tenant_id: scope.tenantId,
        last_read_at: new Date().toISOString(),
        last_read_message_id: lastMsg?.id ?? null,
      }, { onConflict: "inquiry_id,thread_type,user_id" });
  } catch (err) {
    logServerError("messages.markThreadRead", err);
  }
}
