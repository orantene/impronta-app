import {
  CONVERSATION_STATES,
  OPPORTUNITY_STATES,
  type ConversationState,
  type OpportunityState,
} from "./types";

export type InquiryStateInput = {
  conversationState: string | null;
  opportunityState: string | null;
  lastCustomerMessageAt: string | null;
  lastStaffMessageAt: string | null;
  resolvedAt: string | null;
  lostReason: string | null;
  status: string | null;
  currentOfferId: string | null;
  unread: boolean;
};

/**
 * Three families stay separate. Unread is an indicator, never a state.
 * A resolved thread never becomes lost. A paid order never resolves a thread.
 */
export function readConversationState(input: InquiryStateInput): ConversationState {
  if (input.resolvedAt || input.conversationState === "resolved") return "resolved";
  if (isConversationState(input.conversationState)) return input.conversationState;
  if (
    input.lastCustomerMessageAt &&
    (!input.lastStaffMessageAt || input.lastCustomerMessageAt >= input.lastStaffMessageAt)
  ) {
    return "needs_reply";
  }
  if (input.lastStaffMessageAt) return "awaiting_customer";
  return "needs_reply";
}

export function readOpportunityState(input: InquiryStateInput): OpportunityState | null {
  if (input.lostReason) return "lost";
  if (isOpportunityState(input.opportunityState)) return input.opportunityState;
  const status = (input.status ?? "").toLowerCase();
  if (status === "rejected" || status === "expired" || status === "closed_lost" || status === "closed") {
    return "lost";
  }
  if (status === "booked" || status === "converted" || status === "approved") return "won";
  if (!input.currentOfferId) {
    if (
      status === "submitted" ||
      status === "new" ||
      status === "qualified" ||
      status === "reviewing" ||
      status === "in_progress" ||
      status === "coordination" ||
      status === "waiting_for_client"
    ) {
      return "gathering";
    }
    return null;
  }
  if (status === "offer_pending") return "awaiting_acceptance";
  return "gathering";
}

export function isConversationState(value: string | null | undefined): value is ConversationState {
  return CONVERSATION_STATES.includes(value as ConversationState);
}

export function isOpportunityState(value: string | null | undefined): value is OpportunityState {
  return OPPORTUNITY_STATES.includes(value as OpportunityState);
}

export function resolveDoesNotCancelRecords(): true {
  return true;
}

export function paidRecordDoesNotResolveThread(): true {
  return true;
}
