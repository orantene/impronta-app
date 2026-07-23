"use client";

/**
 * useFocusTrap — DOCK v2.1 a11y. Traps Tab focus inside an overlay while it is
 * open and restores focus to the previously-focused element (the trigger) on
 * close. Escape/scrim dismissal stays with the caller; this only handles the
 * focus contract so keyboard users are never stranded behind or outside a modal
 * surface.
 *
 * Usage: attach the returned ref to the overlay's root element. Pass `active`
 * (typically the same `open` flag). On mount-while-active it focuses the first
 * focusable child (or the container); on Tab/Shift+Tab at the edges it wraps;
 * on deactivate it returns focus to wherever it was before.
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    // Remember what had focus so we can restore it on close.
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus inside on open (first focusable, else the container itself).
    const first = focusables()[0];
    if (first) first.focus();
    else {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl || !node.contains(activeEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger on close (guard against a removed node).
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [active]);

  return ref;
}
