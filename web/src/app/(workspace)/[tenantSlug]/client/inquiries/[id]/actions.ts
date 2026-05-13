"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";

export type SendClientInquiryMessageResult = ServerActionResult<{
  id: string;
  created_at: string;
}>;

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
    return { ok: false, error: "Message is empty or too long." };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, error: "Database unavailable." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) {
    return { ok: false, error: "You cannot message on this inquiry." };
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
    return { ok: false, error: "Could not send message." };
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
  return { ok: true, data: { id: data.id, created_at: data.created_at } };
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
  if (!result.ok) {
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
