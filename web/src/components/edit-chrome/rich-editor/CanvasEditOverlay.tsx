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
 *   - W1-L3: Esc COMMITS (keeps the typed text — undoable via ⌘Z), same as
 *     Enter (single-line variant only) and outside-click / blur. No gesture
 *     silently discards the operator's work; no Done button required.
 *   - On commit, the `onCommit` callback receives the new marker string
 *     and the parent's existing `findPathByValue` path-rewrite path
 *     handles the save.
 *
 * Scope cap: same primitive, same toolbar, same marker round-trip. No
 * new commands, no new node types, no schema changes, no public render
 * changes.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  canvasOverlayStyleFromPatch,
  subscribeCanvasOverlayStylePatch,
} from "../canvas-lexical-bridge";
import { RichEditor } from "./RichEditor";
import type { CaretPoint } from "./plugins/AutoFocusCaretPlugin";

interface Props {
  /** The rendered text element the operator dblclicked. */
  target: HTMLElement;
  /** Initial marker string — typically `target.textContent`. */
  initialValue: string;
  /** Remount the editor when undo/redo changes stored copy mid-edit. */
  resyncKey?: number;
  /** Tenant id for LinkPicker scoping. */
  tenantId?: string;
  /**
   * Single line (heading-like) vs multi line (paragraph-like). Detected
   * from the target's tag — h1..h6 + a + span + small → single, p / li /
   * blockquote / div → multi.
   */
  variant: "single" | "multi";
  /**
   * Called once with the final marker string. W1-L3 — BOTH blur/outside-click
   * AND Escape route here: the typed text is always kept (committing is
   * undoable via ⌘Z), so no gesture silently discards the operator's work.
   */
  onCommit: (next: string) => void;
  /**
   * CANVAS-7B — the parent stashes the overlay's own `commit()` here so the
   * undo-handoff can force the same commit (live text → node history) the
   * blur/outside-click path runs, before a node-level undo fires. Cleared to
   * `null` on unmount.
   */
  commitRef?: { current: (() => void) | null };
  /**
   * WAVE 2.1 — viewport point of the double-click that opened this overlay.
   * The editor focuses itself synchronously on mount and drops the caret here,
   * so ONE double-click leaves the operator typing. Without it the overlay
   * mounted unfocused and every keystroke before a third click was dropped.
   */
  caretPoint?: CaretPoint | null;
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
  resyncKey = 0,
  tenantId,
  variant,
  onCommit,
  commitRef,
  caretPoint = null,
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  // The click point applies to the FIRST mount only — a `resyncKey` remount
  // (undo/redo mid-edit) refocuses at the end of the restored text rather than
  // jumping the caret back to wherever the original double-click landed.
  const initialCaretPoint: CaretPoint | null = resyncKey === 0 ? caretPoint : null;
  const [rect, setRect] = useState(() => target.getBoundingClientRect());
  // WAVE 2.1 — computed on the FIRST render, not in a layout effect. The caret
  // is placed by hit-testing the operator's double-click point against the
  // overlay's own glyphs, and a first render at the wrong font size puts those
  // glyphs somewhere else, which silently dropped the caret at the end of the
  // text instead of where they clicked.
  const [typeStyles, setTypeStyles] = useState<Record<string, string>>(() =>
    readTypeStyles(target),
  );
  const valueRef = useRef<string>(initialValue);
  const committedRef = useRef(false);

  useLayoutEffect(() => {
    valueRef.current = initialValue;
  }, [initialValue, resyncKey]);

  useLayoutEffect(() => {
    const previous = target.style.visibility;
    target.style.visibility = "hidden";
    return () => {
      target.style.visibility = previous;
    };
  }, [target]);

  useLayoutEffect(() => {
    setTypeStyles(readTypeStyles(target));
  }, [target, resyncKey]);

  useEffect(() => {
    return subscribeCanvasOverlayStylePatch((patch) => {
      const mapped = canvasOverlayStyleFromPatch(patch);
      if (Object.keys(mapped).length === 0) return;
      setTypeStyles((prev) => ({ ...prev, ...mapped }));
    });
  }, []);

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

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const serialized = valueRef.current.trim();
    const liveText = (fieldRef.current?.innerText ?? "").trim();
    onCommit(
      serialized === initialValue.trim() && liveText ? liveText : serialized,
    );
  }, [initialValue, onCommit]);

  // CANVAS-7B — expose this overlay's own `commit()` to the parent so the
  // undo-handoff can force a commit (same path as blur / outside-click) before
  // a node-level undo runs. Cleared on unmount so a stale handle never fires.
  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = commit;
    return () => {
      commitRef.current = null;
    };
  }, [commitRef, commit]);

  function isExternalChromeClick(t: HTMLElement | null): boolean {
    if (!t) return false;
    return Boolean(
      t.closest('[data-edit-overlay="rich-toolbar"]') ||
        t.closest('[data-edit-overlay="rich-link-popover"]') ||
        t.closest("[data-canvas-text-toolbar]") ||
        t.closest('[data-edit-overlay="color-picker-popover"]'),
    );
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (overlayRef.current && overlayRef.current.contains(e.target as Node)) return;
      if (isExternalChromeClick(e.target as HTMLElement | null)) return;
      commit();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // W1-L3 — Escape COMMITS (keeps the typed text), identical to blur.
        // Previously Escape discarded silently, destroying work with no warning
        // and no recovery. Committing is undoable (⌘Z reverts the text change as
        // one atomic step), so "Escape to back out" still works — without the
        // data loss. `stopPropagation` so the edit-shell's own Escape (deselect)
        // doesn't also fire on the same keystroke.
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.key === "Enter" && variant === "single" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [variant, commit]);

  useEffect(() => {
    const root = fieldRef.current;
    if (!root) return;
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null;
      if (next && overlayRef.current?.contains(next)) return;
      if (isExternalChromeClick(next as HTMLElement | null)) return;
      commit();
    }
    root.addEventListener("focusout", onFocusOut);
    return () => root.removeEventListener("focusout", onFocusOut);
  }, [commit]);

  return createPortal(
    <div
      ref={overlayRef}
      data-edit-overlay="canvas-edit"
      role="region"
      aria-label="Inline text editor"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        minHeight: rect.height,
        zIndex: 125,
        ...typeStyles,
        outline: "1px solid rgba(17,24,39,0.92)",
        outlineOffset: 2,
        boxShadow: "0 0 0 4px rgba(17,24,39,0.12)",
        borderRadius: 0,
        background: "transparent",
      }}
    >
      <div ref={fieldRef}>
        <RichEditor
          key={`${resyncKey}:${initialValue}`}
          value={initialValue}
          onChange={(next) => {
            valueRef.current = next;
          }}
          variant={variant}
          tenantId={tenantId}
          ariaLabel="Inline canvas editor"
          autoFocus
          autoFocusCaretPoint={initialCaretPoint}
          suppressFloatingToolbar
          className="outline-none"
        />
      </div>
    </div>,
    document.body,
  );
}

/** The target's computed type styles, so the overlay lays text out identically. */
function readTypeStyles(target: HTMLElement): Record<string, string> {
  const cs = window.getComputedStyle(target);
  const out: Record<string, string> = {};
  for (const key of TYPE_STYLE_PROPS) {
    out[key] = cs.getPropertyValue(toKebab(key));
  }
  return out;
}

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
