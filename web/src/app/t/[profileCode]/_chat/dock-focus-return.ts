/**
 * TUL-1082: where focus goes when the dock closes. The round launcher is not
 * always the opener: when the catalog bar or selection dock carries its own
 * chat button the launcher is hidden (visibility:hidden, aria-hidden), so
 * focusing it does nothing and the browser drops focus on the next control
 * ("Continuar"). Prefer the control that actually opened the dock, then the
 * launcher, then the first visible in-page chat opener. Pure.
 */

export type FocusableLike = {
  isConnected: boolean;
  focus: (options?: { preventScroll?: boolean }) => void;
};

/** The first candidate that is still in the page and passes `canFocus`; null when none do. */
export function pickFocusReturnTarget<T extends FocusableLike>(
  candidates: ReadonlyArray<T | null | undefined>,
  canFocus: (el: T) => boolean,
): T | null {
  for (const el of candidates) {
    if (el && el.isConnected && canFocus(el)) return el;
  }
  return null;
}

/** Selectors of the in-page controls that open the guest chat (catalog bar, selection dock). */
export const CHAT_OPENER_SELECTOR = ".cb-bar[data-show='true'] .cb-bar-chat, .cb-dock[data-show='true'] .cb-dock-ask";

/** Visible and reachable by keyboard: not display:none / visibility:hidden, not inside an aria-hidden subtree. */
export function isKeyboardReachable(el: HTMLElement): boolean {
  if (el.closest("[aria-hidden='true']")) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}
