import { improntaLog } from "@/lib/server/structured-log";

export const INQUIRY_ACTION_EVENTS = [
  "message_sent",
  "offer_created",
  "offer_updated",
  "offer_sent",
  "offer_withdrawn",
  "approval_submitted",
  "approval_rejected",
  "booking_converted",
  "status_changed",
  "staff_reassigned",
  "talent_added",
  "talent_removed",
  "talent_reordered",
  "inquiry_duplicated",
  "inquiry_closed",
  "inquiry_reopened",
] as const;

export type InquiryActionEvent = (typeof INQUIRY_ACTION_EVENTS)[number];

export function logInquiryAction(
  event: InquiryActionEvent,
  inquiryId: string,
  role: string,
  metadata?: Record<string, unknown>,
): void {
  void improntaLog("inquiry_action", {
    event,
    inquiryId,
    role,
    ...(metadata as Record<string, string | number | boolean | null | undefined>),
  });
}
