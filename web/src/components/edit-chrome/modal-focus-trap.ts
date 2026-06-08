"use client";

/**
 * Focus trap for centred modals (command palette, shortcut overlay — M5).
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalFocusTrap(active: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;

    priorFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const container = containerRef.current;
    const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const prior = priorFocusRef.current;
      priorFocusRef.current = null;
      if (prior && document.body.contains(prior)) {
        try {
          prior.focus({ preventScroll: true });
        } catch {
          /* non-focusable */
        }
      }
    };
  }, [active, onEscape]);

  return containerRef;
}
