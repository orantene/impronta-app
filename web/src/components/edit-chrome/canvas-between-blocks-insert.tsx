"use client";

/**
 * CanvasBetweenBlocksInsert — inline "+ between blocks" affordance.
 *
 * Job #20 (Wave 1D). Shows a thin horizontal add-line between adjacent
 * [data-cms-section] siblings when the operator hovers the canvas gap area.
 * Clicking the line opens an ElementLibraryInsertPicker flyout positioned
 * near the click point; picking a kind routes through `insertBuilderNode`
 * (null parent = root-level insert at the computed index), giving full undo/
 * redo parity with the Navigator's "Add block" and the chip's "Add" button.
 *
 * Design decisions:
 *  - Thin line (2 px) with a centred pill "+ Add block" label. Appears only
 *    in the hover band (±20px) around the section boundary. Same CHIP_BG /
 *    CHIP_SHADOW tokens as the selection chip (CanvasNodeInsertMenu analog).
 *  - Renders as a direct child of the portal's pointer-events-none wrapper;
 *    interactive elements use `pointerEvents: "auto"` inline (same pattern as
 *    the hover rail, selection chip, and all other canvas overlays).
 *  - Suppressed during any drag phase, preview mode, and mobile/tablet (caller
 *    gates via isDragging / isPreviewing props).
 *
 * Analog: `CanvasNodeInsertMenu` in selection-layer.tsx (same picker, same
 * insert path, triggered from the chip toolbar's "Add" button).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import { ElementLibraryInsertPicker } from "./element-library-insert-picker";

// Visual constants — mirror selection-layer.tsx chip tokens exactly so the
// two surfaces look identical without coupling the file.
const CHIP_BG =
  "linear-gradient(180deg, rgba(44,50,76,0.97) 0%, rgba(30,36,59,0.97) 100%)";
const CHIP_SHADOW =
  "0 12px 32px -8px rgba(0,0,0,0.38), 0 2px 6px -2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)";
const CANVAS_CHROME_RADIUS = 8;

/** Half-height of the hover band around the section boundary, in pixels. */
const GAP_BAND_HALF = 20;

interface GapTarget {
  /** Screen-space Y of the boundary between two sections. */
  y: number;
  /**
   * Root-level builderTree index to pass as `index` to insertBuilderNode.
   * Inserts AFTER section at (insertIndex - 1), i.e. before section at insertIndex.
   */
  insertIndex: number;
  /** Horizontal bounds of the containing canvas column for indicator width. */
  left: number;
  width: number;
}

interface PickerTarget {
  gap: GapTarget;
  /** Screen-space cursor X, for initial popover placement. */
  pointerX: number;
}

function collectSectionBoundaries(): GapTarget[] {
  if (typeof document === "undefined") return [];
  const els = Array.from(
    document.querySelectorAll<HTMLElement>("[data-cms-section]"),
  );
  if (els.length < 2) return [];
  const gaps: GapTarget[] = [];
  for (let i = 0; i < els.length - 1; i++) {
    const aRect = els[i]!.getBoundingClientRect();
    const bRect = els[i + 1]!.getBoundingClientRect();
    const boundary = (aRect.bottom + bRect.top) / 2;
    gaps.push({
      y: boundary,
      insertIndex: i + 1,
      left: aRect.left,
      width: aRect.width,
    });
  }
  return gaps;
}

function findGapAtPointer(y: number): GapTarget | null {
  for (const gap of collectSectionBoundaries()) {
    if (Math.abs(y - gap.y) <= GAP_BAND_HALF) return gap;
  }
  return null;
}

