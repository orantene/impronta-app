"use client";

/**
 * RailHandle — shared top affordance for the builder's two icon rails
 * (the left CommandDock and the right InspectorCommandRail).
 *
 * Renders the drag grip plus a collapse/expand toggle on one centered row,
 * so both rails share the exact same "drag + hide/show" controls. The grip
 * owns the small move-vs-click threshold tracking that both rails relied on
 * (it sets `dragMovedRef` so a drag isn't misread as a tab click) and then
 * defers to the real {@link useFloatingDrag} pointer handler.
 *
 * The collapse state itself lives in {@link useRailCollapsed}, which persists
 * the choice to localStorage so a shrunk rail stays shrunk across reloads.
 */

import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronsDownUp, ChevronsUpDown, GripVertical } from "lucide-react";

import { CHROME } from "./tokens";

/** Drag is only registered once the pointer travels past this many px. */
const DRAG_MOVE_THRESHOLD_PX = 4;

/**
 * Persisted collapse state for an icon rail. Hydrates from localStorage in an
 * effect (so SSR + first client paint agree on "expanded", then snap to the
 * stored value) and writes back on every toggle.
 */
export function useRailCollapsed(storageKey: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "1") setCollapsed(true);
    } catch {
      // localStorage can throw in private mode / sandboxed iframes — ignore.
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // best-effort persistence; the in-memory toggle still works.
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}

export interface RailHandleProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** The {@link useFloatingDrag} pointer handler for this rail. */
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  /** Set true while a drag is in flight so a tab click can be suppressed. */
  dragMovedRef: MutableRefObject<boolean>;
  /** Plain-language name of what collapses, e.g. "tools" → "Collapse tools". */
  collapseLabel: string;
}

export function RailHandle({
  collapsed,
  onToggleCollapsed,
  onHandlePointerDown,
  dragMovedRef,
  collapseLabel,
}: RailHandleProps) {
  const toggleLabel = collapsed
    ? `Expand ${collapseLabel}`
    : `Collapse ${collapseLabel}`;

  return (
    <div
      className={`mx-auto flex items-center justify-center gap-1 ${collapsed ? "" : "mb-2"}`}
    >
      <button
        type="button"
        aria-label="Drag to move"
        title="Drag to move"
        onPointerDown={(e) => {
          dragMovedRef.current = false;
          const startX = e.clientX;
          const startY = e.clientY;
          const onMove = (ev: PointerEvent) => {
            if (
              Math.abs(ev.clientX - startX) > DRAG_MOVE_THRESHOLD_PX ||
              Math.abs(ev.clientY - startY) > DRAG_MOVE_THRESHOLD_PX
            ) {
              dragMovedRef.current = true;
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener(
            "pointerup",
            () => window.removeEventListener("pointermove", onMove),
            { once: true },
          );
          onHandlePointerDown(e);
        }}
        className="inline-flex cursor-grab items-center justify-center border-none bg-transparent p-0 active:cursor-grabbing"
        style={{ color: CHROME.muted3, height: 20 }}
      >
        <GripVertical size={16} strokeWidth={2.25} aria-hidden />
      </button>
      <button
        type="button"
        data-no-drag
        onClick={onToggleCollapsed}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 transition-colors"
        style={{ color: CHROME.muted3 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(124, 58, 237, 0.08)";
          e.currentTarget.style.color = CHROME.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = CHROME.muted3;
        }}
      >
        {collapsed ? (
          <ChevronsUpDown size={14} strokeWidth={2.25} aria-hidden />
        ) : (
          <ChevronsDownUp size={14} strokeWidth={2.25} aria-hidden />
        )}
      </button>
    </div>
  );
}
