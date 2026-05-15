"use server";

// Phase 2.1 slice 2 — server actions for the canonical admin thread.
//
// Mirrors client/inquiries/[id]/actions.ts but admin-scoped: staff-on-
// tenant rather than client_user_id match. Reuses the same
// inquiry_messages insert + inquiry_mark_thread_read RPC so the realtime
// + unread accounting stays identical across POVs.

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";

export type SendAdminInquiryMessageResult = ServerActionResult<{
  id: string;
  created_at: string;
}>;

/**
 * Send a message on the private (agency ↔ client) thread as staff.
 * Bound by the page to (tenantSlug, inquiryId); the adapter calls it
 * with just `body` to match the ParticipantThreadShell contract.
 */
export async function sendAdminInquiryMessage(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<SendAdminInquiryMessageResult> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 10_000) {
    return { ok: false, error: "Message is empty or too long." };
  }

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) return { ok: false, error: "Not authorised." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // Confirm the inquiry belongs to this tenant before writing. Staff RLS
  // covers the actual insert authz; this is a clean 404-ish guard.
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) {
    return { ok: false, error: "Inquiry not found in this workspace." };
  }

  const { data, error: insertError } = await supabase
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      thread_type: "private",
      sender_user_id: user.id,
      body: trimmed,
      tenant_id: scope.tenantId,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    logServerError("admin.thread.send", insertError);
    return { ok: false, error: "Could not send message." };
  }

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (readErr) logServerError("admin.thread.send.markRead", readErr);

  revalidatePath(`/${tenantSlug}/admin/messages/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/admin/messages`);
  return { ok: true, data: { id: data.id, created_at: data.created_at } };
}

export async function markAdminInquiryThreadRead(
  tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return;

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) return;

  const { error } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (error) logServerError("admin.thread.markRead", error);
}
