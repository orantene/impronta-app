import "server-only";

import { readConversationState, readOpportunityState } from "./state";
import type { InboxFilter, InboxNextAction, InboxRow, MessagingChannel, RecordChip } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type InquiryRow = {
  id: string;
  tenant_id: string;
  location_slug: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  conversation_state: string | null;
  opportunity_state: string | null;
  channel: string | null;
  owner_user_id: string | null;
  last_customer_message_at: string | null;
  last_staff_message_at: string | null;
  resolved_at: string | null;
  lost_reason: string | null;
  status: string;
  current_offer_id: string | null;
  message: string | null;
  updated_at: string;
  version: number;
};

export async function loadMessagingInbox(
  admin: Admin,
  input: { tenantId: string; locationSlug: string; filter: InboxFilter; actorUserId: string },
): Promise<{ ok: true; rows: InboxRow[]; unreadCount: number } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("inquiries")
    .select(
      "id, tenant_id, location_slug, contact_name, contact_phone, contact_email, conversation_state, opportunity_state, channel, owner_user_id, last_customer_message_at, last_staff_message_at, resolved_at, lost_reason, status, current_offer_id, message, updated_at, version",
    )
    .eq("tenant_id", input.tenantId)
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, reason: "unavailable" };

  const inquiries = (data ?? []) as InquiryRow[];
  const ids = inquiries.map((row) => row.id);
  const reads = await loadReads(admin, input.actorUserId, ids);
  const chips = await loadChips(admin, input.tenantId, ids);
  const previews = await loadPreviews(admin, ids);
  const owners = await loadOwnerLabels(admin, inquiries.map((row) => row.owner_user_id));

  const rows: InboxRow[] = [];
  let unreadCount = 0;
  for (const row of inquiries) {
    if ((row.location_slug ?? "default") !== input.locationSlug && input.locationSlug !== "all") continue;
    const unread = isUnread(row, reads.get(row.id) ?? null);
    if (unread) unreadCount += 1;
    const mapped: InboxRow = {
      id: row.id,
      tenantId: row.tenant_id,
      locationSlug: row.location_slug ?? "default",
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      conversationState: readConversationState({
        conversationState: row.conversation_state,
        opportunityState: row.opportunity_state,
        lastCustomerMessageAt: row.last_customer_message_at,
        lastStaffMessageAt: row.last_staff_message_at,
        resolvedAt: row.resolved_at,
        lostReason: row.lost_reason,
        status: row.status,
        currentOfferId: row.current_offer_id,
        unread,
      }),
      opportunityState: readOpportunityState({
        conversationState: row.conversation_state,
        opportunityState: row.opportunity_state,
        lastCustomerMessageAt: row.last_customer_message_at,
        lastStaffMessageAt: row.last_staff_message_at,
        resolvedAt: row.resolved_at,
        lostReason: row.lost_reason,
        status: row.status,
        currentOfferId: row.current_offer_id,
        unread,
      }),
      channel: (row.channel as MessagingChannel | null) ?? "web_chat",
      ownerUserId: row.owner_user_id,
      ownerLabel: row.owner_user_id ? (owners.get(row.owner_user_id) ?? null) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      subject: clip(row.message ?? "") || clip(previews.get(row.id) ?? "") || displayName(row.contact_name),
      lastMessagePreview: clip(previews.get(row.id) ?? row.message ?? ""),
      nextAction: deriveNextAction({
        ownerUserId: row.owner_user_id,
        conversationState: readConversationState({
          conversationState: row.conversation_state,
          opportunityState: row.opportunity_state,
          lastCustomerMessageAt: row.last_customer_message_at,
          lastStaffMessageAt: row.last_staff_message_at,
          resolvedAt: row.resolved_at,
          lostReason: row.lost_reason,
          status: row.status,
          currentOfferId: row.current_offer_id,
          unread,
        }),
        opportunityState: readOpportunityState({
          conversationState: row.conversation_state,
          opportunityState: row.opportunity_state,
          lastCustomerMessageAt: row.last_customer_message_at,
          lastStaffMessageAt: row.last_staff_message_at,
          resolvedAt: row.resolved_at,
          lostReason: row.lost_reason,
          status: row.status,
          currentOfferId: row.current_offer_id,
          unread,
        }),
        recordChips: chips.get(row.id) ?? [],
      }),
      lastCustomerMessageAt: row.last_customer_message_at,
      lastStaffMessageAt: row.last_staff_message_at,
      updatedAt: row.updated_at,
      version: row.version,
      recordChips: chips.get(row.id) ?? [],
    };
    if (matchesFilter(mapped, input.filter, input.actorUserId)) rows.push(mapped);
  }
  return { ok: true, rows, unreadCount };
}

