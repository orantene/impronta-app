import "server-only";

import { readQaFixtureMarker } from "@/lib/messages-v5/qa-fixture-row";
import { displayableContact } from "@/lib/inquiry/guest-send-gate";

import { VISITOR_FALLBACK_NAME } from "./inquiry-name-pure";

import { settleChipsFromOrders } from "@/lib/talent-agenda/abandoned-order";
import { toRecordChip, type ConversationRecordRow } from "./record-chip";
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
  client_user_id?: string | null;
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
  source_context: unknown;
};

/** Upper bound on rows one inbox load reads (newest first). */
export const INBOX_ROW_LIMIT = 1000;

export async function loadMessagingInbox(
  admin: Admin,
  input: {
    tenantId: string;
    locationSlug: string;
    filter: InboxFilter;
    actorUserId: string;
    /** When set, the inbox is these inquiries only, across tenants. Empty means no rows. */
    onlyInquiryIds?: readonly string[];
  },
): Promise<{ ok: true; rows: InboxRow[]; unreadCount: number } | { ok: false; reason: "unavailable" }> {
  if (input.onlyInquiryIds && input.onlyInquiryIds.length === 0) {
    return { ok: true, rows: [], unreadCount: 0 };
  }
  let query = admin
    .from("inquiries")
    .select(
      "id, tenant_id, location_slug, contact_name, client_user_id, contact_phone, contact_email, conversation_state, opportunity_state, channel, owner_user_id, last_customer_message_at, last_staff_message_at, resolved_at, lost_reason, status, current_offer_id, message, updated_at, version, source_context",
    )
    .order("updated_at", { ascending: false });
  query = input.onlyInquiryIds
    ? query.in("id", [...input.onlyInquiryIds])
    : query.eq("tenant_id", input.tenantId);
  const { data, error } = await query.limit(INBOX_ROW_LIMIT);
  if (error) return { ok: false, reason: "unavailable" };

  const inquiries = (data ?? []) as InquiryRow[];
  const ids = inquiries.map((row) => row.id);
  const reads = await loadReads(admin, input.actorUserId, ids);
  const chips = await loadChips(admin, input.onlyInquiryIds ? null : input.tenantId, ids);
  const previews = await loadPreviews(admin, ids);
  const owners = await loadOwnerLabels(admin, inquiries.map((row) => row.owner_user_id));
  const otherSide = await loadOtherSideNames(admin, inquiries, input.actorUserId);

  const rows: InboxRow[] = [];
  let unreadCount = 0;
  for (const row of inquiries) {
    if ((row.location_slug ?? "default") !== input.locationSlug && input.locationSlug !== "all") continue;
    const unread = isUnread(row, reads.get(row.id) ?? null);
    if (unread) unreadCount += 1;
    const paid = (chips.get(row.id) ?? []).some((chip) => chip.paymentState === "paid" || chip.paymentState === "partially_refunded");
    // TUL-379: never surface seed Guest / pending-…@guest.impronta in the list.
    const shown = displayableContact(row.contact_name, row.contact_email);
    // TUL-1887: a thread whose other side is a known person (the client's account name, or the
    // talent when the viewer is the client) is never "no identity yet".
    const contact = shown.contactName.trim() ? shown : { ...shown, contactName: otherSide.get(row.id) ?? shown.contactName };
    const mapped: InboxRow = {
      id: row.id,
      tenantId: row.tenant_id,
      locationSlug: row.location_slug ?? "default",
      contactName: contact.contactName,
      contactPhone: row.contact_phone,
      contactEmail: contact.contactEmail,
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
        paid,
      }),
      channel: (row.channel as MessagingChannel | null) ?? "web_chat",
      ownerUserId: row.owner_user_id,
      ownerLabel: row.owner_user_id ? (owners.get(row.owner_user_id) ?? null) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      subject: clip(row.message ?? "") || clip(previews.get(row.id) ?? "") || displayName(contact.contactName),
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
          paid,
        }),
        recordChips: chips.get(row.id) ?? [],
      }),
      lastCustomerMessageAt: row.last_customer_message_at,
      lastStaffMessageAt: row.last_staff_message_at,
      updatedAt: row.updated_at,
      version: row.version,
      recordChips: chips.get(row.id) ?? [],
      ...(readQaFixtureMarker(row.source_context) ? { qaFixture: true } : {}),
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
  return trimmed === "" ? VISITOR_FALLBACK_NAME : trimmed;
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

async function loadChips(admin: Admin, tenantId: string | null, inquiryIds: string[]): Promise<Map<string, RecordChip[]>> {
  const map = new Map<string, RecordChip[]>();
  if (inquiryIds.length === 0) return map;
  let query = admin
    .from("conversation_records")
    .select("inquiry_id, record_kind, record_id, payment_state, fulfilment_state, record_date")
    .is("unlinked_at", null);
  query = tenantId ? query.eq("tenant_id", tenantId) : query.in("inquiry_id", inquiryIds);
  const { data, error } = await query;
  if (error) return map;
  const wanted = new Set(inquiryIds);
  for (const row of (data ?? []) as (ConversationRecordRow & { inquiry_id: string })[]) {
    if (!wanted.has(row.inquiry_id)) continue;
    const list = map.get(row.inquiry_id) ?? [];
    list.push(toRecordChip(row));
    map.set(row.inquiry_id, list);
  }
  // TUL-715: an order chip follows the live order (cancelled/expired), same as Clientes and Hoy.
  const all = [...map.values()].flat();
  const settled = await settleChipsFromOrders(admin, all);
  let i = 0;
  for (const [id, list] of map) map.set(id, settled.slice(i, (i += list.length)));
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

/** inquiry id -> the name of the other side when the inquiry's own contact name is blank. Cosmetic: a failed read leaves the row as it was. */
async function loadOtherSideNames(admin: Admin, inquiries: InquiryRow[], actorUserId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const blank = inquiries.filter((row) => !displayableContact(row.contact_name, row.contact_email).contactName.trim());
  if (blank.length === 0) return out;
  const viewerIsClient = new Set(blank.filter((row) => row.client_user_id === actorUserId).map((row) => row.id));
  const clientIds = [...new Set(blank.filter((row) => !viewerIsClient.has(row.id) && row.client_user_id).map((row) => row.client_user_id as string))];
  if (clientIds.length > 0) {
    const { data, error } = await admin.from("profiles").select("id, display_name").in("id", clientIds);
    if (!error) {
      const names = new Map<string, string>();
      for (const p of (data ?? []) as { id: string; display_name: string | null }[]) if (p.display_name?.trim()) names.set(p.id, p.display_name.trim());
      for (const row of blank) {
        const n = row.client_user_id ? names.get(row.client_user_id) : undefined;
        if (n) out.set(row.id, n);
      }
    }
  }
  if (viewerIsClient.size > 0) {
    const { data, error } = await admin
      .from("inquiry_participants")
      .select("inquiry_id, talent_profiles(display_name)")
      .eq("role", "talent")
      .in("inquiry_id", [...viewerIsClient]);
    if (!error) {
      const byInquiry = new Map<string, string[]>();
      for (const p of (data ?? []) as { inquiry_id: string; talent_profiles: { display_name: string | null } | { display_name: string | null }[] | null }[]) {
        const tp = Array.isArray(p.talent_profiles) ? p.talent_profiles[0] : p.talent_profiles;
        const n = tp?.display_name?.trim();
        if (n) byInquiry.set(p.inquiry_id, [...(byInquiry.get(p.inquiry_id) ?? []), n]);
      }
      for (const [id, names] of byInquiry) out.set(id, names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", "));
    }
  }
  return out;
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
