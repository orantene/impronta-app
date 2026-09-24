/**
 * A failed send retries the inquiry that already exists.
 * Only the first attempt, with no id yet, may start one.
 */
export function firstSendPlan(
  inquiryId: string | null,
  contactPromoted: boolean,
): "reply" | "continue" | "start" {
  if (inquiryId && contactPromoted) return "reply";
  if (inquiryId) return "continue";
  return "start";
}
