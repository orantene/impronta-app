"use client";

/**
 * CanvasLinkInterceptor — blocks anchor navigation on the canvas during
 * edit mode without touching pointer-events or hover/focus state.
 *
 * Attaches capture-phase listeners to document so all canvas anchor
 * activations are intercepted before the browser acts on them.
 * Links that are descendants of [data-edit-chrome] (the editor's own
 * UI — locale switcher, page picker, navigator admin link, etc.) are
 * explicitly excluded so editor navigation stays functional.
 *
 * Covered activation paths:
 *   click         — primary click, including cmd/ctrl+click ("open in new tab")
 *   auxclick      — middle-click ("open in new tab")
 *   keydown Enter — keyboard navigation on a focused anchor
 *   keydown Space — some accessibility tools activate links with Space
 *
 * On intercept we call preventDefault() but NOT stopPropagation(), so
 * the click continues to bubble normally. SelectionLayer receives the
 * event in bubble phase and selects the section as usual — the operator
 * gets both the block and the selection in a single click.
 *
 * A transient info toast "Links are disabled while editing…" appears for
 * 2.5 s and auto-dismisses. It carries role="status" / aria-live="polite"
 * so screen readers are notified.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function CanvasLinkInterceptor() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable reference so the useEffect dep array is satisfied without
  // listing setVisible (which is stable but not in scope of the effect).
  const showHint = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
  }, []);

  useEffect(() => {
    /**
     * Returns true when `target` is inside (or is) an anchor that should
     * be blocked — i.e. it has an href and is NOT inside the editor chrome.
     */
    function isCanvasAnchor(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      const anchor = target.closest("a[href]");
      if (!anchor) return false;
      // Editor chrome elements carry [data-edit-chrome]; their links
      // (locale switcher, admin nav, etc.) must remain navigable.
      if (anchor.closest("[data-edit-chrome]")) return false;
      return true;
    }

    function onPointerActivation(e: MouseEvent) {
      if (!isCanvasAnchor(e.target)) return;
      e.preventDefault();
      // Do NOT stopPropagation — SelectionLayer needs the bubble event.
      showHint();
    }

    function onKeyActivation(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!isCanvasAnchor(e.target)) return;
      e.preventDefault();
      showHint();
    }

    // Capture phase so we fire before any inline onClick handlers or
    // Next.js router listeners that might otherwise run first.
    document.addEventListener("click", onPointerActivation, { capture: true });
    document.addEventListener("auxclick", onPointerActivation, {
      capture: true,
    });
    document.addEventListener("keydown", onKeyActivation, { capture: true });

    return () => {
      document.removeEventListener("click", onPointerActivation, {
        capture: true,
      });
      document.removeEventListener("auxclick", onPointerActivation, {
        capture: true,
      });
      document.removeEventListener("keydown", onKeyActivation, {
        capture: true,
      });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [showHint]);

  if (!visible) return null;

  return (
    <div
      data-edit-overlay="link-interceptor-hint"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[66px] z-[120] flex -translate-x-1/2 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-lg"
    >
      {/* Info circle */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      Links are disabled while editing. Exit edit mode to navigate.
    </div>
  );
}
