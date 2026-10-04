/**
 * `/c/t/[token]` PAID flip — detect an open payment card that still needs a
 * server refresh after Checkout / the webhook stamps paid in place.
 */

import type { ThreadMessage } from "@/lib/messaging/types";

const SETTLED = new Set(["paid", "partially_refunded", "refunded", "cancelled", "expired"]);

/** True while a payment_request on the token thread is not yet terminal. */
export function clientThreadNeedsPaidRefresh(messages: readonly ThreadMessage[]): boolean {
  for (const m of messages) {
    if (m.deletedAt) continue;
    if (m.kind !== "payment_request") continue;
    const state = typeof m.payload?.state === "string" ? m.payload.state : null;
    if (!state || !SETTLED.has(state)) return true;
  }
  return false;
}
