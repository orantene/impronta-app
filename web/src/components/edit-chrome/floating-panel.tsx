"use client";

/**
 * Floating control-panel primitives — turn the builder's fixed chrome (the
 * Layers navigator, the inspector dock, a tools rail) into Paint/Figma-style
 * panels you can grab and move anywhere over the canvas.
 *
 * Design contract (per product direction 2026-06-03):
 *   - Panels float as detached, rounded, shadowed cards over the canvas.
 *   - A drag HANDLE (grip strip) moves the whole panel. The offset is held in
 *     LOCAL React state, so it resets to the panel's home position on every
 *     page refresh (the panel "snaps back" on reload) but stays wherever you
 *     left it for the rest of the session.
 *   - The offset is clamped so a panel can never be dragged fully off-screen —
 *     its grip always stays reachable.
 *
 * `useFloatingDrag` binds its pointer listeners SYNCHRONOUSLY in the pointer-
 * down handler (the same manual-capture pattern the navigator's width-resize
 * uses — no dnd library, and no effect-binding lag that would drop the opening
 * frames of a fast drag). `FloatingDragHandle` is the visible grip affordance.
 */

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export interface FloatingOffset {
  x: number;
  y: number;
}

/** Keep at least this many px of the panel on each axis inside the viewport. */
const KEEP_ON_SCREEN = 64;

export interface UseFloatingDragResult {
  offset: FloatingOffset;
  /** True while a drag is in progress (suppress transitions / text selection). */
  dragging: boolean;
  /** Attach to the drag handle's `onPointerDown`. */
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  /** Snap the panel back to its home position (offset 0,0). */
  reset: () => void;
  /** `transform` string for the panel element. */
  transform: string;
}

/**
 * Track a session-only translate offset for a floating panel. Pointer-drag from
 * a handle moves it; the offset is clamped to keep the panel on-screen.
 *
 * @param homeWidth  approximate panel width (px) — used only to clamp so the
 *                   panel can't be pushed entirely off either horizontal edge.
 */
export function useFloatingDrag(homeWidth = 320): UseFloatingDragResult {
  const [offset, setOffset] = useState<FloatingOffset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback(
    (next: FloatingOffset): FloatingOffset => {
      if (typeof window === "undefined") return next;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Generous travel, but never let the panel leave a graspable strip
      // on-screen (its handle must always stay reachable).
      const maxX = vw - KEEP_ON_SCREEN;
      const minX = -(homeWidth - KEEP_ON_SCREEN);
      const maxY = vh - KEEP_ON_SCREEN;
      const minY = -KEEP_ON_SCREEN;
      return {
        x: Math.max(minX, Math.min(maxX, next.x)),
        y: Math.max(minY, Math.min(maxY, next.y)),
      };
    },
    [homeWidth],
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // Ignore non-primary buttons + clicks on an interactive control inside
      // the handle (the snap-back button / panel actions).
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag]")) return;
      event.preventDefault();

      // Bind move/up SYNCHRONOUSLY here so the very first pointermove after
      // pointerdown is captured. (A listener bound in a dragging-gated effect
      // only attaches after React re-renders, dropping the opening frames.)
      const startX = event.clientX;
      const startY = event.clientY;
      const baseX = offset.x;
      const baseY = offset.y;
      setDragging(true);
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        setOffset(
          clamp({
            x: baseX + (ev.clientX - startX),
            y: baseY + (ev.clientY - startY),
          }),
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        setDragging(false);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [offset.x, offset.y, clamp],
  );

  // Re-clamp if the viewport shrinks under a dragged-out panel.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setOffset((cur) => clamp(cur));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  return {
    offset,
    dragging,
    onHandlePointerDown,
    reset,
    transform: `translate(${Math.round(offset.x)}px, ${Math.round(offset.y)}px)`,
  };
}

interface FloatingDragHandleProps {
  onPointerDown: (event: ReactPointerEvent) => void;
  dragging: boolean;
  /** Short panel name shown beside the grip. */
  label?: string;
  /** Right-aligned controls (collapse / close) — excluded from the drag. */
  actions?: ReactNode;
  /** Whether the panel has been moved from home (enables the snap-back hint). */
  moved?: boolean;
  onReset?: () => void;
  style?: CSSProperties;
}

/**
 * The grip strip at the top of a floating panel. The whole strip is the drag
 * surface; `actions` (and anything marked `data-no-drag`) stay clickable.
 */
export function FloatingDragHandle({
  onPointerDown,
  dragging,
  label,
  actions,
  moved,
  onReset,
  style,
}: FloatingDragHandleProps) {
  return (
    <div
      data-floating-drag-handle=""
      onPointerDown={onPointerDown}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 30,
        padding: "0 8px 0 10px",
        cursor: dragging ? "grabbing" : "grab",
        flexShrink: 0,
        touchAction: "none",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 3px)",
          gridAutoRows: "3px",
          gap: 2.5,
          opacity: dragging ? 0.85 : 0.5,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: 9999,
              background: "currentColor",
            }}
          />
        ))}
      </span>
      {label ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "currentColor",
            opacity: 0.62,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {moved && onReset ? (
        <button
          type="button"
          data-no-drag
          onClick={onReset}
          title="Snap back to home position"
          aria-label="Snap panel back to home position"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "currentColor",
            opacity: 0.55,
            cursor: "pointer",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      ) : null}
      {actions ? (
        <span data-no-drag style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          {actions}
        </span>
      ) : null}
    </div>
  );
}
