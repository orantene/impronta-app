/**
 * DK-3 help bubble: the pure rules (no React, no DOM), unit-tested on their own.
 *
 * The bubble offers help once per visit: after the visitor scrolls about 520px,
 * a one-line pill appears above the chat button, then hides itself after 9
 * seconds. It never shows while the chat or the booking sheet is open, or while
 * the catalog dock has taken over the chat button.
 */

/** How far the visitor scrolls before the bubble may appear. */
export const HELP_BUBBLE_SCROLL_PX = 520;

/** How long the bubble stays before it hides itself. */
export const HELP_BUBBLE_VISIBLE_MS = 9000;

/** The per-visit flag lives in sessionStorage, one per talent page. */
export function helpBubbleSessionKey(profileCode: string): string {
  return `tulala:help-bubble:${profileCode}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Storage can throw (private mode, blocked site data): an unreadable flag counts as not seen. */
export function readHelpBubbleSeen(storage: StorageLike | null, key: string): boolean {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markHelpBubbleSeen(storage: StorageLike | null, key: string): void {
  try {
    storage?.setItem(key, "1");
  } catch {
    /* private mode: the bubble may show again on a reload, which is harmless */
  }
}

/** True while something else owns the bottom corner. */
export function helpBubbleBlocked(input: { chatOpen: boolean; sheetOpen: boolean; dockUp: boolean }): boolean {
  return input.chatOpen || input.sheetOpen || input.dockUp;
}

export function shouldShowHelpBubble(input: {
  scrollY: number;
  seen: boolean;
  blocked: boolean;
}): boolean {
  return !input.seen && !input.blocked && input.scrollY >= HELP_BUBBLE_SCROLL_PX;
}
