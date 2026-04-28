"use client";

/**
 * SelectionLayer — hover + click + overlay rings on [data-cms-section] DOM.
 *
 * Mount inside EditShell. While mounted:
 *   - Any pointer move over the document that resolves to a [data-cms-section]
 *     element updates the "hover" outline. Leaving the section clears it.
 *   - A click on a section element intercepts link navigation (preventDefault
 *     on the `<a>` ancestor if the section tree contains one) and promotes it
 *     to `selectedSectionId`. Clicks outside any section are ignored — the
 *     current selection stays until the editor picks another.
 *   - Escape clears the selection.
 *   - On scroll / resize / selection change we rAF-throttle a rect recompute
 *     so the rings track layout changes without jank.
 *
 * The rings render through a portal into #edit-overlay-portal (a fixed
 * pointer-events:none layer EditShell already mounts). Ring positions are
 * viewport coordinates (getBoundingClientRect), matching the portal's fixed
 * coordinate space.
 *
 * Visual treatment matches mockup surfaces 2, 3, 9, 17:
 *   - Dual-tone ring: white inset 1px + ink outset 2px + halo 8px
 *   - Premium chip: 34px height, 10px radius, dark gradient, grip dots +
 *     section-type icon + name + type divider + toolbar
 *   - Drop indicator: blue gradient line + end-cap glow dots
 *   - Drag ghost: substantial dark card with icon + name + dynamic state
 *   - Source section while dragging: desaturate filter + dashed ring + 0.4 opacity
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { useEditContext } from "./edit-context";
import { SectionTypeIcon } from "./kit/section-type-icon";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findSectionEl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-cms-section]");
  return el;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Design tokens (from mockup --select-* variables) ──────────────────────
// White inset + ink outset + soft halo. Same values as the spec's
// `.ring-selected` and `.ring-hover` CSS classes.
const SELECT_OUTER = "rgba(11,11,13,0.95)";
const SELECT_HALO = "rgba(11,11,13,0.10)";
const SELECT_INSET = "rgba(255,255,255,0.70)";
const HOVER_INSET = "rgba(255,255,255,0.40)";
const HOVER_STROKE = "rgba(11,11,13,0.45)";

// Blue (#2c5fdb) used only for drop indicators — matches mockup var(--blue)
// end-cap dots use the 58,123,255 lighter shade for the glow.
const BLUE = "#2c5fdb";
const BLUE_RGB = "58,123,255";

// Chip gradient matches mockup `.chip` background.
const CHIP_BG =
  "linear-gradient(180deg, rgba(24,24,27,0.97), rgba(11,11,13,0.97))";
const CHIP_SHADOW =
  "0 12px 32px -8px rgba(0,0,0,0.45), 0 2px 6px -2px rgba(0,0,0,0.20), inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.18)";

interface DropTarget {
  slotKey: string;
  /** Index in the slot's section list the source will end at AFTER the move. */
  sortOrder: number;
  /** True when the cursor is over a slot that accepts the source section type. */
  allowed: boolean;
  /** Screen-space y where we'll draw the drop indicator line. */
  indicatorY: number;
  indicatorLeft: number;
  indicatorWidth: number;
}

type DragState =
  | { phase: "idle" }
  | {
      phase: "armed";
      id: string;
      slot: string;
      sortOrder: number;
      typeKey: string | null;
      name: string | null;
      pointerId: number;
      startX: number;
      startY: number;
      sourceRect: Rect;
    }
  | {
      phase: "dragging";
      id: string;
      slot: string;
      sortOrder: number;
      typeKey: string | null;
      name: string | null;
      pointerId: number;
      pointerX: number;
      pointerY: number;
      sourceRect: Rect;
      drop: DropTarget | null;
    };

const DRAG_THRESHOLD = 4; // px before an armed drag actually begins
const AUTOSCROLL_BAND = 80; // px edge band that triggers auto-scroll
const AUTOSCROLL_MAX = 14; // px per frame at the edge

