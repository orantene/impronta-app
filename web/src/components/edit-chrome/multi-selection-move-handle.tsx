"use client";

import { useEffect, useRef, useState } from "react";
import { Move } from "lucide-react";

import {
  parseTranslateValue,
  type TranslateDelta,
} from "./multi-node-layout";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GRID = 8;

export function MultiSelectionMoveHandle({
  rect,
  nodeIds,
  getElement,
  onCommitDeltas,
}: {
  rect: Rect;
  nodeIds: ReadonlyArray<string>;
  getElement: (nodeId: string) => HTMLElement | null;
  onCommitDeltas: (deltas: Record<string, TranslateDelta>) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [liveDelta, setLiveDelta] = useState<TranslateDelta>({ x: 0, y: 0 });
  const startRef = useRef<{
    x: number;
    y: number;
    nodes: Array<{ id: string; el: HTMLElement; start: TranslateDelta }>;
  } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      // ⌘ = free (shared modifier convention across the handle set).
      const snap = (value: number) =>
        event.metaKey || event.ctrlKey
          ? Math.round(value)
          : Math.round(value / GRID) * GRID;
      const dx = snap(event.clientX - start.x);
      const dy = snap(event.clientY - start.y);
      setLiveDelta({ x: dx, y: dy });
      for (const item of start.nodes) {
        item.el.style.translate = `${Math.round(item.start.x + dx)}px ${Math.round(
          item.start.y + dy,
        )}px`;
      }
    };
    const onUp = () => {
      const delta = liveDelta;
      setDragging(false);
      if (Math.round(delta.x) !== 0 || Math.round(delta.y) !== 0) {
        onCommitDeltas(
          Object.fromEntries(nodeIds.map((id) => [id, delta])) as Record<
            string,
            TranslateDelta
          >,
        );
      }
      setLiveDelta({ x: 0, y: 0 });
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveDelta, nodeIds, onCommitDeltas]);

  function begin(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const nodes = nodeIds.flatMap((id) => {
      const el = getElement(id);
      if (!el) return [];
      return [
        {
          id,
          el,
          start: parseTranslateValue(getComputedStyle(el).translate),
        },
      ];
    });
    if (nodes.length === 0) return;
    startRef.current = { x: event.clientX, y: event.clientY, nodes };
    setLiveDelta({ x: 0, y: 0 });
    setDragging(true);
  }

  return (
    <div
      aria-hidden
      data-multi-selection-move-overlay=""
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        zIndex: 97,
      }}
    >
      <button
        type="button"
        aria-label="Move selected blocks"
        title="Move selected blocks"
        data-multi-selection-move-handle=""
        onPointerDown={begin}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 28,
          height: 28,
          borderRadius: 7,
          background: dragging ? "#2f4678" : "rgba(47,70,120,0.72)",
          border: "2px solid #ffffff",
          boxShadow: dragging
            ? "0 0 0 4px rgba(47,70,120,0.20), 0 2px 8px rgba(0,0,0,0.35)"
            : "0 1px 5px rgba(0,0,0,0.28)",
          cursor: "move",
          pointerEvents: "auto",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
        }}
      >
        <Move size={14} aria-hidden color="#ffffff" />
      </button>
      {dragging ? (
        <span
          style={{
            position: "absolute",
            top: "calc(50% + 20px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "2px 6px",
            borderRadius: 5,
            background: "#2f4678",
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
          }}
        >
          {`move ${Math.round(liveDelta.x)}, ${Math.round(liveDelta.y)}`}
        </span>
      ) : null}
    </div>
  );
}
