"use server";

import { revalidatePath } from "next/cache";
import { sendMessage } from "@/lib/inquiry/inquiry-engine";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireClient } from "@/lib/server/action-guards";
import { resolveInquiryTenantForParticipant } from "@/lib/saas/admin-scope";

export async function actionClientInquirySendMessage(formData: FormData): Promise<ActionResult> {
  const auth = await requireClient();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  }
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!inquiryId || !body) {
    return { ok: false, code: "validation_error", message: "Message cannot be empty." };
  }

  const tenantId = await resolveInquiryTenantForParticipant(supabase, auth.user.id, inquiryId, "client");
  if (!tenantId) {
    return { ok: false, code: "permission_denied", message: "You cannot access this inquiry." };
  }

  const res = await sendMessage(supabase, {
    inquiryId,
    tenantId,
    actorUserId: auth.user.id,
    threadType: "private",
    body,
  });

  if (!res.success) {
    return res.forbidden
      ? { ok: false, code: "permission_denied", message: "You cannot send on this inquiry." }
      : { ok: false, code: "precondition_failed", message: res.error ?? "Could not send message." };
  }
  revalidatePath(`/client/inquiries/${inquiryId}`);
  return { ok: true, message: "Message sent." };
}

export type ClientThreadMessageDto = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

export async function actionClientLoadOlderInquiryMessages(
  formData: FormData,
): Promise<ActionResult<{ messages: ClientThreadMessageDto[] }>> {
  const auth = await requireClient();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  }
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const beforeCreatedAt = String(formData.get("before_created_at") ?? "").trim();
  const limitRaw = Number(formData.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;

  if (!inquiryId || !beforeCreatedAt) {
    return { ok: false, code: "validation_error", message: "Missing inquiry or cursor." };
  }

  const tenantId = await resolveInquiryTenantForParticipant(supabase, auth.user.id, inquiryId, "client");
  if (!tenantId) {
    return { ok: false, code: "permission_denied", message: "You cannot access this inquiry." };
  }

  const { data, error } = await supabase
    .from("inquiry_messages")
    .select("id, body, created_at, sender_user_id, metadata")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("thread_type", "private")
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
  const rows: ClientThreadMessageDto[] = rawRows.map((m) => ({
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
