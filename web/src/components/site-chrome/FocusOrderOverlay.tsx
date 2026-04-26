"use client";

/**
 * Phase 10 (S-16) — focus-order preview overlay.
 *
 * Toggles via `?focus=1` (deep-linkable) or the floating chip. When on,
 * every tabbable element gets a small numbered badge in the top-left
 * corner showing its tab order. Lets operators audit keyboard navigation
 * without alt-tabbing into devtools or screen readers.
 *
 * Implementation notes:
 *   - Builds the badge list on demand (lazy) and on resize / DOM mutation
 *     so newly-rendered sections pick up immediately.
 *   - Skips elements outside the viewport on first paint to keep the
 *     badge count manageable; scrolling re-evaluates.
 *   - Uses absolute positioning anchored to the focusable's bounding rect
 *     so dragging / resizing the page just updates positions.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[role='button']:not([aria-disabled='true'])",
  "audio[controls]",
  "video[controls]",
  "details > summary:first-of-type",
].join(",");

interface BadgePosition {
  index: number;
  top: number;
  left: number;
  /** Element kind for tone variation — focusable button vs link vs input. */
  kind: "link" | "button" | "input" | "other";
}

function elementKind(el: Element): BadgePosition["kind"] {
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button" || el.getAttribute("role") === "button") return "button";
  if (tag === "input" || tag === "select" || tag === "textarea") return "input";
  return "other";
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

export function FocusOrderOverlay(): ReactElement | null {
  const [enabled, setEnabled] = useState(false);
  const [badges, setBadges] = useState<ReadonlyArray<BadgePosition>>([]);
  const rafRef = useRef<number | null>(null);

  // 1. URL hint (?focus=1) toggles overlay on first load.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("focus") === "1") {
      setEnabled(true);
      url.searchParams.delete("focus");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const recompute = useCallback(() => {
    if (!enabled) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const all = Array.from(document.querySelectorAll(TABBABLE_SELECTOR));
      const next: BadgePosition[] = [];
      let i = 1;
      for (const el of all) {
        if (el.closest("[data-focus-overlay-skip]")) continue;
        if (!isVisible(el)) continue;
        const r = (el as HTMLElement).getBoundingClientRect();
        next.push({
          index: i,
          top: r.top + window.scrollY,
          left: r.left + window.scrollX,
          kind: elementKind(el),
        });
        i += 1;
      }
      setBadges(next);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setBadges([]);
      return;
    }
    recompute();
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => recompute());
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      mo.disconnect();
    };
  }, [enabled, recompute]);

  return (
    <>
      <button
        type="button"
        data-focus-overlay-skip
        onClick={() => setEnabled((v) => !v)}
        title="Toggle focus-order preview"
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 70,
          padding: "6px 10px",
          borderRadius: 999,
          background: enabled ? "#7c3aed" : "rgba(255,255,255,0.95)",
          color: enabled ? "#fff" : "#111",
          border: "1px solid rgba(0,0,0,0.1)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "pointer",
          boxShadow: "0 6px 16px -8px rgba(0,0,0,0.25)",
        }}
      >
        Focus order: {enabled ? "ON" : "off"}
      </button>
      {enabled
        ? badges.map((b) => (
            <span
              key={`${b.index}-${b.top}-${b.left}`}
              aria-hidden
              data-focus-overlay-skip
              style={{
                position: "absolute",
                top: b.top - 4,
                left: b.left - 4,
                zIndex: 65,
                width: 18,
                height: 18,
                borderRadius: 4,
                background:
                  b.kind === "link"
                    ? "#2563eb"
                    : b.kind === "button"
                      ? "#16a34a"
                      : b.kind === "input"
                        ? "#d97706"
                        : "#7c3aed",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
                boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                pointerEvents: "none",
              }}
            >
              {b.index}
            </span>
          ))
        : null}
    </>
  );
}
