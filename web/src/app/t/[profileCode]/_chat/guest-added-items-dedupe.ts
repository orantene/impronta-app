/**
 * TUL-1066 (c): the store entry and the thread's own copy of the same line
 * must show once. PURE.
 *
 * The store entry wins (it carries Remove). A thread line is hidden when a
 * store entry owns its id, when the visitor just removed it (the thread has
 * not been re-read yet), or, for an entry added before the server returned a
 * line id, when it is a client-authored line with the same label.
 */
import type { GuestConversationItems } from "@/lib/inquiry/guest-chat-contract";

import type { AddedCatalogItem } from "./guest-added-items-store";

export function itemsWithoutAddedDuplicates(
  items: GuestConversationItems | null,
  added: readonly AddedCatalogItem[],
  removedLineIds: readonly string[],
): GuestConversationItems | null {
  if (!items || (added.length === 0 && removedLineIds.length === 0)) return items;
  const ownedIds = new Set(added.map((a) => a.lineId).filter((x): x is string => Boolean(x)));
  const legacyTitles = new Set(added.filter((a) => !a.lineId).map((a) => a.title.trim().toLowerCase()));
  const gone = new Set(removedLineIds);
  const lines = items.lines.filter(
    (l) =>
      !ownedIds.has(l.id) &&
      !gone.has(l.id) &&
      !(l.author === "client" && legacyTitles.has(l.label.trim().toLowerCase())),
  );
  return lines.length === items.lines.length ? items : { ...items, lines };
}
