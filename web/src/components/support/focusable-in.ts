/**
 * Visible focusable check for overlays with `position: fixed` ancestors.
 * `offsetParent === null` is true for many fixed descendants, so the focus
 * trap must not use it (TUL-534 / GRK-097).
 */
export function isFocusableVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}
