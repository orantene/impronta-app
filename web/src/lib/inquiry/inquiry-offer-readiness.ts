import type { InquiryWorkspaceInquiry, InquiryWorkspaceMessage } from "./inquiry-workspace-types";

export type OfferReadinessResult = { ready: boolean; reason?: string };

export function isOfferReady(input: {
  inquiry: Pick<
    InquiryWorkspaceInquiry,
    "event_location" | "event_date" | "message" | "raw_ai_query"
  >;
  messages: Pick<InquiryWorkspaceMessage, "id">[];
}): OfferReadinessResult {
  if (input.messages.length > 0) {
    return { ready: true };
  }
  const loc = (input.inquiry.event_location ?? "").trim();
  const dateOk = Boolean(input.inquiry.event_date);
  const brief =
    (input.inquiry.message ?? "").trim().length > 0 || (input.inquiry.raw_ai_query ?? "").trim().length > 0;
  if (loc && dateOk && brief) {
    return { ready: true };
  }
  if (!loc && !dateOk) {
    return { ready: false, reason: "Add event location and date, or send a message first" };
  }
  if (!loc) {
    return { ready: false, reason: "Add event location, or send a message first" };
  }
  if (!dateOk) {
    return { ready: false, reason: "Add event date, or send a message first" };
  }
  return { ready: false, reason: "Add a brief message or inquiry details before creating an offer" };
}
