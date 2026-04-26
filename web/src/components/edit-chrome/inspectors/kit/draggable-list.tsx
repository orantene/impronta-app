"use client";

/**
 * DraggableList — minimal pointer-based reorder for inspector item lists.
 *
 * The canvas has its own drag-to-reorder for *sections across slots*. That
 * logic is DOM-driven (reads section bounding boxes from the live page) and
 * not reusable here. This primitive handles the simpler inside-one-panel
 * case: a vertical list of item rows the operator wants to re-order.
 *
 * Implementation — we track pointer position over the list, compute which
 * index the cursor is closest to using each child's offsetTop + offsetHeight,
 * and emit `onReorder(nextIndices)` on drop. No library dependency. No
 * HTML5 drag API (it's coarse and doesn't play well with React).
 *
 * Consumers pass their items + an itemId function; we own the pointer state
 * and render children with a `data-drag-index` attribute so operators can
 * see the active row.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface DraggableListProps<T> {
  items: T[];
  keyOf: (item: T, index: number) => string;
  onReorder: (next: T[]) => void;
  children: (
    item: T,
    index: number,
    handleProps: DragHandleProps,
  ) => ReactNode;
  /** Minimum pointer travel before a drag engages. Defaults to 4 px. */
  threshold?: number;
}

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  "data-drag-handle": true;
}

export function DraggableList<T>({
  items,
  keyOf,
  onReorder,
  children,
  threshold = 4,
}: DraggableListProps<T>) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const startRef = useRef<{ x: number; y: number; index: number } | null>(null);

  const findInsertionIndex = useCallback(
    (clientY: number): number => {
      const list = listRef.current;
      if (!list) return items.length;
      const rows = Array.from(
        list.querySelectorAll<HTMLElement>("[data-drag-row]"),
      );
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i]!.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (clientY < midpoint) return i;
      }
      return rows.length;
    },
    [items.length],
  );

  useEffect(() => {
    if (dragIndex === null) return;

    function onMove(e: PointerEvent) {
      if (startRef.current === null) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dragIndex === null && Math.hypot(dx, dy) < threshold) return;
      const idx = findInsertionIndex(e.clientY);
      setDropIndex(idx);
    }

    function onUp() {
      if (dragIndex !== null && dropIndex !== null) {
        // Convert insertion-index (where the row would be dropped) into the
        // final array. Same-slot: if dragIndex < dropIndex, decrement by 1
        // because the removed element shifts indices above it down.
        let target = dropIndex;
        if (target > dragIndex) target -= 1;
        if (target !== dragIndex) {
          const next = items.slice();
          const [moved] = next.splice(dragIndex, 1);
          next.splice(target, 0, moved!);
          onReorder(next);
        }
      }
      setDragIndex(null);
      setDropIndex(null);
      startRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragIndex, dropIndex, findInsertionIndex, items, onReorder, threshold]);

  const makeHandleProps = useCallback(
    (index: number): DragHandleProps => ({
      "data-drag-handle": true,
      onPointerDown: (e) => {
        // Only start on primary button; don't swallow text-selection.
        if (e.button !== 0) return;
        startRef.current = { x: e.clientX, y: e.clientY, index };
        setDragIndex(index);
        setDropIndex(index);
        // Prevent text selection during drag.
        e.preventDefault();
      },
    }),
    [],
  );

  return (
    <ol ref={listRef} className="flex flex-col gap-2">
      {/*
        react-hooks/refs flags this map because `makeHandleProps(i)` —
        invoked during render — returns a closure that touches `startRef`
        (only inside the onPointerDown handler, never during render).
        The runtime behavior is pure; the rule is conservative about
        render-prop closures it can't inspect into. Suppression is
        scoped to this one return.
      */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {items.map((item, i) => {
        const active = dragIndex === i;
        const showIndicator = dragIndex !== null && dropIndex === i;
        return (
          <li
            key={keyOf(item, i)}
            data-drag-row
            data-drag-index={i}
            className={`relative ${active ? "opacity-60" : ""}`}
          >
            {showIndicator ? (
              <div
                aria-hidden
                className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-zinc-900"
              />
            ) : null}
            {children(item, i, makeHandleProps(i))}
          </li>
        );
      })}
      {/* Tail indicator — drop past the last row. */}
      {dragIndex !== null && dropIndex === items.length ? (
        <li data-drag-tail aria-hidden className="h-0.5 rounded-full bg-zinc-900" />
      ) : null}
    </ol>
  );
}
