"use client";

/**
 * Phase C.1 — `CanvasEditOverlay` mounts a `RichEditor` ephemerally over a
 * rendered section text element so the operator's natural canvas-dblclick
 * gesture lands them in the same premium primitive used by the inspector.
 *
 * Mechanics:
 *   - Position fixed to the target's bounding rect (CSS pixels).
 *   - Inherits computed type styles (font, size, weight, line-height,
 *     letter-spacing, color, text-align) so the editor visually replaces
 *     the rendered text instead of looking like a foreign overlay.
 *   - The target element is hidden (`visibility: hidden`) for the
 *     duration of the edit so the overlay sits in its layout slot
 *     without visual overlap. Layout doesn't shift.
 *   - Esc reverts. Enter commits (single-line variant only). Outside-
 *     click commits. Blur commits.
 *   - On commit, the `onCommit` callback receives the new marker string
 *     and the parent's existing `findPathByValue` path-rewrite path
 *     handles the save.
 *
 * Scope cap: same primitive, same toolbar, same marker round-trip. No
 * new commands, no new node types, no schema changes, no public render
 * changes.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { RichEditor } from "./RichEditor";

interface Props {
  /** The rendered text element the operator dblclicked. */
  target: HTMLElement;
  /** Initial marker string — typically `target.textContent`. */
  initialValue: string;
  /** Tenant id for LinkPicker scoping. */
  tenantId?: string;
  /**
   * Single line (heading-like) vs multi line (paragraph-like). Detected
   * from the target's tag — h1..h6 + a + span + small → single, p / li /
   * blockquote / div → multi.
   */
  variant: "single" | "multi";
  /** Called once with the final marker string. */
  onCommit: (next: string) => void;
  /** Called when the operator hits Escape. */
  onCancel: () => void;
}

const TYPE_STYLE_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textAlign",
  "color",
] as const;

export function CanvasEditOverlay({
  target,
  initialValue,
  tenantId,
  variant,
  onCommit,
  onCancel,
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState(() => target.getBoundingClientRect());
  const [typeStyles, setTypeStyles] = useState<Record<string, string>>({});
  // Mirror the live editor value so we can commit on outside-click without a
  // stale-closure dance.
  const valueRef = useRef<string>(initialValue);
  const committedRef = useRef(false);

  // Hide the target while editing — the overlay occupies its visual slot.
  useLayoutEffect(() => {
    const previous = target.style.visibility;
    target.style.visibility = "hidden";
    return () => {
      target.style.visibility = previous;
    };
  }, [target]);

  // Capture computed type styles so the overlay matches the page's typography.
  useLayoutEffect(() => {
    const cs = window.getComputedStyle(target);
    const out: Record<string, string> = {};
    for (const key of TYPE_STYLE_PROPS) {
      out[key] = cs.getPropertyValue(toKebab(key));
    }
    setTypeStyles(out);
  }, [target]);

  // Track scroll/resize so the overlay stays glued to the target.
  useEffect(() => {
    let raf = 0;
    function refresh() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setRect(target.getBoundingClientRect()));
    }
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", refresh, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", refresh);
    };
  }, [target]);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(valueRef.current.trim());
  }
  function cancel() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  }

  // Outside-click + Escape + Enter (single) handling.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (overlayRef.current && overlayRef.current.contains(e.target as Node)) return;
      // Clicks on the floating toolbar/popovers (rendered via portal to body)
      // would otherwise count as "outside" and commit. Skip if the click
      // landed inside any rich-editor-owned overlay.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.closest('[data-edit-overlay="rich-toolbar"]') ||
          t.closest('[data-edit-overlay="rich-link-popover"]'))
      )
        return;
      commit();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && variant === "single" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  return createPortal(
    <div
      ref={overlayRef}
      data-edit-overlay="canvas-edit"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        // No fixed height — the editor expands to fit content. We do bound
        // it from below to the original height so a brief layout flicker
        // doesn't yank surrounding sections.
        minHeight: rect.height,
        zIndex: 125,
        // Carry the canvas typography over to the editor surface.
        ...typeStyles,
        // Keep the editor visually anchored: subtle ring so the operator
        // sees they are mid-edit, matching the selection-layer palette.
        outline: "1px solid rgba(17,24,39,0.92)",
        outlineOffset: 2,
        boxShadow: "0 0 0 4px rgba(17,24,39,0.12)",
        borderRadius: 2,
        // The RichEditor's default class adds borders; we override with
        // transparent backgrounds + no border so the inline edit reads as
        // a continuation of the page, not a chrome panel.
        background: "transparent",
      }}
      // The overlay should not eat clicks meant for the toolbar (rendered
      // separately via portal). It does receive its own clicks normally.
    >
      <RichEditor
        value={initialValue}
        onChange={(next) => {
          valueRef.current = next;
        }}
        variant={variant}
        tenantId={tenantId}
        ariaLabel="Inline canvas editor"
        // No surrounding pad / border — the overlay's outline + shadow
        // already mark the edit affordance.
        className="outline-none"
      />
    </div>,
    document.body,
  );
}

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
