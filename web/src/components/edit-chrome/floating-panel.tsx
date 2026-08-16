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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useMaybeEditContext } from "./edit-context";
import { computeMagnetSnap } from "./workspace-layout";

export interface FloatingOffset {
  x: number;
  y: number;
}

/** Keep at least this many px of the panel on each axis inside the viewport. */
const KEEP_ON_SCREEN = 64;

export interface UseFloatingDragOptions {
  /**
   * Stable id ("navigator" | "inspector" | …) that ties this panel into the
   * Photoshop-style dockable workspace. When provided AND an `EditProvider` is
   * mounted, the hook:
   *   - seeds its initial offset from the PINNED workspace layout (so a saved
   *     layout restores on refresh instead of snapping home),
   *   - registers a live offset + rect getter so the topbar Pin can snapshot
   *     it and the magnet can edge-align other panels against it,
   *   - snaps to screen edges / sibling-panel edges while dragging (magnet),
   *   - snaps home when the operator clicks Reset (watches `workspaceResetNonce`).
   * Omit it (or render outside `EditProvider`) and the hook behaves exactly as
   * before: session-only offset, no persistence, no magnet.
   */
  panelId?: string;
  /** Fired when a drag begins (e.g. inspector undocks from tab rail). */
  onDragStart?: () => void;
  /** Fired on each move with the delta since the previous tick. */
  onDragMove?: (offset: FloatingOffset, delta: FloatingOffset) => void;
  /** Fired when a drag ends — use for dock snap / re-lock. */
  onDragEnd?: (offset: FloatingOffset) => void;
}

export interface UseFloatingDragResult {
  offset: FloatingOffset;
  /** True while a drag is in progress (suppress transitions / text selection). */
  dragging: boolean;
  /** Attach to the drag handle's `onPointerDown`. */
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  /** Snap the panel back to its home position (offset 0,0). */
  reset: () => void;
  /** Imperative offset (dock snap / coupled follower). */
  setOffset: (next: FloatingOffset | ((prev: FloatingOffset) => FloatingOffset)) => void;
  /** `transform` string for the panel element. */
  transform: string;
  /**
   * Ref callback for the panel's root element. Required for magnet snapping +
   * Pin (the hook measures the live bounding box through it). Harmless to
   * attach even when no `panelId` is set.
   */
  setPanelNode: (node: HTMLElement | null) => void;
}

/**
 * Track a session-only translate offset for a floating panel. Pointer-drag from
 * a handle moves it; the offset is clamped to always keep a graspable strip of
 * the panel on-screen, whether the panel is anchored to the left or right edge.
 */
