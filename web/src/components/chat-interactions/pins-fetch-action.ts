"use server";

/**
 * fetchPinnedMessagesAction — thin client-callable wrapper around the
 * plain server loader loadPinnedMessages. The pinned strip in the
 * admin/talent SPA loads its data on the client (the thread stream is a
 * client component), so it needs a Server Action entry point. Pure
 * pass-through — all auth/visibility logic lives in the loader.
 *
 * NOTE: only async functions may be exported from a "use server" module.
 */

import { loadPinnedMessages } from "@/lib/messages/load-pins";
import type { PinnedMessage } from "@/lib/messages/pin-types";

export async function fetchPinnedMessagesAction(
  inquiryId: string,
  threadType?: "private" | "group",
): Promise<PinnedMessage[]> {
  return loadPinnedMessages(inquiryId, threadType);
}
