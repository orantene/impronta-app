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
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEditContext } from "./edit-context";

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

// Editor chrome accents. Zinc-900 ink matches the top-bar Publish button so
// the whole editor surface reads as one calm ink palette, not a neon overlay
// bolted onto a branded storefront. Opacity varies by state so a hover never
// fights with a selection, and the selected halo lives in a second, outer
// box-shadow for depth without a second outline.
const INK = "17, 24, 39"; // zinc-900 rgb triplet (shared with topbar)
const HOVER_STROKE = `rgba(${INK}, 0.35)`;
const SELECT_STROKE = `rgba(${INK}, 0.92)`;
const SELECT_HALO = `rgba(${INK}, 0.12)`;

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
          e.target.closest("[data-edit-inspector]") ||
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
      if (delta !== 0) window.scrollBy(0, delta);
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

  return createPortal(
    <div data-edit-overlay className="pointer-events-none absolute inset-0">
      {showHover ? (
        <div
          style={{
            position: "fixed",
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
            outline: `1px solid ${HOVER_STROKE}`,
            outlineOffset: "-1px",
            borderRadius: 2,
            transition: "top 80ms linear, left 80ms linear, width 80ms linear, height 80ms linear",
          }}
        />
      ) : null}
      {selectedRect ? (
        <>
          <div
            style={{
              position: "fixed",
              top: selectedRect.top,
              left: selectedRect.left,
              width: selectedRect.width,
              height: selectedRect.height,
              outline: `1px solid ${SELECT_STROKE}`,
              outlineOffset: "-1px",
              borderRadius: 2,
              // Outer halo gives depth without needing a second outline line;
              // a 4 px soft shadow reads as "selected in place" rather than
              // "highlighted with a debug ring".
              boxShadow: `0 0 0 4px ${SELECT_HALO}`,
              // Source section fades while dragging — space reserved, halo
              // kept so the operator can still see where the section "is".
              opacity:
                drag.phase === "dragging" && drag.id === selectedSectionId
                  ? 0.35
                  : 1,
              transition: "opacity 120ms linear",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: Math.max(selectedRect.top - 30, 56),
              left: selectedRect.left,
              height: 26,
              display: "flex",
              alignItems: "center",
              gap: 1,
              pointerEvents: "auto",
              whiteSpace: "nowrap",
              opacity:
                drag.phase === "dragging" && drag.id === selectedSectionId
                  ? 0
                  : 1,
              transition: "opacity 120ms linear",
            }}
          >
            <div
              onPointerDown={startDrag}
              title="Drag to reorder — or use ↑/↓"
              style={{
                display: "flex",
                alignItems: "baseline",
                padding: "0 10px",
                height: "100%",
                background: `rgba(${INK}, 0.96)`,
                color: "white",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.01em",
                borderRadius: "3px 0 0 3px",
                gap: 6,
                cursor: drag.phase === "idle" ? "grab" : "grabbing",
                userSelect: "none",
                touchAction: "none",
              }}
            >
              <span>
                {loadedSection?.id === selectedSectionId && loadedSection?.name
                  ? loadedSection.name
                  : humanizeTypeKey(selectedTypeKey)}
              </span>
              {loadedSection?.id === selectedSectionId &&
              loadedSection?.name ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    opacity: 0.55,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {humanizeTypeKey(selectedTypeKey)}
                </span>
              ) : null}
            </div>
            <SectionToolBar
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
                    // Select the new duplicate so the operator can immediately
                    // edit it — matches platform-wide "act on the thing you
                    // just created" convention.
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
      {drag.phase === "dragging" && drag.drop ? (
        <div
          data-edit-overlay="drag-drop-line"
          style={{
            position: "fixed",
            top: drag.drop.indicatorY - 1,
            left: drag.drop.indicatorLeft,
            width: drag.drop.indicatorWidth,
            height: 2,
            background: drag.drop.allowed
              ? `rgba(${INK}, 0.92)`
              : "rgba(239, 68, 68, 0.6)", // red-500 muted for invalid
            boxShadow: drag.drop.allowed
              ? `0 0 0 3px rgba(${INK}, 0.12)`
              : "0 0 0 3px rgba(239, 68, 68, 0.1)",
            borderRadius: 2,
            transition: "top 80ms linear, left 80ms linear, width 80ms linear",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {drag.phase === "dragging" ? (
        <div
          data-edit-overlay="drag-ghost"
          style={{
            position: "fixed",
            top: drag.pointerY + 10,
            left: drag.pointerX + 12,
            pointerEvents: "none",
            zIndex: 10,
            transform: "rotate(1.5deg)",
            background: `rgba(${INK}, 0.96)`,
            color: "white",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            boxShadow:
              "0 10px 30px -8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08) inset",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span>
            {drag.name ?? humanizeTypeKey(drag.typeKey)}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              opacity: 0.6,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {drag.drop
              ? drag.drop.allowed
                ? "Drop"
                : "Not allowed"
              : "Drag to reorder"}
          </span>
        </div>
      ) : null}
    </div>,
    portalEl,
  );
}

/**
 * SectionToolBar — the ↑/↓/🗑 chip that sits to the right of the section-type
 * label above a selected section. Lives in the portal's pointer-events:auto
 * subtree so clicks land. Remove is a two-step confirm (click → confirm) so
 * operators don't nuke a section with a stray click on a tiny trash icon.
 */
function SectionToolBar({
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
  const baseBtn =
    "inline-flex size-[26px] items-center justify-center bg-[rgba(17,24,39,0.96)] text-white/85 transition hover:text-white hover:bg-[rgba(17,24,39,1)] disabled:opacity-50 disabled:hover:bg-[rgba(17,24,39,0.96)] border-l border-white/10";
  if (confirmRemove) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          borderRadius: "0 3px 3px 0",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveConfirm}
          className="inline-flex h-full items-center border-l border-white/10 bg-red-600 px-2.5 text-[11px] font-semibold tracking-wide text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          Remove?
        </button>
        <button
          type="button"
          onClick={onRemoveCancel}
          className="inline-flex h-full items-center border-l border-white/10 bg-[rgba(17,24,39,0.96)] px-2.5 text-[11px] font-medium tracking-wide text-white/80 transition hover:bg-[rgba(17,24,39,1)] hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        borderRadius: "0 3px 3px 0",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onMoveUp}
        className={baseBtn}
        aria-label="Move section up"
        title="Move up"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onMoveDown}
        className={baseBtn}
        aria-label="Move section down"
        title="Move down"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDuplicate}
        className={baseBtn}
        aria-label="Duplicate section"
        title="Duplicate"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemoveTrigger}
        className={baseBtn}
        aria-label="Remove section"
        title="Remove"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </button>
    </div>
  );
}
