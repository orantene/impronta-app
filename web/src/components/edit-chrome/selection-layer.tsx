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

export function SelectionLayer() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    hoveredSectionId,
    setHoveredSectionId,
    device,
    moveSection,
    removeSection,
    saving,
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
    if (rafRef.current !== null) return;
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
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
            outline: "2px solid rgba(59,130,246,0.45)",
            outlineOffset: "-2px",
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
              outline: "2px solid rgba(37,99,235,0.9)",
              outlineOffset: "-2px",
              borderRadius: 2,
              boxShadow: "0 0 0 1px rgba(37,99,235,0.15)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: Math.max(selectedRect.top - 28, 56),
              left: selectedRect.left,
              height: 24,
              display: "flex",
              alignItems: "center",
              gap: 2,
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                height: "100%",
                background: "rgba(37,99,235,0.95)",
                color: "white",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.02em",
                borderRadius: "4px 0 0 4px",
              }}
            >
              {humanizeTypeKey(selectedTypeKey)}
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
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  disabled: boolean;
  confirmRemove: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  const baseBtn =
    "inline-flex size-6 items-center justify-center bg-[rgba(37,99,235,0.95)] text-white transition hover:bg-[rgba(29,78,216,1)] disabled:opacity-60 disabled:hover:bg-[rgba(37,99,235,0.95)]";
  if (confirmRemove) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          borderRadius: "0 4px 4px 0",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveConfirm}
          className="inline-flex h-full items-center bg-red-600 px-2 text-[11px] font-semibold tracking-wide text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          Remove?
        </button>
        <button
          type="button"
          onClick={onRemoveCancel}
          className="inline-flex h-full items-center bg-zinc-800 px-2 text-[11px] font-medium tracking-wide text-white transition hover:bg-zinc-900"
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
        borderRadius: "0 4px 4px 0",
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onMoveDown}
        className={baseBtn}
        aria-label="Move section down"
        title="Move down"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemoveTrigger}
        className={baseBtn}
        aria-label="Remove section"
        title="Remove"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </button>
    </div>
  );
}