export function CanvasBetweenBlocksInsert({
  advancedElementLibraryEnabled,
  canInsertRawHtmlElements,
  isDragging,
  isPreviewing,
  onInsert,
  onInsertSectionEmbed,
}: {
  advancedElementLibraryEnabled: boolean;
  canInsertRawHtmlElements: boolean;
  isDragging: boolean;
  isPreviewing: boolean;
  onInsert: (kind: BuilderNodeKind, index: number) => Promise<void>;
  onInsertSectionEmbed: (sectionTypeKey: string, index: number) => Promise<void>;
}) {
  const [hoveredGap, setHoveredGap] = useState<GapTarget | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  // Suppress the hover indicator briefly after the picker is dismissed so
  // the operator's pointer doesn't immediately re-trigger it.
  const suppressRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setPickerTarget(null);
    suppressRef.current = true;
    if (suppressTimerRef.current !== null) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressRef.current = false;
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current !== null) clearTimeout(suppressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isDragging || isPreviewing) {
      setHoveredGap(null);
      return undefined;
    }

    function handleMove(e: MouseEvent) {
      if (pickerTarget || suppressRef.current) {
        setHoveredGap(null);
        return;
      }
      // Skip pointer events over edit-chrome overlays.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit?.closest("[data-edit-overlay]")) {
        setHoveredGap(null);
        return;
      }
      setHoveredGap(findGapAtPointer(e.clientY));
    }

    function handleLeave() {
      setHoveredGap(null);
    }

    document.addEventListener("mousemove", handleMove, { passive: true });
    document.addEventListener("mouseleave", handleLeave, { passive: true });
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseleave", handleLeave);
    };
  }, [isDragging, isPreviewing, pickerTarget]);

  // Resolve allowed kinds at root level — same gate as the navigator's root add.
  const rootAllowedKinds = gateNestedInsertKinds(
    Object.keys(BUILDER_NODE_REGISTRY) as BuilderNodeKind[],
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
  );

  const commitInsert = useCallback(
    async (kind: BuilderNodeKind) => {
      if (!pickerTarget) return;
      const idx = pickerTarget.gap.insertIndex;
      setPickerTarget(null);
      await onInsert(kind, idx);
    },
    [pickerTarget, onInsert],
  );

  const commitInsertSectionEmbed = useCallback(
    async (sectionTypeKey: string) => {
      if (!pickerTarget) return;
      const idx = pickerTarget.gap.insertIndex;
      setPickerTarget(null);
      await onInsertSectionEmbed(sectionTypeKey, idx);
    },
    [pickerTarget, onInsertSectionEmbed],
  );

  const gap = hoveredGap;

  return (
    <>
      {/* Hover line indicator — 2px line + clickable pill centred in the gap */}
      {gap && !pickerTarget ? (
        <div
          data-canvas-between-blocks-indicator=""
          style={{
            position: "fixed",
            top: gap.y - 1,
            left: gap.left,
            width: gap.width,
            height: 2,
            pointerEvents: "none",
            zIndex: 87,
          }}
        >
          {/* Gradient line */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(44,95,219,0.35) 15%, rgba(44,95,219,0.6) 50%, rgba(44,95,219,0.35) 85%, transparent 100%)",
              borderRadius: 1,
            }}
          />
          {/* Pill button — wider pointer area than the 2px line */}
          <button
            type="button"
            aria-label="Add block here"
            data-canvas-between-blocks-trigger=""
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              background: CHIP_BG,
              color: "rgba(255,255,255,0.92)",
              border: "none",
              borderRadius: 14,
              boxShadow: CHIP_SHADOW,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              pointerEvents: "auto",
              fontFamily:
                'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setHoveredGap(null);
              setPickerTarget({ gap, pointerX: e.clientX });
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add block
          </button>
        </div>
      ) : null}

      {/* Click-outside backdrop */}
      {pickerTarget ? (
        <div
          data-canvas-between-blocks-backdrop=""
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            pointerEvents: "auto",
          }}
          onMouseDown={() => dismiss()}
        />
      ) : null}

      {/* Picker popover */}
      {pickerTarget ? (
        <BetweenBlocksPickerPopover
          pickerTarget={pickerTarget}
          allowedKinds={rootAllowedKinds}
          onInsert={commitInsert}
          onInsertSectionEmbed={commitInsertSectionEmbed}
          onDismiss={dismiss}
        />
      ) : null}
    </>
  );
}

function BetweenBlocksPickerPopover({
  pickerTarget,
  allowedKinds,
  onInsert,
  onInsertSectionEmbed,
  onDismiss,
}: {
  pickerTarget: PickerTarget;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  onInsert: (kind: BuilderNodeKind) => Promise<void>;
  onInsertSectionEmbed: (sectionTypeKey: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const POPOVER_WIDTH = 248;
  const POPOVER_MAX_HEIGHT = 320;
  const viewportH = typeof window === "undefined" ? 800 : window.innerHeight;
  const viewportW = typeof window === "undefined" ? 1280 : window.innerWidth;

  const { gap, pointerX } = pickerTarget;

  const rawLeft = pointerX - POPOVER_WIDTH / 2;
  const left = Math.max(8, Math.min(rawLeft, viewportW - POPOVER_WIDTH - 8));
  const spaceBelow = viewportH - gap.y - 12;
  const spaceAbove = gap.y - 12;
  const openBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
  const top = openBelow
    ? Math.min(gap.y + 10, viewportH - POPOVER_MAX_HEIGHT - 8)
    : undefined;
  const bottom = openBelow ? undefined : viewportH - gap.y + 10;

  return (
    <div
      data-canvas-between-blocks-picker=""
      style={{
        position: "fixed",
        top,
        bottom,
        left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        overflowY: "auto",
        padding: "10px 10px 11px",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "1px solid rgba(255,255,255,0.09)",
        background: CHIP_BG,
        color: "white",
        boxShadow: CHIP_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 91,
        pointerEvents: "auto",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Insert block here
        </div>
        <button
          type="button"
          aria-label="Close insert menu"
          onClick={onDismiss}
          style={{
            width: 18,
            height: 18,
            border: "none",
            borderRadius: CANVAS_CHROME_RADIUS,
            background: "transparent",
            color: "rgba(255,255,255,0.72)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            fontSize: 14,
            lineHeight: "1",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "rgba(255,255,255,0.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          ×
        </button>
      </div>
      <ElementLibraryInsertPicker
        variant="canvas"
        allowedKinds={allowedKinds}
        onPick={(kind) => void onInsert(kind)}
        onPickSectionEmbed={(key) => void onInsertSectionEmbed(key)}
      />
    </div>
  );
}
