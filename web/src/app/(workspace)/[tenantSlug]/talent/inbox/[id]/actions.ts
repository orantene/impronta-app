"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentSelfProfile } from "../../../_data-bridge";

export type SendTalentInquiryMessageResult =
  | { id: string; created_at: string }
  | { error: string };

function returnToThread(
  tenantSlug: string,
  inquiryId: string,
  params: URLSearchParams,
): never {
  redirect(`/${tenantSlug}/talent/inbox/${inquiryId}?${params.toString()}`);
}

export async function sendTalentInquiryMessage(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<SendTalentInquiryMessageResult> {
  const trimmed = body.trim();

  if (!trimmed || trimmed.length > 10000) {
    return { error: "Message is empty or too long." };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return { error: "Workspace not found." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Database unavailable." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const talent = await loadTalentSelfProfile(user.id, scope.tenantId);
  if (!talent) {
    return { error: "Talent profile not found in this workspace." };
  }

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) {
    return { error: "Inquiry not found in this workspace." };
  }

  const { data: participant } = await supabase
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .in("status", ["invited", "active"])
    .maybeSingle();
  if (!participant) {
    return { error: "You cannot message on this inquiry." };
  }

  const { data, error: insertError } = await supabase
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      thread_type: "group",
      sender_user_id: user.id,
      body: trimmed,
      tenant_id: scope.tenantId,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    logServerError("talent.thread.send", insertError);
    return { error: "Could not send message." };
  }

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "group",
  });
  if (readErr) {
    logServerError("talent.thread.markRead", readErr);
  }

  revalidatePath(`/${tenantSlug}/talent/inbox/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/talent/inbox`);
  return { id: data.id, created_at: data.created_at };
}

export async function markTalentInquiryThreadRead(
  tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const talent = await loadTalentSelfProfile(user.id, scope.tenantId);
  if (!talent) return;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) return;

  const { data: participant } = await supabase
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .in("status", ["invited", "active"])
    .maybeSingle();
  if (!participant) return;

  const { error } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "group",
  });
  if (error) {
    logServerError("talent.thread.markRead", error);
  }
}

export async function sendTalentInquiryMessageAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!tenantSlug || !inquiryId) {
    redirect("/login");
  }

  const result = await sendTalentInquiryMessage(tenantSlug, inquiryId, body);
  if ("error" in result) {
    returnToThread(
      tenantSlug,
      inquiryId,
      new URLSearchParams({ err: result.error }),
    );
  }

  returnToThread(
    tenantSlug,
    inquiryId,
    new URLSearchParams({ ok: "Message sent." }),
  );
}