/**
 * The rail badge (seam 10): how many threads at this location carry a customer
 * message this person has not read. The SAME rule `loadMessagingInbox` counts
 * with (`isUnread`, per-user `inquiry_message_reads`), read with two queries
 * instead of the inbox's five, because every mode of the till asks for it on
 * every load and needs no rows, chips or previews to draw one number.
 */
export async function countMessagingUnread(
  admin: Admin,
  input: { tenantId: string; locationSlug: string; actorUserId: string },
): Promise<number> {
  const { data, error } = await admin
    .from("inquiries")
    .select("id, location_slug, last_customer_message_at")
    .eq("tenant_id", input.tenantId)
    .not("last_customer_message_at", "is", null);
  if (error) return 0;
  const rows = (data ?? []) as Pick<InquiryRow, "id" | "location_slug" | "last_customer_message_at">[];
  const scoped = rows.filter(
    (row) => input.locationSlug === "all" || (row.location_slug ?? "default") === input.locationSlug,
  );
  const reads = await loadReads(admin, input.actorUserId, scoped.map((row) => row.id));
  let unread = 0;
  for (const row of scoped) {
    if (isUnread(row, reads.get(row.id) ?? null)) unread += 1;
  }
  return unread;
}

function matchesFilter(row: InboxRow, filter: InboxFilter, actorUserId: string): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return row.unread;
  if (filter === "unassigned") return row.ownerUserId == null;
  if (filter === "mine") return row.ownerUserId === actorUserId;
  if (filter === "needs_reply") return row.conversationState === "needs_reply";
  if (filter === "awaiting_customer") return row.conversationState === "awaiting_customer";
  if (filter === "resolved") return row.conversationState === "resolved";
  return true;
}

function displayName(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "Visitor" : trimmed;
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 72) return text;
  return `${text.slice(0, 71)}…`;
}

function deriveNextAction(input: {
  ownerUserId: string | null;
  conversationState: InboxRow["conversationState"];
  opportunityState: InboxRow["opportunityState"];
  recordChips: readonly RecordChip[];
}): InboxNextAction | null {
  if (input.conversationState === "resolved") return null;
  if (input.ownerUserId == null && input.conversationState === "needs_reply") return "assign";
  if (input.conversationState === "needs_reply") return "reply";
  const unpaid = input.recordChips.some((chip) => chip.paymentState !== "paid" && chip.kind !== "offer");
  if (input.conversationState === "awaiting_customer" && unpaid) return "collect";
  if (input.opportunityState === "lost" || input.opportunityState === "gathering") return "follow_up";
  return null;
}

function isUnread(row: Pick<InquiryRow, "last_customer_message_at">, lastReadAt: string | null): boolean {
  if (!row.last_customer_message_at) return false;
  if (!lastReadAt) return true;
  return row.last_customer_message_at > lastReadAt;
}

async function loadReads(admin: Admin, userId: string, inquiryIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (inquiryIds.length === 0) return map;
  const { data, error } = await admin
    .from("inquiry_message_reads")
    .select("inquiry_id, last_read_at")
    .eq("user_id", userId)
    .in("inquiry_id", inquiryIds);
  if (error) return map;
  for (const row of (data ?? []) as { inquiry_id: string; last_read_at: string }[]) {
    map.set(row.inquiry_id, row.last_read_at);
  }
  return map;
}

async function loadChips(admin: Admin, tenantId: string, inquiryIds: string[]): Promise<Map<string, RecordChip[]>> {
  const map = new Map<string, RecordChip[]>();
  if (inquiryIds.length === 0) return map;
  const { data, error } = await admin
    .from("conversation_records")
    .select("inquiry_id, record_kind, record_id")
    .eq("tenant_id", tenantId)
    .is("unlinked_at", null);
  if (error) return map;
  for (const row of (data ?? []) as { inquiry_id: string; record_kind: RecordChip["kind"]; record_id: string }[]) {
    if (!inquiryIds.includes(row.inquiry_id)) continue;
    const list = map.get(row.inquiry_id) ?? [];
    list.push({
      kind: row.record_kind,
      recordId: row.record_id,
      label: row.record_kind,
      paymentState: null,
      fulfilmentState: null,
    });
    map.set(row.inquiry_id, list);
  }
  return map;
}

async function loadPreviews(admin: Admin, inquiryIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (inquiryIds.length === 0) return map;
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("inquiry_id, body, message_kind, created_at")
    .in("inquiry_id", inquiryIds)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return map;
  for (const row of (data ?? []) as { inquiry_id: string; body: string | null; message_kind: string }[]) {
    if (map.has(row.inquiry_id)) continue;
    if (row.message_kind === "internal_note") continue;
    if (!row.body) continue;
    map.set(row.inquiry_id, row.body);
  }
  return map;
}

async function loadOwnerLabels(admin: Admin, userIds: Array<string | null>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("profiles").select("id, display_name").in("id", ids);
  if (error) return map;
  for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
    if (row.display_name) map.set(row.id, row.display_name);
  }
  return map;
}
