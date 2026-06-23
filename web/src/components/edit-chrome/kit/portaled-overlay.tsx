"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * PortaledOverlay — render floating editor chrome (menus, popovers, modals)
 * into <body> so it escapes ANY ancestor that establishes a containing block
 * for `position: fixed` descendants (`backdrop-filter` / `filter` / `transform`
 * / `perspective` / `contain`) and any `overflow` clip on the chrome.
 *
 * WHY THIS EXISTS
 * ──────────────
 * The editor top bar is a glass strip with `backdrop-filter: blur(...)` plus
 * `overflow-x: auto; overflow-y: hidden`. Per the CSS spec, `backdrop-filter`
 * makes that element the containing block for fixed-positioned descendants — so a
 * `position: fixed` menu rendered *inside* the bar is re-anchored to the bar and
 * then clipped by its overflow, rendering invisibly. The page-picker menu, the
 * publish split-button menu, and the named-checkpoint modal all hit this (#646).
 * Portaling to <body> is the fix.
 *
 * Most builder chrome is already safe because it renders under the
 * `display: contents` `[data-edit-chrome]` root — an element with
 * `display: contents` generates no box, so it is never a containing block and
 * carries no filter. That invariant is guarded by
 * `edit-chrome-overlay-invariant.static.test.ts`. Reach for THIS primitive for
 * any overlay that lives inside a glass / transformed / clipped container, and
 * prefer it by default for new floating chrome so the trap can't recur.
 *
 * The caller computes viewport coordinates (typically from a trigger's
 * `getBoundingClientRect()`) and styles the child with `position: fixed`.
 *
 * Usage — keep the truthiness guard at the call site so the children (which read
 * the position state) are only constructed when they exist:
 *
 *   {open && menuPos ? (
 *     <PortaledOverlay>
 *       <div style={{ position: "fixed", top: menuPos.top, left: menuPos.left }} />
 *     </PortaledOverlay>
 *   ) : null}
 *
 * SSR-safe: renders nothing until `document` exists, and nothing when `open` is
 * explicitly false.
 */
export function PortaledOverlay({
  open = true,
  children,
}: {
  /** When false (or during SSR) nothing is rendered. Defaults to true. */
  open?: boolean;
  children: ReactNode;
}): ReactNode {
  if (!open || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
