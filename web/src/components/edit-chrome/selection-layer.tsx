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
  } = useEditContext();

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);

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
              top: Math.max(selectedRect.top - 24, 56),
              left: selectedRect.left,
              height: 22,
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              background: "rgba(37,99,235,0.95)",
              color: "white",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.02em",
              borderRadius: 4,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {humanizeTypeKey(selectedTypeKey)}
          </div>
        </>
      ) : null}
    </div>,
    portalEl,
  );
}
