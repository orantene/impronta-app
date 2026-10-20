import "server-only";

import { anyNonMenuOffering } from "@/lib/offerings/non-menu-offerings";
import { isPosOff } from "@/lib/pos/pos-enabled";

export { isPosOff };

type Admin = Parameters<typeof anyNonMenuOffering>[0];

/**
 * The counter's add-line refusals, in one place (keeps `admin/pos/actions.ts` under its line cap).
 *  - TUL-1271 item 6: an event-backing or reservation row is not a counter item (fail closed);
 *    Messages quotes (`inquiryId`) keep their own rules.
 *  - TUL-1321: the POS switch is the COUNTER's: it does not apply to Messages quotes or class
 *    sales (`sessionId`), and never to the shared `addLine` (QR, door, book-again).
 * Returns the refusal to answer with, or null to go on.
 */
export async function counterAddRefusal(
  admin: Admin,
  tenantId: string,
  p: { offeringId: string; inquiryId?: string | null; sessionId?: string | null },
) {
  if (!p.inquiryId && (await anyNonMenuOffering(admin, tenantId, [p.offeringId]))) {
    return { ok: false as const, reason: "invalid" as const, error: "That item is not for sale here." };
  }
  if (!p.inquiryId && !p.sessionId && (await isPosOff(admin, tenantId, p.offeringId))) {
    return { ok: false as const, reason: "invalid" as const, error: "That item is not sold at the counter." };
  }
  return null;
}
