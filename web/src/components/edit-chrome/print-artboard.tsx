"use client";

/**
 * PrintArtboard — Piece B slice 1c. Wraps the print canvas in a FIXED physical
 * artboard and draws the persistent trim + safe-area guide.
 *
 * Ruled model (2) in `docs/plans/print-canvas-design.md`: the canvas IS
 * bleed-size (the designer works past the trim line, so a full-bleed background
 * has somewhere to bleed to), and a trim guide sits on top showing where the
 * guillotine lands. That is the honest model — the mistake (art that stops at
 * the trim line) is visible while designing, not discovered in a cut batch.
 *
 * Sizing uses CSS `mm` units directly, so the artboard is physically correct at
 * 100% zoom; `canvas-viewport`'s zoom transform scales it from there. Bleed and
 * safe margins are drawn as NON-INTERACTIVE overlays (pointer-events: none) so
 * they never intercept a drag — unlike the transient align guides, these are
 * persistent whenever the print artboard is active.
 */

import type { CSSProperties, ReactNode } from "react";

/** Content kept this far inside the trim line stays clear of the cut. A
 *  conventional print safe margin; not size-dependent in v1. */
const SAFE_MARGIN_MM = 4;

export interface PrintArtboardProps {
  /** Fixed artboard, from `print_designs.size` (bleed included separately). */
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  /** The editable canvas. */
  children: ReactNode;
}

export function PrintArtboard({
  widthMm,
  heightMm,
  bleedMm,
  children,
}: PrintArtboardProps) {
  // Bleed-size board: the designer's working surface extends `bleedMm` past the
  // trim on every side.
  const boardW = `${widthMm + bleedMm * 2}mm`;
  const boardH = `${heightMm + bleedMm * 2}mm`;

  const board: CSSProperties = {
    position: "relative",
    width: boardW,
    height: boardH,
    // A white ground so the piece reads as paper against the editor chrome; a
    // full-bleed background block in the tree paints over it.
    background: "#ffffff",
    boxShadow: "0 1px 8px rgba(0,0,0,0.18)",
    // The board is the positioning context; the canvas content fills it.
    flexShrink: 0,
  };

  // Trim line — where the cut lands, inset from the bleed edge by `bleedMm`.
  const trim: CSSProperties = {
    position: "absolute",
    inset: `${bleedMm}mm`,
    border: "1px solid rgba(0,0,0,0.55)",
    pointerEvents: "none",
    zIndex: 2,
  };

  // Safe area — keep text/logo inside this dashed inner margin.
  const safe: CSSProperties = {
    position: "absolute",
    inset: `${bleedMm + SAFE_MARGIN_MM}mm`,
    border: "1px dashed rgba(0,0,0,0.28)",
    pointerEvents: "none",
    zIndex: 2,
  };

  return (
    <div
      data-print-artboard
      // Centre the fixed board in the (larger, scrollable) canvas region with a
      // little breathing room around the bleed edge.
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "24px",
        minHeight: "100%",
      }}
    >
      <div data-print-artboard-board style={board}>
        {/* The editable canvas fills the whole bleed-size board. */}
        <div
          data-print-artboard-content
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        >
          {children}
        </div>
        <div data-print-trim-guide style={trim} aria-hidden />
        <div data-print-safe-guide style={safe} aria-hidden />
      </div>
    </div>
  );
}
