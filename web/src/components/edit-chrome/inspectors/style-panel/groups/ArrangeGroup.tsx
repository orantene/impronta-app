"use client";

/**
 * ArrangeGroup — "how do the things inside this box line up".
 *
 * Justify / align / wrap already existed, but only inside `PositionLayoutSection`
 * under the **Advanced** disclosure, behind spec names ("Main axis (justify)").
 * Centring a header row — the single most common thing anyone does to a header —
 * therefore meant opening a group whose whole purpose is to hold the fields a
 * non-technical operator should never need. That is backwards, so the same
 * writes get a plain-language home in the normal flow.
 *
 * This is DELIBERATELY additive, not a move: Advanced keeps the raw controls.
 * A preset surface is never a ceiling — an operator who learned the CSS names
 * keeps them, and nothing that pointed at those controls breaks.
 *
 * It renders as a BODY inside "Layout & spacing" rather than a group of its
 * own: D4 caps how many groups a kind may render (a guard test enforces it),
 * and arrangement is a layout decision anyway — the same reasoning that
 * re-homed Align there. `ARRANGE_KINDS` gates it to kinds that lay out
 * children; on a heading these three controls would be inert.
 */

import { CHROME } from "../../../kit/tokens";
import { GlyphTiles, type GlyphTileOption } from "../../field-kit/glyph-tiles";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

// ── Glyphs ───────────────────────────────────────────────────────────────────
// Three bars in a frame, positioned to SHOW the arrangement rather than name it.
// Pure inline SVG in currentColor, matching the field-kit tile contract.

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 32 20" className="h-5 w-8" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="19"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
      />
      {children}
    </svg>
  );
}

function Bars({ xs, y = 6, h = 8 }: { xs: number[]; y?: number; h?: number }) {
  return (
    <>
      {xs.map((x) => (
        <rect key={x} x={x} y={y} width="4" height={h} rx="1" fill="currentColor" />
      ))}
    </>
  );
}

const JUSTIFY_OPTIONS: GlyphTileOption[] = [
  { id: "flex-start", label: "Start", glyph: () => <Frame><Bars xs={[3, 9, 15]} /></Frame> },
  { id: "center", label: "Center", glyph: () => <Frame><Bars xs={[9, 15, 21]} /></Frame> },
  { id: "flex-end", label: "End", glyph: () => <Frame><Bars xs={[15, 21, 27]} /></Frame> },
  { id: "space-between", label: "Spread", glyph: () => <Frame><Bars xs={[3, 15, 27]} /></Frame> },
];

const ALIGN_OPTIONS: GlyphTileOption[] = [
  { id: "flex-start", label: "Top", glyph: () => <Frame><Bars xs={[9, 15, 21]} y={3} h={6} /></Frame> },
  { id: "center", label: "Middle", glyph: () => <Frame><Bars xs={[9, 15, 21]} y={7} h={6} /></Frame> },
  { id: "flex-end", label: "Bottom", glyph: () => <Frame><Bars xs={[9, 15, 21]} y={11} h={6} /></Frame> },
  { id: "stretch", label: "Fill", glyph: () => <Frame><Bars xs={[9, 15, 21]} y={3} h={14} /></Frame> },
];

const WRAP_OPTIONS: GlyphTileOption[] = [
  {
    id: "nowrap",
    label: "One line",
    glyph: () => <Frame><Bars xs={[3, 9, 15, 21, 27]} y={7} h={6} /></Frame>,
  },
  {
    id: "wrap",
    label: "Let it wrap",
    glyph: () => (
      <Frame>
        <Bars xs={[3, 9, 15]} y={3} h={6} />
        <Bars xs={[3, 9]} y={11} h={6} />
      </Frame>
    ),
  },
];

// ── Group ────────────────────────────────────────────────────────────────────

export interface ArrangeBodyProps {
  selectedStandaloneViewportStyle: BuilderNodeStyleValue | undefined;
  patchSelectedStandaloneStyle: (patch: Partial<BuilderNodeStyleValue>) => void;
}

export function ArrangeBody({
  selectedStandaloneViewportStyle,
  patchSelectedStandaloneStyle,
}: ArrangeBodyProps) {
  const style = selectedStandaloneViewportStyle;

  return (
      <div className="flex flex-col gap-3" data-builder-node-style-control="arrange">
        <span className="text-[11px]" style={{ color: CHROME.muted }}>
          How the things inside this box sit next to each other.
        </span>

        <GlyphTiles
          label="Across"
          columns={4}
          value={style?.justifyContent ?? ""}
          options={JUSTIFY_OPTIONS}
          onChange={(next) =>
            patchSelectedStandaloneStyle({
              justifyContent: (next ||
                undefined) as BuilderNodeStyleValue["justifyContent"],
            })
          }
        />

        <GlyphTiles
          label="Down"
          columns={4}
          value={style?.alignItems ?? ""}
          options={ALIGN_OPTIONS}
          onChange={(next) =>
            patchSelectedStandaloneStyle({
              alignItems: (next || undefined) as BuilderNodeStyleValue["alignItems"],
            })
          }
        />

        <GlyphTiles
          label="When it runs out of room"
          columns={2}
          value={style?.flexWrap ?? ""}
          options={WRAP_OPTIONS}
          onChange={(next) =>
            patchSelectedStandaloneStyle({
              flexWrap: (next || undefined) as BuilderNodeStyleValue["flexWrap"],
            })
          }
        />
      </div>
  );
}
