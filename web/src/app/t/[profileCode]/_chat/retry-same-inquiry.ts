/**
 * A failed send retries the inquiry that already exists.
 * Only the first attempt, with no id yet, may start one.
 *
 * TUL-458: after a successful first message the client MUST treat the
 * inquiry as contact-promoted (`reply`). Leaving `contactPromoted` false
 * routes the second message through `continue` (re-promote + send), which
 * can leave the draft stuck in the composer after "Solicitud recibida".
 */
export function firstSendPlan(
  inquiryId: string | null,
  contactPromoted: boolean,
): "reply" | "continue" | "start" {
  if (inquiryId && contactPromoted) return "reply";
  if (inquiryId) return "continue";
  return "start";
}

/**
 * Whether a successful first delivery should flip the client to the reply
 * path. Always true once an inquiry id exists after start/continue — the
 * guest's contact was accepted by the server with that message.
 */
export function shouldMarkPromotedAfterFirstDelivery(inquiryId: string | null): boolean {
  return Boolean(inquiryId);
}
