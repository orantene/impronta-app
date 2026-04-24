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

export function SelectionLayer() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    hoveredSectionId,
    setHoveredSectionId,
    device,
    moveSection,
    removeSection,
    duplicateSection,
    saving,
    loadedSection,
  } = useEditContext();

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
            }}
          >
            <div
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
