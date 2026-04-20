"use server";

import { revalidatePath } from "next/cache";
import { markThreadRead, sendMessage } from "@/lib/inquiry/inquiry-engine";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";

export async function actionSendInquiryMessage(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to send on this thread." };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const threadType = String(formData.get("thread_type") ?? "private") as "private" | "group";
  const body = String(formData.get("body") ?? "").trim();
  if (!inquiryId || !body) {
    return { ok: false, code: "validation_error", message: "Message cannot be empty." };
  }

  const res = await sendMessage(supabase, {
    inquiryId,
    tenantId,
    actorUserId: user.id,
    threadType: threadType === "group" ? "group" : "private",
    body,
  });

  if (!res.success) {
    return res.forbidden
      ? { ok: false, code: "permission_denied", message: "You cannot send on this inquiry." }
      : { ok: false, code: "precondition_failed", message: res.error ?? "Could not send message." };
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Message sent." };
}

export type InquiryThreadMessageDto = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

/** Staff-only: fetch older messages before a cursor (ASC batch for prepending). */
export async function actionLoadOlderInquiryMessages(
  formData: FormData,
): Promise<ActionResult<{ messages: InquiryThreadMessageDto[] }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  }
  const { supabase, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const threadType = String(formData.get("thread_type") ?? "private") as "private" | "group";
  const beforeCreatedAt = String(formData.get("before_created_at") ?? "").trim();
  const limitRaw = Number(formData.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;

  if (!inquiryId || !beforeCreatedAt) {
    return { ok: false, code: "validation_error", message: "Missing inquiry or cursor." };
  }

  const { data, error } = await supabase
    .from("inquiry_messages")
    .select("id, body, created_at, sender_user_id, metadata")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("thread_type", threadType === "group" ? "group" : "private")
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, code: "server_error", message: "Could not load older messages." };
  }

  const rawRows = (data ?? []).slice().reverse();

  const senderIds = [...new Set(rawRows.map((m) => m.sender_user_id).filter((id): id is string => Boolean(id)))];
  const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", senderIds);
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), { display_name: (p.display_name as string | null) ?? null, avatar_url: (p.avatar_url as string | null) ?? null });
    }
  }
  const rows: InquiryThreadMessageDto[] = rawRows.map((m) => ({
    ...(m as Record<string, unknown>),
    id: m.id as string,
    body: m.body as string,
    created_at: m.created_at as string,
    sender_user_id: m.sender_user_id as string | null,
    sender_name: m.sender_user_id ? (profileMap.get(m.sender_user_id as string)?.display_name ?? null) : null,
    sender_avatar_url: m.sender_user_id ? (profileMap.get(m.sender_user_id as string)?.avatar_url ?? null) : null,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
  }));
  return { ok: true, data: { messages: rows } };
}

export async function actionMarkInquiryThreadRead(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "Not signed in as staff." };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const threadType = String(formData.get("thread_type") ?? "private") as "private" | "group";
  const lastMessageIdRaw = String(formData.get("last_message_id") ?? "").trim();
  const lastMessageId = lastMessageIdRaw.length > 0 ? lastMessageIdRaw : null;
  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const res = await markThreadRead(supabase, {
    inquiryId,
    tenantId,
    actorUserId: user.id,
    threadType: threadType === "group" ? "group" : "private",
    lastMessageId,
  });
  if (!res.success) {
    return { ok: false, code: "precondition_failed", message: res.error ?? "Could not update read state." };
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true };
}
