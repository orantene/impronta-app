"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

export type SendClientInquiryMessageResult =
  | { id: string; created_at: string }
  | { error: string };

function returnToThread(
  tenantSlug: string,
  inquiryId: string,
  params: URLSearchParams,
): never {
  redirect(`/${tenantSlug}/client/inquiries/${inquiryId}?${params.toString()}`);
}

export async function sendClientInquiryMessage(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<SendClientInquiryMessageResult> {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) {
    return { error: "You cannot message on this inquiry." };
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
    logServerError("client.thread.send", insertError);
    return { error: "Could not send message." };
  }

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (readErr) {
    logServerError("client.thread.markRead", readErr);
  }

  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);
  return { id: data.id, created_at: data.created_at };
}

export async function markClientInquiryThreadRead(
  tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) return;

  const { error } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (error) {
    logServerError("client.thread.markRead", error);
  }
}

export async function sendClientInquiryMessageAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!tenantSlug || !inquiryId) {
    redirect("/login");
  }

  const result = await sendClientInquiryMessage(tenantSlug, inquiryId, body);
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
