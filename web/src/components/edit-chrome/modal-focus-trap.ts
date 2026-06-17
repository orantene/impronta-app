"use client";

/**
 * Focus trap for centred modals (command palette, shortcut overlay — M5).
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const containerRef = useRef<T | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  // Keep the latest onEscape in a ref so a changing callback identity (e.g.
  // `state.kind === "publishing" ? undefined : close`) does NOT re-run the
  // capture/trap effect — re-running it would steal focus back to the first
  // focusable on every such render. The effect reads the live ref instead.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

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
        onEscapeRef.current?.();
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
    // `onEscape` is intentionally NOT a dependency — it's read through
    // `onEscapeRef` so a changing callback identity doesn't re-run the
    // capture/trap effect (which would steal focus back on every render).
  }, [active]);

  return containerRef;
}
