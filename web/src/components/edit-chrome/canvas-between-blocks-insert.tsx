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
import { CHROME } from "./kit/tokens";
import {
  MENU_EYEBROW_COLOR,
  MENU_HOVER_FILL,
  MENU_SURFACE_ELEVATED_STYLE,
  MENU_SURFACE_STYLE,
} from "./kit/menu-surface";
import { collectPageBlockBoundaries } from "./page-block-dom";
import {
  hoverGapAttributionProps,
  pageGapKey,
  resolveHoveredGapKey,
} from "./canvas-hover-attribution";
import { BuilderCoachmarkTip } from "./builder-coachmark-tip";
import { CANVAS_GESTURE_COACHMARK_SEQUENCE } from "./builder-coachmarks";

// Visual constants — derive from the shared light menu kit so this surface
// stays identical to the selection-layer menus without coupling the file.
// (2026-08-15: was a bespoke dark-navy gradient; unified on the light
// control language via `kit/menu-surface`.)
const CHIP_BG = MENU_SURFACE_STYLE.background as string;
const CHIP_SHADOW = MENU_SURFACE_ELEVATED_STYLE.boxShadow as string;
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
  const blockGaps = collectPageBlockBoundaries();
  if (blockGaps.length > 0) {
    return blockGaps.map((gap) => ({
      y: gap.y,
      insertIndex: gap.insertIndex,
      left: gap.left,
      width: gap.width,
    }));
  }
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
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      // OUR OWN chrome first (see canvas-hover-attribution.ts). This indicator
      // is painted in the selection layer's [data-edit-overlay] root, so the
      // bail below used to catch the "+ Add block" pill itself: reaching for it
      // cleared the gap, which unmounted the pill, which put the pointer back
      // on the block, which re-matched the seam and remounted the pill. The
      // owner saw that loop as the pill blinking on and off, exactly like the
      // drag grip did before #1189. The affordance declares the seam it belongs
      // to, so hovering it is hovering the seam and nothing changes.
      if (resolveHoveredGapKey(hit) !== null) return;
      // Skip pointer events over any OTHER edit-chrome overlay.
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
          {...hoverGapAttributionProps(pageGapKey(gap.insertIndex))}
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
          {/* Pill button — wider pointer area than the 2px line.
           *  CANVAS-3: plus-line-insert coachmark anchor (sequences last,
           *  after double-click-edit and move-grip are both dismissed). */}
          <BuilderCoachmarkTip
            id="plus-line-insert"
            message="Hover between blocks and click + to insert a new block here."
            placement="above"
            sequence={CANVAS_GESTURE_COACHMARK_SEQUENCE}
            wrapperStyle={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <button
              type="button"
              aria-label="Add block here"
              data-canvas-between-blocks-trigger=""
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                background: CHIP_BG,
                color: CHROME.text,
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
              // Open on CLICK, not mousedown. Opening on mousedown tore the
              // button out from under the cursor mid-gesture — clearing
              // `hoveredGap` unmounts this very button, and the picker's
              // full-viewport backdrop mounts in the same tick — so the
              // mouseup landed on whatever was underneath and the canvas
              // handled the tail of the gesture instead (it could end up
              // reordering blocks). mousedown now ONLY stops the canvas from
              // arming a drag; activation happens on click, which also makes
              // the control keyboard-operable.
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
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
          </BuilderCoachmarkTip>
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
      {...hoverGapAttributionProps(pageGapKey(gap.insertIndex))}
      className="edit-anim-pop"
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
        background: CHIP_BG,
        color: CHROME.text,
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
            color: MENU_EYEBROW_COLOR,
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
            color: CHROME.muted,
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            fontSize: 14,
            lineHeight: "1",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              MENU_HOVER_FILL;
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
