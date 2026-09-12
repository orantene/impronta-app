import "server-only";

/**
 * inquiries-messaging-state.ts — the Messages engine's three state families
 * on a workspace inbox row (`docs/plans/program/engine/messaging.md`, seam 4).
 *
 * Split from `inquiries-messages.ts` at its 800-line cap. The conversation
 * and opportunity states come from `lib/messaging/state` (the same rules the
 * POS inbox applies); the record chips are the still-linked
 * `conversation_records` rows. The three are carried separately and drawn as
 * separate chips: a resolved thread never loses its order, a paid order never
 * resolves the thread.
 */

import { readConversationState, readOpportunityState, type InquiryStateInput } from "@/lib/messaging/state";
import { RECORD_KINDS, type InquiryMessagingState, type RecordKind } from "@/lib/messaging/types";

export type { InquiryMessagingState };

export type InquiryMessagingColumns = {
  status: string;
  conversation_state: string | null;
  opportunity_state: string | null;
  last_customer_message_at: string | null;
  last_staff_message_at: string | null;
  resolved_at: string | null;
  lost_reason: string | null;
  current_offer_id: string | null;
};

/** Linked records per inquiry; an unknown kind is dropped, never shown raw. */
export function linkedRecordsByInquiry(rows: unknown): Map<string, InquiryMessagingState["records"]> {
  const map = new Map<string, InquiryMessagingState["records"]>();
  for (const row of ((rows ?? []) as { inquiry_id: string; record_kind: string; record_id: string }[])) {
    if (!(RECORD_KINDS as readonly string[]).includes(row.record_kind)) continue;
    const list = map.get(row.inquiry_id) ?? [];
    list.push({ kind: row.record_kind as RecordKind, recordId: row.record_id });
    map.set(row.inquiry_id, list);
  }
  return map;
}

export function inquiryMessagingState(
  row: InquiryMessagingColumns,
  unread: boolean,
  records: InquiryMessagingState["records"],
): InquiryMessagingState {
  const input: InquiryStateInput = {
    conversationState: row.conversation_state,
    opportunityState: row.opportunity_state,
    lastCustomerMessageAt: row.last_customer_message_at,
    lastStaffMessageAt: row.last_staff_message_at,
    resolvedAt: row.resolved_at,
    lostReason: row.lost_reason,
    status: row.status,
    currentOfferId: row.current_offer_id,
    unread,
  };
  return {
    conversation: readConversationState(input),
    opportunity: readOpportunityState(input),
    records,
  };
}
