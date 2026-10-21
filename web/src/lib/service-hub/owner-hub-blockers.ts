import type { OwnerHubCopy } from "./owner-hub-copy";

/** TUL-1613: its own module so the owner screen does not import the EN + ES copy tables into the browser. */
export function blockerSentence(c: OwnerHubCopy, blockers: readonly string[]): string {
  const map: Record<string, string> = { category: c.blockedCategory, duration: c.blockedDuration, booking_type: c.blockedBookingType };
  return blockers.map((b) => map[b]).filter(Boolean).join(" ");
}
