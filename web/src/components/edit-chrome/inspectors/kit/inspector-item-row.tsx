"use client";

/**
 * InspectorItemRow — reorderable row surface for inspector item lists.
 *
 * Row layout, left → right:
 *   [drag handle]  [thumbnail / glyph]  [primary content slot]  [trailing action]
 *
 * Used by category_grid items, featured_talent picked list, and (next pass)
 * testimonials_trio, gallery_strip. The drag handle comes from DraggableList
 * — it handles its own pointer events and passes `handleProps` down.
 *
 * The row is intentionally chromed to feel like a content card, not a form
 * row: subtle border, inset hover, and a thumb slot that can accept an
 * image, icon, or initials glyph.
 */

import type { ReactNode } from "react";

import type { DragHandleProps } from "./draggable-list";

interface InspectorItemRowProps {
  /** Handle props emitted by DraggableList. Omit for non-reorderable rows. */
  handleProps?: DragHandleProps;
  /** Tile-style thumb shown on the far left. Use image, icon, or glyph. */
  thumb?: ReactNode;
  /** Main content — usually an inline input or a label + small helper. */
  children: ReactNode;
  /** Trailing control (delete, more actions). */
  trailing?: ReactNode;
  /** Extra class on the wrapper. */
  className?: string;
}

export function InspectorItemRow({
  handleProps,
  thumb,
  children,
  trailing,
  className,
}: InspectorItemRowProps) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-2 py-2 transition hover:border-zinc-300 ${className ?? ""}`}
    >
      {handleProps ? (
        <button
          type="button"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          {...handleProps}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center text-zinc-300 transition hover:text-zinc-600 active:cursor-grabbing"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
      ) : null}

      {thumb ? (
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
          {thumb}
        </div>
      ) : null}

      <div className="min-w-0 flex-1">{children}</div>

      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

/**
 * Trash button — the canonical trailing action for item rows.
 */
export function InspectorRowDelete({
  onClick,
  ariaLabel = "Remove",
}: {
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
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
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
