/**
 * G.7 — Read receipt formatting.
 *
 * Renders "Seen at HH:MM" / "Seen yesterday 14:32" / "Seen May 8 · 14:32"
 * style copy alongside the last outbound message in a thread, derived
 * from inquiry_message_reads.last_read_at vs the message's created_at.
 *
 * The chip should appear only when:
 *   1. The message is from the current user (you don't need a receipt
 *      for your own incoming messages).
 *   2. At least one OTHER participant has a last_read_at >= the message's
 *      created_at (i.e. they've opened the thread since you sent).
 *   3. The recipient hasn't disabled read receipts in user_prefs (future
 *      preference — Phase F.11).
 *
 * This module is pure logic. The chip render lives in the consuming
 * thread component which has access to message + reads bridge data.
 */

import { formatMessageTime } from "./relative-time";

export type ReadReceiptInput = {
  /** ISO of the message that we're checking receipt for. */
  messageCreatedAt: string;
  /** ISO of the latest `last_read_at` from any OTHER participant. */
  recipientLastReadAt: string | null | undefined;
};

export function isReadReceiptVisible(input: ReadReceiptInput): boolean {
  if (!input.recipientLastReadAt) return false;
  return new Date(input.recipientLastReadAt).getTime() >= new Date(input.messageCreatedAt).getTime();
}

/**
 * Produce the display label for a read receipt — "Seen 14:32" /
 * "Seen Yesterday 14:32" / "Seen Mon 14:32" / "Seen May 8 · 14:32".
 * Returns null when not visible so consumers can simply render the
 * non-null result.
 */
export function readReceiptLabel(
  input: ReadReceiptInput,
  now: number = Date.now(),
): string | null {
  if (!isReadReceiptVisible(input)) return null;
  return `Seen ${formatMessageTime(input.recipientLastReadAt!, now)}`;
}

/**
 * Bridge query helper — given a list of inquiry_message_reads rows for
 * the current thread (excluding the sender themselves), return the most
 * recent last_read_at. The thread component uses this to know "have my
 * messages been seen?".
 */
export function latestRecipientReadAt(
  reads: Array<{ user_id: string; last_read_at: string | null }>,
  senderUserId: string,
): string | null {
  let latest: string | null = null;
  for (const r of reads) {
    if (r.user_id === senderUserId) continue;
    if (!r.last_read_at) continue;
    if (!latest || r.last_read_at > latest) latest = r.last_read_at;
  }
  return latest;
}
