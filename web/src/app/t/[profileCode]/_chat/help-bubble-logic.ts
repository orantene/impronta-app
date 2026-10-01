/**
 * DK-3 help bubble: the pure rules (no React), unit-tested on their own.
 *
 * The bubble offers help once per visit: after the visitor scrolls about 520px,
 * a one-line pill appears just above the chat button, then hides itself after 9
 * seconds. It never shows while the chat or a sheet is open, or when the chat
 * button is hidden. The chat button is the dock's chat icon when the dock is up
 * (with or without a selection), the idle bar's chat button, or the floating
 * chat button, in that order.
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

/** Kept when storage is unreadable or unwritable, so the bubble shows at most once per page load. */
const shownThisLoad = new Set<string>();

/** Test hook: forget the in-memory flags. */
export function resetHelpBubbleMemory(): void {
  shownThisLoad.clear();
}

export function readHelpBubbleSeen(storage: StorageLike | null, key: string): boolean {
  if (shownThisLoad.has(key)) return true;
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Stored for the visit; if storage throws, remembered for this page load instead. */
export function markHelpBubbleSeen(storage: StorageLike | null, key: string): void {
  try {
    if (!storage) throw new Error("no storage");
    storage.setItem(key, "1");
    if (storage.getItem(key) !== "1") shownThisLoad.add(key);
  } catch {
    shownThisLoad.add(key);
  }
}

/** True while something else owns the screen. The dock being up is NOT a reason: it is where the bubble anchors. */
export function helpBubbleBlocked(input: { chatOpen: boolean; sheetOpen: boolean }): boolean {
  return input.chatOpen || input.sheetOpen;
}

export function shouldShowHelpBubble(input: {
  scrollY: number;
  seen: boolean;
  blocked: boolean;
}): boolean {
  return !input.seen && !input.blocked && input.scrollY >= HELP_BUBBLE_SCROLL_PX;
}

/** Up to two initials for the no-photo avatar ("Alba Rivas" gives "AR"). */
export function helpBubbleInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = Array.from(parts[0]!)[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

export type HelpBubbleAnchor = { el: HTMLElement; side: "left" | "right" };

const visible = (el: HTMLElement | null): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/**
 * Where the bubble sits: above the dock's chat icon (left aligned), else the
 * idle bar's chat button (left), else the floating chat button (right aligned,
 * it lives at the right edge). `null` when no chat button is on screen.
 */
export function findHelpBubbleAnchor(doc: Document): HelpBubbleAnchor | null {
  const dock = doc.querySelector<HTMLElement>(".cb-dock[data-show='true'] .cb-dock-ask");
  if (visible(dock)) return { el: dock, side: "left" };
  const bar = doc.querySelector<HTMLElement>(".cb-bar[data-show='true'] .cb-bar-chat");
  if (visible(bar)) return { el: bar, side: "left" };
  const fab = doc.querySelector<HTMLElement>("[data-guest-chat-fab]:not([data-gone='true'])");
  if (visible(fab)) return { el: fab, side: "right" };
  return null;
}

/** Fixed bottom bars the bubble must clear (the booking bar / selection dock). */
export function findHelpBubbleBarTops(doc: Document): number[] {
  const out: number[] = [];
  doc.querySelectorAll<HTMLElement>(".cb-bar[data-show='true'], .cb-dock[data-show='true']").forEach((el) => {
    if (!visible(el)) return;
    out.push(el.getBoundingClientRect().top);
  });
  return out;
}

/** The bubble's CSS `bottom`: 12px above the highest of the anchor and any bottom bar, so it never overlaps one. */
export function helpBubbleBottom(viewportH: number, anchorTop: number, barTops: number[]): number {
  const top = Math.min(anchorTop, ...barTops.filter((n) => n > 0));
  return viewportH - top + 12;
}

/** True when a bubble from another instance is already on the page: only one may render. */
export function otherHelpBubbleShown(doc: Document, own: Element | null): boolean {
  return Array.from(doc.querySelectorAll("[data-help-bubble]")).some((el) => el !== own);
}
