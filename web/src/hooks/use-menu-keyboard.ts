"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * TUL-1099: the one keyboard pattern for every `aria-haspopup="menu"` control
 * built by hand (marketing account / language / support, client account menu,
 * admin IdentityBar account menu). WAI-ARIA menu button:
 *   - opening moves focus to the first item (roving focus: arrows, no Tab walk)
 *   - ArrowDown / ArrowUp move with wrap, Home / End jump to the ends
 *   - Escape closes AND returns focus to the trigger (also when focus sits inside)
 *   - Tab closes and lets focus continue from the trigger
 *
 * The root must contain both the trigger (`aria-haspopup="menu"`) and the
 * `role="menu"` panel. Items are `[role="menuitem"]` plus the buttons inside any
 * `[data-menu-nav]` wrapper (use it for tab strips or language pills that are not
 * menuitems but must stay reachable, since Tab closes the menu).
 */

export const MENU_ITEM_SELECTOR =
  '[role="menu"] [role="menuitem"], [role="menu"] [data-menu-nav] button';

/** Pure index step. `current` is -1 when focus is not on an item (the trigger). */
export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

function menuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true",
  );
}

export function useMenuKeyboard(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  // Latest onClose without re-running the effect (it moves focus on open).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const trigger = () => root.querySelector<HTMLElement>('[aria-haspopup="menu"]');

    menuItems(root)[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && root.contains(active);
      if (e.key === "Escape") {
        closeRef.current();
        if (inside) trigger()?.focus();
        return;
      }
      if (!inside) return;
      if (e.key === "Tab") {
        // Focus the trigger first so the browser's default Tab moves on from it.
        if (active !== trigger()) trigger()?.focus();
        closeRef.current();
        return;
      }
      const items = menuItems(root);
      const next = nextMenuIndex(e.key, active ? items.indexOf(active) : -1, items.length);
      if (next === null) return;
      e.preventDefault();
      items[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, rootRef]);
}
