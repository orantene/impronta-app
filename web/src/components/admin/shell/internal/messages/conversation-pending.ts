/**
 * conversation-pending.ts — the one-shot "open this conversation next" slot.
 *
 * Pending conversation id, set by callers (e.g. the Today bookings row)
 * just before they navigate to the messages page. The shell consumes it
 * on mount and clears it. Module-level so it survives the lazy-import
 * boundary; one-shot so a refresh doesn't keep re-pinning the same row.
 *
 * A LEAF ON PURPOSE. This file imports nothing. `conversation-stash.ts`
 * used to hold these two functions beside the offer/notes/flags stores,
 * and those stores import the messages machinery; so `pinNextConversation`
 * from a page that never renders a thread (Inbox list, Calendar, the
 * notification bell) put the entire messages graph into the shell's
 * first-paint chunk. Import the setter from HERE in shell code that runs
 * before the messages shell is on screen.
 */
export let __pendingActiveConversationId: string | null = null;
export function pinNextConversation(id: string) { __pendingActiveConversationId = id; }
export function consumePendingConversation(): string | null {
  const v = __pendingActiveConversationId;
  __pendingActiveConversationId = null;
  return v;
}
