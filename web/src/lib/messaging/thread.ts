import "server-only";

import { renderCard } from "./cards";
import { CLIENT_THREAD, INTERNAL_NOTE_KIND, type InquiryThreadType } from "./thread-rule";
import type { CardKind, ThreadMessage } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function loadMessagingThread(
  admin: Admin,
  input: { tenantId: string; inquiryId: string },
): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; reason: "unavailable" | "not_found" | "wrong_tenant" }> {
  const { data: inquiry, error: inqErr } = await admin
    .from("inquiries")
    .select("id, tenant_id")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (inqErr) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  if ((inquiry as { tenant_id: string }).tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }

  const { data, error } = await admin
    .from("inquiry_messages")
    .select(
      "id, inquiry_id, thread_type, message_kind, body, card_payload, sender_user_id, guest_session_id, created_at, edited_at, deleted_at, metadata",
    )
    .eq("inquiry_id", input.inquiryId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: "unavailable" };

  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  const delivery = await loadDelivery(admin, ids);

  const messages: ThreadMessage[] = ((data ?? []) as Array<{
    id: string;
    inquiry_id: string;
    thread_type: InquiryThreadType;
    message_kind: string;
    body: string | null;
    card_payload: Record<string, unknown> | null;
    sender_user_id: string | null;
    guest_session_id: string | null;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    metadata: Record<string, unknown> | null;
  }>).map((row) => ({
    id: row.id,
    inquiryId: row.inquiry_id,
    kind: row.message_kind,
    body: row.body ?? "",
    payload: row.card_payload,
    senderUserId: row.sender_user_id,
    guestSessionId: row.guest_session_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    thread: row.thread_type,
    internal: row.message_kind === INTERNAL_NOTE_KIND,
    delivery: delivery.get(row.id) ?? null,
    system: row.sender_user_id === null && typeof row.metadata?.system_event_type === "string",
  }));
  return { ok: true, messages };
}

/**
 * Staff read every thread (`loadMessagingThread` above). The customer reads
 * the client thread only, minus internal notes and deleted rows (D-MSG-2).
 */
export function customerVisibleMessages(messages: readonly ThreadMessage[]) {
  return messages
    .filter((message) => message.thread === CLIENT_THREAD && !message.internal && !message.deletedAt)
    .map((message) => ({
      ...message,
      render: renderCard(message.kind as CardKind, message.payload, "customer"),
    }));
}

async function loadDelivery(admin: Admin, messageIds: string[]) {
  const map = new Map<string, { channel: string; state: string }>();
  if (messageIds.length === 0) return map;
  const { data, error } = await admin
    .from("message_delivery")
    .select("message_id, channel, state")
    .in("message_id", messageIds);
  if (error) return map;
  for (const row of (data ?? []) as { message_id: string; channel: string; state: string }[]) {
    map.set(row.message_id, { channel: row.channel, state: row.state });
  }
  return map;
}
