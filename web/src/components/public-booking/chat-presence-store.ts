/**
 * DK-1: what the catalog dock needs to know about the chat, so its chat button
 * can wear the talent's photo with an online dot (and an unread dot) instead of
 * a generic icon. The chat launcher publishes it while it is mounted, which is
 * exactly when chat is on and inquiries are open: the dot never claims
 * presence for a paused site. Module scope on purpose: the launcher and the
 * catalog island are separate React trees on the same page.
 */

export type ChatPresence = {
  photoUrl: string | null;
  name: string;
  /** A reply the visitor has not seen yet. */
  unread: boolean;
};

let presence: ChatPresence | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function same(a: ChatPresence | null, b: ChatPresence | null): boolean {
  return a === b || (a !== null && b !== null && a.photoUrl === b.photoUrl && a.name === b.name && a.unread === b.unread);
}

export function setChatPresence(next: ChatPresence | null): void {
  if (same(presence, next)) return;
  presence = next;
  notify();
}

export function peekChatPresence(): ChatPresence | null {
  return presence;
}

export function subscribeChatPresence(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
