import "server-only";

import { readRosterRequestMeta } from "@/lib/service-hub/roster-request-meta";
import { renderCard } from "./cards";
import { senderLabelFor, talentNamesByUser } from "./thread-sender-labels";
import { CLIENT_THREAD, INTERNAL_NOTE_KIND, TALENT_THREAD, type InquiryThreadType } from "./thread-rule";
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
    .select("id, tenant_id, message, created_at")
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
  const labels = await loadTalentSenderLabels(admin, input.inquiryId, (data ?? []) as Array<{ sender_user_id: string | null }>);

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
    systemEvent: typeof row.metadata?.system_event_type === "string" ? row.metadata.system_event_type : null,
    fromAi: row.metadata?.from_ai === true || row.metadata?.author_kind === "booking_assistant",
    aiDisclosureLabel:
      typeof row.metadata?.disclosure_label === "string" ? row.metadata.disclosure_label : null,
    senderLabel: labels.get(row.id) ?? null,
    rosterRequest: readRosterRequestMeta(row.metadata),
  }));
  // TUL-955: the request the guest typed is the inquiry's own `message`, not an inquiry_messages
  // row, so the opened thread started at the first reply. Lead the stream with it (client side,
  // the inquiry's creation time) unless an identical client message is already there.
  const original = inquiryOriginalRequest(inquiry as { id: string; message?: string | null; created_at?: string | null });
  if (original && !messages.some((m) => !m.internal && !m.system && m.senderUserId === null && m.body.trim() === original.body)) {
    messages.unshift(original);
  }
  return { ok: true, messages };
}

/** PURE: the inquiry's own request as a leading group-thread text message from the client side, or null when there is none. */
export function inquiryOriginalRequest(inquiry: { id: string; message?: string | null; created_at?: string | null }): ThreadMessage | null {
  const body = (inquiry.message ?? "").trim();
  if (!body || !inquiry.created_at) return null;
  return {
    id: `inquiry-request:${inquiry.id}`,
    inquiryId: inquiry.id,
    kind: "text",
    body,
    payload: null,
    senderUserId: null,
    guestSessionId: null,
    createdAt: inquiry.created_at,
    editedAt: null,
    deletedAt: null,
    // Group thread: visible to the coordinating talent as well as a solo seller (the list preview
    // already shows this text to both); the client thread is the client's own and already has it.
    thread: TALENT_THREAD,
    internal: false,
    delivery: null,
    system: false,
    systemEvent: null,
  };
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

/** TUL-1887: message id -> the talent's display name, for replies written by a talent on this inquiry. Cosmetic: a failed read keeps the business label. */
async function loadTalentSenderLabels(admin: Admin, inquiryId: string, rows: Array<{ id?: string; sender_user_id: string | null }>) {
  const out = new Map<string, string>();
  const senderIds = [...new Set(rows.map((r) => r.sender_user_id).filter((x): x is string => Boolean(x)))];
  if (senderIds.length === 0) return out;
  const [byUser, parts] = await Promise.all([
    admin.from("talent_profiles").select("user_id, display_name").in("user_id", senderIds),
    admin.from("inquiry_participants").select("user_id, talent_profiles(display_name)").eq("inquiry_id", inquiryId).eq("role", "talent").in("user_id", senderIds),
  ]);
  const fromParticipants = ((parts?.data ?? []) as Array<{ user_id: string | null; talent_profiles: { display_name: string | null } | { display_name: string | null }[] | null }>).map((p) => ({
    user_id: p.user_id,
    display_name: (Array.isArray(p.talent_profiles) ? p.talent_profiles[0] : p.talent_profiles)?.display_name ?? null,
  }));
  const names = talentNamesByUser([(byUser?.data ?? []) as Array<{ user_id: string | null; display_name: string | null }>, fromParticipants]);
  const accounts = new Map<string, string>();
  for (const row of rows as Array<{ id: string; sender_user_id: string | null }>) {
    const label = senderLabelFor(row.sender_user_id, names, accounts);
    if (label) out.set(row.id, label);
  }
  return out;
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
