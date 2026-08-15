"use client";

/**
 * SlashCommandMenu — the floating "/" insert popover, 2026 Notion/Framer
 * style. Purely presentational: it renders `entries` (already filtered +
 * sorted by `slash-command-catalog.ts`) at a fixed viewport position and
 * reports hover/commit/close back to the caller. Two callers share it —
 * `SlashCommandPlugin.tsx` (anchored at the text caret while typing) and
 * `slash-command-canvas-trigger.tsx` (anchored to the selected block when
 * not in text-edit mode) — so the menu itself has no opinion about Lexical
 * or which trigger opened it.
 *
 * Same dark chip chrome as `CanvasBetweenBlocksInsert`'s popover (the
 * canvas's other "insert a block here" surface) so the two read as one
 * family of controls.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SlashCommandEntry } from "./slash-command-catalog";
import { useEditorLocale } from "./use-editor-locale";

const CHIP_BG =
  "linear-gradient(180deg, rgba(44,50,76,0.97) 0%, rgba(30,36,59,0.97) 100%)";
const CHIP_SHADOW =
  "0 12px 32px -8px rgba(0,0,0,0.38), 0 2px 6px -2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)";
const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 280;

export interface SlashCommandMenuProps {
  anchorRect: { top: number; bottom: number; left: number } | null;
  query: string;
  entries: ReadonlyArray<SlashCommandEntry>;
  activeIndex: number;
  onHover: (index: number) => void;
  onCommit: (entry: SlashCommandEntry) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  anchorRect,
  query,
  entries,
  activeIndex,
  onHover,
  onCommit,
  onClose,
}: SlashCommandMenuProps) {
  const { t } = useEditorLocale();
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-slash-row-idx="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Dismiss on outside click — Escape is owned by the trigger (Lexical
  // command / canvas keydown listener) so it can decide what "close" means
  // (leave the literal "/" text vs. just closing a block-anchored menu).
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (listRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [onClose]);

  const [placement, setPlacement] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect) {
      setPlacement(null);
      return;
    }
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const left = Math.max(8, Math.min(anchorRect.left, viewportW - MENU_WIDTH - 8));
    const spaceBelow = viewportH - anchorRect.bottom - 12;
    const openBelow = spaceBelow >= 160 || spaceBelow >= anchorRect.top - 12;
    setPlacement(
      openBelow
        ? { top: Math.min(anchorRect.bottom + 6, viewportH - MENU_MAX_HEIGHT - 8), left }
        : { bottom: viewportH - anchorRect.top + 6, left },
    );
  }, [anchorRect]);

  if (!anchorRect || !placement) return null;

  return createPortal(
    <div
      ref={listRef}
      data-edit-overlay="slash-command-menu"
      role="listbox"
      aria-label={t("Insert block")}
      className="edit-anim-pop"
      style={{
        position: "fixed",
        top: placement.top,
        bottom: placement.bottom,
        left: placement.left,
        width: MENU_WIDTH,
        maxHeight: MENU_MAX_HEIGHT,
        overflowY: "auto",
        padding: 5,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.09)",
        background: CHIP_BG,
        color: "white",
        boxShadow: CHIP_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 130,
        pointerEvents: "auto",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {entries.length === 0 ? (
        <div
          style={{
            padding: "10px 9px",
            fontSize: 11.5,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {query.trim()
            ? t("No blocks match “{query}”").replace("{query}", query)
            : t("Type to search blocks…")}
        </div>
      ) : (
        entries.map((entry, idx) => (
          <button
            key={entry.id}
            type="button"
            data-slash-row-idx={idx}
            role="option"
            aria-selected={idx === activeIndex}
            onMouseEnter={() => onHover(idx)}
            onClick={() => onCommit(entry)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 9px",
              borderRadius: 6,
              border: "none",
              background:
                idx === activeIndex ? "rgba(255,255,255,0.14)" : "transparent",
              color: "rgba(255,255,255,0.94)",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {entry.pickKind === "savedBlock" ? entry.label : t(entry.label)}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
