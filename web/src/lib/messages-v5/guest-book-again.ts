/**
 * P6 / F02+F06: which conversation_records chip is eligible for Book again.
 * Confirmed / fulfilled (and seated / checked-in) from the guest's side.
 * No writer.
 */

import type { GuestRecordChip } from "@/lib/inquiry/guest-chat-contract";

const BOOK_AGAIN_FULFILMENT = new Set(["confirmed", "fulfilled", "seated", "checked_in"]);

export function isBookAgainFulfilment(state: string | null | undefined): boolean {
  return typeof state === "string" && BOOK_AGAIN_FULFILMENT.has(state);
}

/** Newest eligible record chip (records are already newest-first from the reader). */
export function bookAgainRecordId(records: readonly GuestRecordChip[] | null | undefined): string | null {
  if (!records) return null;
  for (const r of records) {
    if (r.recordId && isBookAgainFulfilment(r.fulfilmentState)) return r.recordId;
  }
  return null;
}