export function SelectionLayer() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    hoveredSectionId,
    setHoveredSectionId,
    device,
    moveSection,
    moveSectionTo,
    removeSection,
    duplicateSection,
    saving,
    loadedSection,
    slotDefs,
  } = useEditContext();

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [drag, setDrag] = useState<DragState>({ phase: "idle" });
  const autoscrollRafRef = useRef<number | null>(null);

  const rafRef = useRef<number | null>(null);
  // Scroll-lag fix: suppress the hover-ring's position CSS transition while
  // the window is actively scrolling. Without this, the 80ms linear transition
  // on `top`/`left` makes the ring visually lag behind the element because the
  // transition animates from the pre-scroll position to the post-scroll one.
  // We use a ref (not state) so the transition is disabled synchronously in
  // the rAF callback that already fires on each scroll event — no extra render
  // is needed. The flag is cleared 150 ms after the last scroll event; the
  // transition re-arms naturally on the next pointer-move re-render.
  const isScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById("edit-overlay-portal");
    setPortalEl(el);
  }, []);

  const scheduleRectRecompute = () => {
    // Always cancel any pending frame and queue a fresh one. If we only bail
    // out when a ref is set, a cancelled-but-not-cleared ref (from strict
    // mode's effect double-run, or a missed cleanup path) will deadlock the
    // layer: the ref stays non-null forever and every future schedule call
    // silently returns. Cancel-then-queue is idempotent and safe.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (selectedSectionId) {
        const el = document.querySelector<HTMLElement>(
          `[data-cms-section][data-section-id="${CSS.escape(selectedSectionId)}"]`,
        );
        if (el) {
          setSelectedRect(rectOf(el));
          const typeKey = el.getAttribute("data-section-type-key");
          setSelectedTypeKey(typeKey);
        } else {
          setSelectedRect(null);
          setSelectedTypeKey(null);
        }
      } else {
        setSelectedRect(null);
        setSelectedTypeKey(null);
      }
      if (hoveredSectionId) {
        const el = document.querySelector<HTMLElement>(
          `[data-cms-section][data-section-id="${CSS.escape(hoveredSectionId)}"]`,
        );
        setHoverRect(el ? rectOf(el) : null);
      } else {
        setHoverRect(null);
      }
    });
  };

  useEffect(() => {
    scheduleRectRecompute();
    // Reset the remove confirmation any time selection switches.
    setConfirmRemove(false);
    // selection/hover changes → recompute immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId, hoveredSectionId]);

  useEffect(() => {
    scheduleRectRecompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const el = findSectionEl(e.target);
      const id = el?.getAttribute("data-section-id") ?? null;
      if (id !== hoveredSectionId) setHoveredSectionId(id);
    }
    function onPointerLeave() {
      setHoveredSectionId(null);
    }
    function onClickCapture(e: MouseEvent) {
      // Ignore clicks originating inside the edit chrome (top bar, inspector,
      // overlay controls). Those elements live above the storefront but must
      // remain interactive.
      if (e.target instanceof Element) {
        if (
          e.target.closest("[data-edit-topbar]") ||
          e.target.closest("[data-edit-drawer]") ||
          e.target.closest("[data-edit-overlay]")
        ) {
          return;
        }
      }
      const el = findSectionEl(e.target);
      if (!el) return;
      const id = el.getAttribute("data-section-id");
      if (!id) return;

      // Intercept link/button navigation so editors don't accidentally leave.
      e.preventDefault();
      e.stopPropagation();
      setSelectedSectionId(id);
    }
    function onScrollOrResize() {
      // Mark scrolling active — suppresses hover-ring position transition.
      isScrollingRef.current = true;
      if (scrollEndTimerRef.current !== null) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        scrollEndTimerRef.current = null;
      }, 150);
      scheduleRectRecompute();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedSectionId(null);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    // capture phase so we run before React's synthetic delegation
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
      // Cancelling the frame without also nulling the ref leaves a dangling
      // "request id" that scheduleRectRecompute treats as still-pending,
      // so every future selection silently bails out. React 19 strict mode
      // runs this cleanup on mount, which is how the bug manifested.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (scrollEndTimerRef.current !== null) {
        clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredSectionId]);

  // ── drag-to-reorder ──────────────────────────────────────────────
  // Drop target under the cursor given the current section layout.
  const computeDrop = (
    cursorX: number,
    cursorY: number,
    sourceTypeKey: string | null,
  ): DropTarget | null => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-cms-section][data-section-id][data-slot-key]",
      ),
    );
    if (nodes.length === 0) return null;
    // Flat list of sections with their slot / order / rect.
    const items = nodes
      .map((el) => {
        const id = el.getAttribute("data-section-id")!;
        const slotKey = el.getAttribute("data-slot-key")!;
        const order = Number(el.getAttribute("data-sort-order") ?? "");
        const r = el.getBoundingClientRect();
        return Number.isFinite(order) && id && slotKey
          ? { id, slotKey, order, top: r.top, bottom: r.bottom, left: r.left, width: r.width }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // Find the item whose vertical midpoint is closest to the cursor; cursor
    // in top half → insert before it, bottom half → insert after it.
    let best: (typeof items)[number] | null = null;
    let bestDist = Infinity;
    for (const it of items) {
      const mid = (it.top + it.bottom) / 2;
      const d = Math.abs(cursorY - mid);
      if (d < bestDist) {
        bestDist = d;
        best = it;
      }
    }
    if (!best) return null;
    const mid = (best.top + best.bottom) / 2;
    const insertBefore = cursorY < mid;
    const targetSlot = best.slotKey;
    const siblings = items.filter((it) => it.slotKey === targetSlot);
    const bestSibIdx = siblings.findIndex((s) => s.id === best!.id);
    const sortOrder = insertBefore ? bestSibIdx : bestSibIdx + 1;
    // allowedSectionTypes gating. Same slot as source is always allowed.
    const slotDef = slotDefs.find((s) => s.key === targetSlot);
    const allowed =
      !slotDef ||
      !slotDef.allowedSectionTypes ||
      (sourceTypeKey != null &&
        slotDef.allowedSectionTypes.includes(sourceTypeKey));
    const indicatorY = insertBefore ? best.top : best.bottom;
    return {
      slotKey: targetSlot,
      sortOrder,
      allowed,
      indicatorY,
      indicatorLeft: best.left,
      indicatorWidth: best.width,
    };
  };

  // Global pointer listeners while a drag is armed or active.
  useEffect(() => {
    if (drag.phase === "idle") return;

    function onMove(e: PointerEvent) {
      if (drag.phase === "armed" && e.pointerId === drag.pointerId) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const drop = computeDrop(e.clientX, e.clientY, drag.typeKey);
        setDrag({
          phase: "dragging",
          id: drag.id,
          slot: drag.slot,
          sortOrder: drag.sortOrder,
          typeKey: drag.typeKey,
          name: drag.name,
          pointerId: drag.pointerId,
          pointerX: e.clientX,
          pointerY: e.clientY,
          sourceRect: drag.sourceRect,
          drop,
        });
        return;
      }
      if (drag.phase === "dragging" && e.pointerId === drag.pointerId) {
        const drop = computeDrop(e.clientX, e.clientY, drag.typeKey);
        setDrag({
          ...drag,
          pointerX: e.clientX,
          pointerY: e.clientY,
          drop,
        });
      }
    }

    function onUp(e: PointerEvent) {
      if (drag.phase === "dragging" && e.pointerId === drag.pointerId) {
        const drop = drag.drop;
        // No drop target or invalid → cancel silently (no save round trip).
        if (drop && drop.allowed) {
          const sameSpot =
            drop.slotKey === drag.slot &&
            (drop.sortOrder === drag.sortOrder ||
              drop.sortOrder === drag.sortOrder + 1);
          if (!sameSpot) {
            void moveSectionTo(drag.id, drop.slotKey, drop.sortOrder);
          }
        }
      }
      setDrag({ phase: "idle" });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && drag.phase !== "idle") {
        e.preventDefault();
        setDrag({ phase: "idle" });
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // computeDrop is recreated every render but closes over the current
    // slotDefs/DOM. Re-running this effect on drag/moveSectionTo/slotDefs
    // is sufficient; dropping it in deps would churn listeners every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, moveSectionTo, slotDefs]);

  // Auto-scroll rAF loop: when actively dragging and cursor is in an edge
  // band, scroll the window so the operator can reach any destination
  // without releasing. Ramps linearly from 0 at the edge of the band to
  // AUTOSCROLL_MAX at the viewport edge.
  useEffect(() => {
    if (drag.phase !== "dragging") return;
    let cancelled = false;
    function tick() {
      if (cancelled || drag.phase !== "dragging") return;
      const y = drag.pointerY;
      const vh = window.innerHeight;
      let delta = 0;
      if (y < AUTOSCROLL_BAND) {
        delta = -((AUTOSCROLL_BAND - y) / AUTOSCROLL_BAND) * AUTOSCROLL_MAX;
      } else if (y > vh - AUTOSCROLL_BAND) {
        delta =
          ((y - (vh - AUTOSCROLL_BAND)) / AUTOSCROLL_BAND) * AUTOSCROLL_MAX;
      }
      if (delta !== 0) {
        window.scrollBy(0, delta);
        // Recompute drop under the NEW scroll position even though the
        // cursor hasn't moved — otherwise the drop line freezes on the
        // section that was under the cursor before the page scrolled.
        const fresh = computeDrop(drag.pointerX, drag.pointerY, drag.typeKey);
        if (
          fresh?.slotKey !== drag.drop?.slotKey ||
          fresh?.sortOrder !== drag.drop?.sortOrder ||
          fresh?.indicatorY !== drag.drop?.indicatorY
        ) {
          setDrag({ ...drag, drop: fresh });
        }
      }
      autoscrollRafRef.current = requestAnimationFrame(tick);
    }
    autoscrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (autoscrollRafRef.current !== null) {
        cancelAnimationFrame(autoscrollRafRef.current);
        autoscrollRafRef.current = null;
      }
    };
    // computeDrop is recreated every render but only reads live DOM +
    // slotDefs; re-running this rAF loop on every paint would tear down +
    // re-queue the frame and risk auto-scroll jitter. Depending on `drag`
    // is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!selectedSectionId || !selectedRect) return;
    // Locate source slot + sortOrder from DOM attrs.
    const el = document.querySelector<HTMLElement>(
      `[data-cms-section][data-section-id="${CSS.escape(selectedSectionId)}"]`,
    );
    if (!el) return;
    const slot = el.getAttribute("data-slot-key");
    const order = Number(el.getAttribute("data-sort-order") ?? "");
    if (!slot || !Number.isFinite(order)) return;
    const name =
      loadedSection?.id === selectedSectionId
        ? (loadedSection?.name ?? null)
        : null;
    setDrag({
      phase: "armed",
      id: selectedSectionId,
      slot,
      sortOrder: order,
      typeKey: selectedTypeKey,
      name,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      sourceRect: selectedRect,
    });
  };

  if (!portalEl) return null;

  const showHover =
    hoverRect && hoveredSectionId && hoveredSectionId !== selectedSectionId;

  const isDragging =
    drag.phase === "dragging" && drag.id === selectedSectionId;

  // Derived display values for the chip / ghost.
  // T2-2 — Strip seeder suffixes from raw DB names ("Hero — new (Classic
  // starter) d7b14f") before they reach the operator. Clean string can
  // legitimately be empty (when the raw name was nothing but suffix), so
  // we coalesce through the type's humanized label as a final fallback.
  const cleanedName =
    loadedSection?.id === selectedSectionId && loadedSection?.name
      ? cleanSectionName(loadedSection.name)
      : "";
  const chipLabel = cleanedName || humanizeTypeKey(selectedTypeKey);
  const chipType = humanizeTypeKey(selectedTypeKey);

  return createPortal(
    <div data-edit-overlay className="pointer-events-none absolute inset-0">
      {/* ── Hover ring ────────────────────────────────────────────── */}
      {showHover ? (
        <div
          style={{
            position: "fixed",
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
            borderRadius: 6,
            boxShadow: `inset 0 0 0 1px ${HOVER_INSET}, 0 0 0 1px ${HOVER_STROKE}`,
            pointerEvents: "none",
            // Suppress position transition while scrolling so the ring
            // tracks the element instantly instead of animating over 80ms.
            transition: isScrollingRef.current
              ? "none"
              : "top 80ms linear, left 80ms linear, width 80ms linear, height 80ms linear",
          }}
        />
      ) : null}

      {/* ── Selection ring ────────────────────────────────────────── */}
      {selectedRect ? (
        <>
          <div
            style={{
              position: "fixed",
              top: selectedRect.top,
              left: selectedRect.left,
              width: selectedRect.width,
              height: selectedRect.height,
              borderRadius: 6,
              // Dual-tone: white inset 1px, ink outset 2px, soft outer halo 8px.
              // Uses box-shadow so inset + outset coexist without a second element.
              boxShadow: isDragging
                ? `0 0 0 2px rgba(11,11,13,0.30)`
                : `inset 0 0 0 1px ${SELECT_INSET}, 0 0 0 2px ${SELECT_OUTER}, 0 0 0 8px ${SELECT_HALO}`,
              outline: isDragging
                ? "2px dashed rgba(11,11,13,0.35)"
                : "none",
              outlineOffset: isDragging ? 4 : 0,
              // Source section desaturates while being dragged.
              filter: isDragging ? "grayscale(0.9)" : "none",
              opacity: isDragging ? 0.4 : 1,
              transition:
                "opacity 120ms linear, filter 120ms linear, box-shadow 120ms",
              pointerEvents: "none",
            }}
          />

          {/* ── Premium selection chip ────────────────────────────── */}
          <div
            style={{
              position: "fixed",
              // Pin just above the section (within top-bar boundary).
              top: Math.max(selectedRect.top - 38, 56),
              left: selectedRect.left,
              height: 34,
              display: "inline-flex",
              alignItems: "stretch",
              background: CHIP_BG,
              color: "white",
              borderRadius: 10,
              boxShadow: CHIP_SHADOW,
              backdropFilter: "blur(12px)",
              overflow: "hidden",
              zIndex: 90,
              fontFamily:
                'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
              whiteSpace: "nowrap",
              pointerEvents: "auto",
              opacity: isDragging ? 0 : 1,
              transition: "opacity 120ms linear",
              userSelect: "none",
            }}
          >
            {/* Grip area — drag handle */}
            <div
              onPointerDown={startDrag}
              title="Drag to reorder"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0 14px 0 10px",
                gap: 9,
                cursor: drag.phase === "idle" ? "grab" : "grabbing",
                touchAction: "none",
              }}
            >
              {/* 2×3 grip dot grid */}
              <span style={{ color: "rgba(255,255,255,0.50)", lineHeight: 0 }}>
                <svg
                  width="9"
                  height="14"
                  viewBox="0 0 9 14"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="2" cy="2" r="1" />
                  <circle cx="7" cy="2" r="1" />
                  <circle cx="2" cy="7" r="1" />
                  <circle cx="7" cy="7" r="1" />
                  <circle cx="2" cy="12" r="1" />
                  <circle cx="7" cy="12" r="1" />
                </svg>
              </span>

              {/* Section-type icon tile */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.92)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}
              >
                <SectionTypeIcon typeKey={selectedTypeKey} size={13} />
              </span>

              {/* Section name */}
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                {chipLabel}
              </span>

              {/* Divider + type label */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0,
                }}
              >
                <span
                  style={{
                    width: 1,
                    height: 16,
                    background: "rgba(255,255,255,0.16)",
                    margin: "0 4px",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {chipType}
                </span>
              </span>
            </div>

            {/* Toolbar buttons */}
            <ChipToolBar
              disabled={saving}
              confirmRemove={confirmRemove}
              onMoveUp={() => {
                if (!selectedSectionId) return;
                void moveSection(selectedSectionId, "up");
              }}
              onMoveDown={() => {
                if (!selectedSectionId) return;
                void moveSection(selectedSectionId, "down");
              }}
              onDuplicate={() => {
                if (!selectedSectionId) return;
                void duplicateSection(selectedSectionId).then((res) => {
                  if (res.ok && res.newSectionId) {
                    setSelectedSectionId(res.newSectionId);
                  }
                });
              }}
              onRemoveTrigger={() => setConfirmRemove(true)}
              onRemoveConfirm={() => {
                if (!selectedSectionId) return;
                void removeSection(selectedSectionId).then(() => {
                  setConfirmRemove(false);
                  setSelectedSectionId(null);
                });
              }}
              onRemoveCancel={() => setConfirmRemove(false)}
            />
          </div>
        </>
      ) : null}

      {/* ── Drop indicator ────────────────────────────────────────── */}
      {drag.phase === "dragging" && drag.drop ? (
        <div
          data-edit-overlay="drag-drop-line"
          style={{
            position: "fixed",
            top: drag.drop.indicatorY - 1.5,
            left: drag.drop.indicatorLeft,
            width: drag.drop.indicatorWidth,
            height: 3,
            background: drag.drop.allowed
              ? `linear-gradient(90deg, transparent, ${BLUE}, transparent)`
              : "linear-gradient(90deg, transparent, rgba(239,68,68,0.8), transparent)",
            boxShadow: drag.drop.allowed
              ? `0 0 0 4px rgba(${BLUE_RGB},0.12), 0 0 16px 4px rgba(${BLUE_RGB},0.40)`
              : "0 0 0 4px rgba(239,68,68,0.10), 0 0 16px 4px rgba(239,68,68,0.20)",
            borderRadius: 2,
            transition:
              "top 80ms linear, left 80ms linear, width 80ms linear",
            pointerEvents: "none",
          }}
        >
          {/* Left end-cap dot */}
          {drag.drop.allowed ? (
            <>
              <span
                style={{
                  position: "absolute",
                  top: -5,
                  left: -6,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: BLUE,
                  boxShadow: `0 0 0 3px rgba(${BLUE_RGB},0.20), 0 0 12px rgba(${BLUE_RGB},0.50)`,
                }}
              />
              {/* Right end-cap dot */}
              <span
                style={{
                  position: "absolute",
                  top: -5,
                  right: -6,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: BLUE,
                  boxShadow: `0 0 0 3px rgba(${BLUE_RGB},0.20), 0 0 12px rgba(${BLUE_RGB},0.50)`,
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── Drag ghost ────────────────────────────────────────────── */}
      {drag.phase === "dragging" ? (
        <div
          data-edit-overlay="drag-ghost"
          style={{
            position: "fixed",
            top: drag.pointerY + 14,
            left: drag.pointerX + 16,
            pointerEvents: "none",
            zIndex: 100,
            transform: "rotate(-1deg)",
            background:
              "linear-gradient(180deg, rgba(24,24,27,0.97), rgba(11,11,13,0.97))",
            color: "white",
            padding: "12px 16px",
            borderRadius: 12,
            boxShadow:
              "0 24px 56px -12px rgba(0,0,0,0.50), 0 4px 12px -2px rgba(0,0,0,0.30), inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Section-type icon tile */}
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(255,255,255,0.10)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <SectionTypeIcon
              typeKey={drag.typeKey}
              size={18}
              style={{ opacity: 0.9 }}
            />
          </span>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              {(drag.name && cleanSectionName(drag.name)) ||
                humanizeTypeKey(drag.typeKey)}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.55,
                marginTop: 2,
              }}
            >
              {drag.drop
                ? drag.drop.allowed
                  ? "Drop to place"
                  : "Not allowed here"
                : "Drag to reorder"}
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    portalEl,
  );
}

/**
 * ChipToolBar — the icon-button cluster on the right side of the selection chip.
 * 34×34px per button, matching `.chip-tool` from the mockup.
 */
function ChipToolBar({
  disabled,
  confirmRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  disabled: boolean;
  confirmRemove: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  if (confirmRemove) {
    return (
      <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveConfirm}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            background: "rgba(196,61,61,0.90)",
            color: "white",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          Remove?
        </button>
        <button
          type="button"
          onClick={onRemoveCancel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 500,
            background: "transparent",
            color: "rgba(255,255,255,0.72)",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: "transparent",
    color: "rgba(255,255,255,0.72)",
    border: "none",
    borderLeft: "1px solid rgba(255,255,255,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 100ms, color 100ms",
  };

  return (
    <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveUp}
        aria-label="Move section up"
        title="Move up"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveDown}
        aria-label="Move section down"
        title="Move down"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onDuplicate}
        aria-label="Duplicate section"
        title="Duplicate"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onRemoveTrigger}
        aria-label="Remove section"
        title="Remove"
        danger
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </ChipBtn>
    </div>
  );
}

/** Thin wrapper so we can add hover-state CSS for the chip tool buttons. */
function ChipBtn({
  children,
  style,
  disabled,
  onClick,
  danger,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        ...style,
        background: hovered
          ? danger
            ? "rgba(196,61,61,0.20)"
            : "rgba(255,255,255,0.10)"
          : "transparent",
        color: hovered
          ? danger
            ? "#ff8b8b"
            : "white"
          : "rgba(255,255,255,0.72)",
        opacity: disabled ? 0.4 : 1,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