export function useFloatingDrag(
  options: UseFloatingDragOptions = {},
): UseFloatingDragResult {
  const { panelId, onDragStart, onDragMove, onDragEnd } = options;
  const ctx = useMaybeEditContext();
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => {
    onDragStartRef.current = onDragStart;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
  }, [onDragStart, onDragMove, onDragEnd]);

  // Seed from the pinned workspace layout (if any) so a saved layout restores
  // on refresh. With no panelId / no provider / no saved layout this is {0,0}
  // — the unchanged session-only default. Computed once on first render.
  const [offset, setOffsetState] = useState<FloatingOffset>(() => {
    if (!panelId || !ctx) return { x: 0, y: 0 };
    const saved = ctx.getSavedPanelOffset(panelId);
    return saved ?? { x: 0, y: 0 };
  });
  const [dragging, setDragging] = useState(false);

  // Live element ref — the magnet measures the panel's on-screen rect through
  // it. A ref callback (not just useRef) so we can also keep the registry's
  // rect getter pointed at the current node.
  const nodeRef = useRef<HTMLElement | null>(null);
  const setPanelNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  // Keep the latest offset in a ref so the registry's getOffset() (read by Pin)
  // always sees the current value without re-registering on every drag tick.
  // Synced in an effect (never written during render) to satisfy the
  // ref-discipline lint.
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const clamp = useCallback((next: FloatingOffset): FloatingOffset => {
    if (typeof window === "undefined") return next;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Generous travel in every direction, but always keep a graspable strip on
    // screen so the handle stays reachable — symmetric so it works for a
    // left-anchored (navigator) OR right-anchored (inspector) panel.
    const maxX = vw - KEEP_ON_SCREEN;
    const minX = -(vw - KEEP_ON_SCREEN);
    const maxY = vh - KEEP_ON_SCREEN;
    const minY = -KEEP_ON_SCREEN;
    return {
      x: Math.max(minX, Math.min(maxX, next.x)),
      y: Math.max(minY, Math.min(maxY, next.y)),
    };
  }, []);

  const setOffset = useCallback(
    (next: FloatingOffset | ((prev: FloatingOffset) => FloatingOffset)) => {
      setOffsetState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        return clamp(resolved);
      });
    },
    [clamp],
  );

  // Register this panel into the dockable-workspace registry so Pin can read
  // its live offset and the magnet can edge-align siblings against its rect.
  const register = ctx?.registerWorkspacePanel;
  const registerOffset = ctx?.registerWorkspacePanelOffset;
  useEffect(() => {
    if (!panelId || !register) return undefined;
    return register(panelId, {
      getOffset: () => offsetRef.current,
      getRect: () => {
        const node = nodeRef.current;
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      },
    });
  }, [panelId, register]);
  useEffect(() => {
    if (!panelId || !registerOffset) return undefined;
    return registerOffset(panelId, setOffset);
  }, [panelId, registerOffset, setOffset]);

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
      // Capture the panel's on-screen rect at drag start. The magnet works in
      // absolute viewport coords (anchor-agnostic: same math for a left- or
      // right-anchored panel) and converts the snap back into an offset delta.
      const startRect = nodeRef.current?.getBoundingClientRect() ?? null;
      const magnetEnabled = Boolean(panelId && ctx && startRect);
      onDragStartRef.current?.();
      // PR #1136 leftover — the anchored selection toolbar's occluder clamp
      // (canvas-toolbar-anchor.ts) only re-measures on a scroll/resize/RO/MO
      // signal; dragging a panel moves it via THESE pointer listeners, which
      // fire none of those. Prime the toolbar's dirty flag now (drag start)
      // and on every move tick below so it re-clamps around the panel while
      // it's actually moving, not just once it stops.
      ctx?.notifyCanvasGeometryDirty?.();
      setDragging(true);
      let lastX = baseX;
      let lastY = baseY;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const rawDx = ev.clientX - startX;
        const rawDy = ev.clientY - startY;
        let nextX = baseX + rawDx;
        let nextY = baseY + rawDy;

        if (magnetEnabled && startRect && ctx) {
          // Proposed top-left = where the panel WOULD render with the raw drag
          // delta. Snap it, then fold the snap correction back into the offset.
          const snap = computeMagnetSnap({
            proposed: {
              left: startRect.left + rawDx,
              top: startRect.top + rawDy,
            },
            size: { width: startRect.width, height: startRect.height },
            viewport: { width: window.innerWidth, height: window.innerHeight },
            others: ctx.getOtherWorkspacePanelRects(panelId!),
          });
          nextX = baseX + (snap.left - startRect.left);
          nextY = baseY + (snap.top - startRect.top);
        }

        const clamped = clamp({ x: nextX, y: nextY });
        ctx?.notifyCanvasGeometryDirty?.();
        onDragMoveRef.current?.(clamped, {
          x: clamped.x - lastX,
          y: clamped.y - lastY,
        });
        lastX = clamped.x;
        lastY = clamped.y;
        setOffsetState(clamped);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        setDragging(false);
        onDragEndRef.current?.(offsetRef.current);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [offset.x, offset.y, clamp, panelId, ctx],
  );

  // Re-clamp if the viewport shrinks under a dragged-out panel.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setOffsetState((cur) => clamp(cur));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const reset = useCallback(() => setOffsetState({ x: 0, y: 0 }), []);

  // Reset-to-default from the topbar bumps `workspaceResetNonce`; snap this
  // panel home when it changes (skip the initial mount value).
  const resetNonce = ctx?.workspaceResetNonce ?? 0;
  const didMountResetRef = useRef(false);
  useEffect(() => {
    if (!didMountResetRef.current) {
      didMountResetRef.current = true;
      return;
    }
    if (!panelId) return;
    setOffsetState({ x: 0, y: 0 });
  }, [resetNonce, panelId]);

  return {
    offset,
    dragging,
    onHandlePointerDown,
    reset,
    setOffset,
    transform: `translate(${Math.round(offset.x)}px, ${Math.round(offset.y)}px)`,
    setPanelNode,
  };
}

export interface FloatingPanelDragContextValue {
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  dragging: boolean;
  moved: boolean;
  onReset: () => void;
}

const FloatingPanelDragContext =
  createContext<FloatingPanelDragContextValue | null>(null);

export function FloatingPanelDragProvider({
  value,
  children,
}: {
  value: FloatingPanelDragContextValue;
  children: ReactNode;
}) {
  return (
    <FloatingPanelDragContext.Provider value={value}>
      {children}
    </FloatingPanelDragContext.Provider>
  );
}

/** Drag handle state when the grip is integrated into a panel header row. */
export function useFloatingPanelDrag(): FloatingPanelDragContextValue | null {
  return useContext(FloatingPanelDragContext);
}

/** Six-dot grip glyph — shared by the drag strip and inline header handles. */
export function FloatingDragGrip({ dragging = false }: { dragging?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 3px)",
        gridAutoRows: "3px",
        gap: 2.5,
        opacity: dragging ? 0.85 : 0.5,
        flexShrink: 0,
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
  );
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
      <FloatingDragGrip dragging={dragging} />
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
