"use client";

// ─── Interaction primitives ──────────────────────────────────────────
//
// SwipeableRow / BackToTop / Skeleton / useKeyboardListNav /
// useRovingTabindex / BulkSelectBar / BulkRowCheckbox.
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { COLORS, FONTS, Z } from "../state";
import { Icon } from "./icons";
import { scrollBehavior } from "./a11y";

// ─── SwipeableRow ────────────────────────────────────────────────────
/**
 * Mobile list row with hidden left and/or right action panels that
 * reveal as the user swipes the row horizontally.
 *
 * Implementation notes:
 *  - Pointer events (touch + mouse) so it works in dev too.
 *  - Threshold gates: actions latch open at ~50% of action-panel width;
 *    otherwise the row springs back.
 *  - On click of an action button, the row is reset.
 *  - `pointerEvents` are pass-through when not engaged so links inside
 *    the row keep working on tap-without-drag.
 */
export function SwipeableRow({
  children,
  leftActions,
  rightActions,
}: {
  children: ReactNode;
  /** Revealed when user swipes right. Each gets a fixed width tile. */
  leftActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
  rightActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
}) {
  const [dx, setDx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const startDx = useRef(0);
  // Q5: mirror startX-non-null as a state so render can read it without
  // touching ref.current (react-hooks/refs). The ref still drives the
  // pointer-move math (it must update synchronously between move events),
  // but `dragging` flips on Down/Up to control the CSS transition.
  const [dragging, setDragging] = useState(false);
  const allActions = [...(leftActions ?? []), ...(rightActions ?? [])];
  const ACTION_WIDTH = 80;
  const leftMax = (leftActions?.length ?? 0) * ACTION_WIDTH;
  const rightMax = (rightActions?.length ?? 0) * ACTION_WIDTH;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startDx.current = dx;
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    let next = startDx.current + delta;
    next = Math.max(-rightMax, Math.min(leftMax, next));
    setDx(next);
  };
  const onPointerUp = () => {
    startX.current = null;
    setDragging(false);
    // Snap to fully open (one direction) or closed
    if (dx > leftMax / 2) setDx(leftMax);
    else if (dx < -rightMax / 2) setDx(-rightMax);
    else setDx(0);
  };

  const toneColor = (tone?: "ink" | "red" | "green") =>
    tone === "red" ? COLORS.red : tone === "green" ? COLORS.green : COLORS.ink;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      {/* Left action panel — sits behind the row, revealed when dx > 0 */}
      {leftActions && leftActions.length > 0 && (
        <div
          aria-hidden={dx <= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-start",
            pointerEvents: dx > 0 ? "auto" : "none",
          }}
        >
          {leftActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Right action panel */}
      {rightActions && rightActions.length > 0 && (
        <div
          aria-hidden={dx >= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-end",
            pointerEvents: dx < 0 ? "auto" : "none",
          }}
        >
          {rightActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Row — translates with the drag */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          background: COLORS.card,
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform .2s ease",
          willChange: "transform",
          position: "relative",
        }}
      >
        {children}
        {/* Keyboard / accessibility fallback: a kebab "..." button that
            opens a small popover listing the same actions. Keyboard
            users can't drag, so without this all actions were
            mouse/touch-only. */}
        {allActions.length > 0 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Row actions"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: COLORS.inkDim,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(11,11,13,0.05)";
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = COLORS.inkDim;
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                onBlur={() => setMenuOpen(false)}
                style={{
                  position: "absolute",
                  top: 36,
                  right: 6,
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(11,11,13,0.10)",
                  minWidth: 140,
                  padding: 4,
                  zIndex: 5,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {allActions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      a.onClick();
                      setMenuOpen(false);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 13,
                      color:
                        a.tone === "red"
                          ? COLORS.red
                          : a.tone === "green"
                            ? COLORS.green
                            : COLORS.ink,
                      padding: "8px 10px",
                      borderRadius: 6,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(11,11,13,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── BackToTop ───────────────────────────────────────────────────────
/**
 * Floating "↑ Top" pill that appears after the user has scrolled past
 * the threshold. Click → smooth-scrolls to the top. Mounted once at the
 * page root; works for any long surface.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        right: 20,
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: COLORS.fill,
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(11,11,13,0.18)",
        cursor: "pointer",
        zIndex: Z.toast - 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        opacity: 0.9,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.9")}
    >
      ↑
    </button>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────
/**
 * Loading-state placeholder. A muted block with a shimmering gradient.
 * Use any time we mount a real-data list/card before the data arrives,
 * so the layout doesn't pop and dimensions stay stable. Inherits height
 * + width from props or sets a sensible default.
 */
export function Skeleton({
  width,
  height = 16,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(11,11,13,0.04) 25%, rgba(11,11,13,0.08) 50%, rgba(11,11,13,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "tulalaSkeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// ─── KeyboardListNav ─────────────────────────────────────────────────
/**
 * j/k-style row navigation hook for list pages. Hooks into a ref of
 * focusable row elements; j/Down moves selection forward, k/Up backward,
 * Enter activates. Skips when focus is in a text input so typing isn't
 * hijacked.
 *
 * Pattern: each row in the list gets ref={(el) => rowsRef.current[i] = el}
 * plus a tabindex / data-attr. The hook listens at window level and
 * focuses+highlights rows on key.
 */
// Q5: accept a RefObject<(T|null)[]> instead of the live array. The
// previous signature required callers to pass `rowRefs.current` at the
// hook call site, which is a render-time ref read (react-hooks/refs).
// With a ref, the keydown handler dereferences `.current` lazily, which
// is also semantically correct: the latest row set is always read at the
// moment the user presses a key.
export function useKeyboardListNav<T extends HTMLElement = HTMLElement>({
  rowsRef,
  onActivate,
}: {
  rowsRef: React.RefObject<(T | null)[]>;
  onActivate?: (index: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const live = (rowsRef.current ?? []).filter((r): r is T => r !== null);
      if (live.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.min(i + 1, live.length - 1);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.max(i - 1, 0);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "Enter") {
        if (onActivate) {
          e.preventDefault();
          onActivate(activeIdx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowsRef, onActivate, activeIdx]);
  return activeIdx;
}

// ─── useRovingTabindex ───────────────────────────────────────────────
/**
 * WS-12.6 — Roving-tabindex pattern for navigation lists and tab bars.
 * Only ONE item has tabIndex=0 at a time; arrow keys move focus within
 * the group; Tab exits the group entirely. This matches the ARIA
 * Authoring Practices for "Toolbar" and "Navigation" composite widgets.
 *
 * Usage:
 *   const containerRef = useRef<HTMLElement>(null);
 *   useRovingTabindex(containerRef, '[data-nav-item]');
 *
 * The hook wires keydown handlers on the container element itself
 * (not window) so it only fires when the nav group has focus.
 */
export function useRovingTabindex(
  containerRef: React.RefObject<HTMLElement | null>,
  itemSelector = "button, a[href], [role='tab']",
  { orientation = "vertical" }: { orientation?: "horizontal" | "vertical" } = {},
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initialise: direct roving items — must be inside this container,
    // not nested inside a child sub-list, and not disabled.
    const getItems = () =>
      Array.from(el.querySelectorAll<HTMLElement>(itemSelector)).filter(
        (item) => !item.hasAttribute("disabled"),
      );

    const init = () => {
      const items = getItems();
      items.forEach((item, i) => {
        item.setAttribute("tabindex", i === 0 ? "0" : "-1");
      });
    };
    init();

    const onKey = (e: KeyboardEvent) => {
      const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      if (e.key !== prev && e.key !== next && e.key !== "Home" && e.key !== "End") return;

      const items = getItems();
      if (items.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? items.indexOf(active) : -1;
      if (idx === -1) return;

      e.preventDefault();
      let target = idx;
      if (e.key === next) target = Math.min(idx + 1, items.length - 1);
      else if (e.key === prev) target = Math.max(idx - 1, 0);
      else if (e.key === "Home") target = 0;
      else if (e.key === "End") target = items.length - 1;

      items.forEach((item, i) => item.setAttribute("tabindex", i === target ? "0" : "-1"));
      items[target]?.focus({ preventScroll: true });
    };

    el.addEventListener("keydown", onKey);
    // Re-init when items are added/removed (e.g. plan gates change visible items)
    const observer = new MutationObserver(init);
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => {
      el.removeEventListener("keydown", onKey);
      observer.disconnect();
    };
  }, [containerRef, itemSelector, orientation]);
}

// ─── BulkSelect ──────────────────────────────────────────────────────
/**
 * Sticky multi-select toolbar that shows when one or more list rows
 * are selected. Drop a row checkbox into each list item via the small
 * <BulkRowCheckbox> primitive, manage a Set<string> of selected ids in
 * the parent, and render <BulkSelectBar> at the top of the page.
 *
 * Pattern is intentionally generic — actions are a per-list concern;
 * this primitive only handles "show the bar when N selected" + "clear".
 */
export function BulkSelectBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: { label: string; onClick: () => void; tone?: "ink" | "red" }[];
}) {
  if (count === 0) return null;
  return (
    <div
      data-tulala-row
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: COLORS.fill,
        color: "#fff",
        borderRadius: 10,
        marginBottom: 12,
        fontFamily: FONTS.body,
      }}
    >
      <span className="text-admin-13 font-medium">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.65)",
          fontFamily: FONTS.body,
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        Clear
      </button>
      <span style={{ flex: 1 }} />
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={a.onClick}
          style={{
            background: a.tone === "red" ? COLORS.red : "rgba(255,255,255,0.10)",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "6px 12px",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function BulkRowCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      aria-checked={checked}
      role="checkbox"
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        border: `1.5px solid ${checked ? COLORS.accent : COLORS.borderStrong}`,
        background: checked ? COLORS.fill : "transparent",
        color: "#fff",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {checked && <Icon name="check" size={11} stroke={2.4} color="#fff" />}
    </button>
  );
}

