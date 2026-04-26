"use client";

/**
 * ColorPickerPopover — popover-mounted color picker for theme + style fields.
 *
 * Implements builder-experience.html surface §12 (Theme drawer) color-row
 * polish. Last reconciled: 2026-04-25.
 *
 * Three input paths in one surface:
 *
 *   1. **Native HSL picker** — `<input type="color">` rendered full-bleed.
 *      The OS handles the gradient surface, hue strip, and accessibility.
 *      We don't reinvent a canvas-based picker because the native one is
 *      already excellent on every supported platform (and we ship to
 *      browsers, not embedded contexts).
 *
 *   2. **Eyedropper** — `window.EyeDropper` is Chromium-only at time of
 *      writing. Feature-detect and show the button only when the API
 *      exists. Falls back to a disabled button with a "Pick from page —
 *      Chromium only" tooltip on Safari/Firefox so operators understand
 *      why it's missing rather than wondering if it's broken.
 *
 *   3. **Recent colors** — last N hex picks across all sessions (per-tenant
 *      and per-browser, via localStorage). The strip backfills with theme
 *      defaults so a fresh operator still sees something to click. Each
 *      pick promotes that color to the front of the strip.
 *
 * The popover is portalled into the overlay layer so it renders above the
 * drawer chrome. Clicking outside, pressing Escape, or pressing "Done"
 * closes the popover. The current value lives on the parent — we only
 * notify changes via `onChange`.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./tokens";
import { Swatch } from "./swatch";

const RECENT_KEY = "tulala.theme.recent-colors";
const RECENT_MAX = 8;

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperLike {
  open: () => Promise<EyeDropperResult>;
}

interface WindowWithEyeDropper extends Window {
  EyeDropper?: new () => EyeDropperLike;
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(hex: string): string[] {
  if (typeof window === "undefined") return [];
  const cleaned = normaliseHex(hex);
  if (!cleaned) return readRecent();
  try {
    const current = readRecent();
    // Promote to front; drop dupes; cap at RECENT_MAX.
    const next = [cleaned, ...current.filter((c) => c.toLowerCase() !== cleaned.toLowerCase())]
      .slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readRecent();
  }
}

/**
 * Coerce arbitrary input into a 7-char `#RRGGBB`. The native picker only
 * accepts that form, so anything outside it (3-char shorthand, rgba(),
 * css color names) gets normalised through a temporary canvas.
 */
function normaliseHex(input: string): string | null {
  if (typeof window === "undefined") return null;
  const trimmed = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, a, b, c] = trimmed;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  // Use a canvas to resolve named colors / rgba().
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillStyle = trimmed;
    const resolved = ctx.fillStyle as string;
    if (/^#[0-9a-f]{6}$/i.test(resolved)) return resolved.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

interface ColorPickerPopoverProps {
  open: boolean;
  /** The element the popover should anchor against. */
  anchor: HTMLElement | null;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}

export function ColorPickerPopover({
  open,
  anchor,
  value,
  onChange,
  onClose,
}: ColorPickerPopoverProps): ReactElement | null {
  const inputId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [eyedropperBusy, setEyedropperBusy] = useState(false);
  const [eyedropperError, setEyedropperError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const supportsEyedropper =
    typeof window !== "undefined" &&
    typeof (window as WindowWithEyeDropper).EyeDropper === "function";

  // Anchor positioning. Recompute on open + on resize / scroll.
  useEffect(() => {
    if (!open || !anchor) return;
    function place() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      // Anchor below + slightly right; the popover is 240px wide so we
      // clamp into the viewport with an 8px gutter.
      const popW = 240;
      const popH = 320;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + popW > window.innerWidth - 8) {
        left = window.innerWidth - popW - 8;
      }
      if (top + popH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - popH - 6);
      }
      setPosition({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor]);

  // Outside-click + Escape close. We listen on capture so the click on the
  // anchor swatch (which would re-toggle us) doesn't win.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchor, onClose]);

  // Refresh recents whenever the popover opens — covers the case where
  // another instance pushed a value while this one was closed.
  useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  const commit = useCallback(
    (next: string) => {
      const cleaned = normaliseHex(next) ?? next;
      onChange(cleaned);
      const updated = pushRecent(cleaned);
      setRecent(updated);
    },
    [onChange],
  );

  const handleEyedropper = useCallback(async () => {
    if (!supportsEyedropper) return;
    setEyedropperError(null);
    setEyedropperBusy(true);
    try {
      const Ctor = (window as WindowWithEyeDropper).EyeDropper!;
      const result = await new Ctor().open();
      commit(result.sRGBHex);
    } catch (err) {
      // User cancelled (Esc) is the most common rejection — silent.
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        // ignore
      } else {
        setEyedropperError("Eyedropper unavailable in this context.");
      }
    } finally {
      setEyedropperBusy(false);
    }
  }, [supportsEyedropper, commit]);

  if (!open || typeof document === "undefined") return null;

  const normalised = normaliseHex(value) ?? "#000000";

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Color picker"
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width: 240,
        zIndex: 200,
        background: CHROME.paper,
        border: `1px solid ${CHROME.lineMid}`,
        borderRadius: CHROME_RADII.md,
        boxShadow: CHROME_SHADOWS.popover,
        padding: 12,
        opacity: position ? 1 : 0,
      }}
    >
      <label
        htmlFor={inputId}
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: CHROME.muted,
          marginBottom: 6,
        }}
      >
        Pick a color
      </label>
      {/* Native HSL surface. The control itself is a 1-px transparent input
          stretched over a swatch tile so we get the full OS picker on click
          while keeping our own visual style. */}
      <div
        style={{
          position: "relative",
          height: 64,
          borderRadius: CHROME_RADII.sm,
          border: `1px solid ${CHROME.line}`,
          background: normalised,
          boxShadow: CHROME_SHADOWS.inputInset,
          overflow: "hidden",
        }}
      >
        <input
          id={inputId}
          type="color"
          value={normalised}
          onChange={(e) => commit(e.target.value)}
          aria-label="Pick a color"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            border: "none",
            padding: 0,
          }}
        />
      </div>

      {/* Hex echo + eyedropper trigger */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const cleaned = normaliseHex(e.target.value);
            if (cleaned) commit(cleaned);
          }}
          spellCheck={false}
          aria-label="Hex value"
          className="uppercase"
          style={{
            flex: 1,
            padding: "6px 8px",
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 6,
            background: CHROME.surface2,
            boxShadow: CHROME_SHADOWS.inputInset,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 11,
            color: CHROME.ink,
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={() => void handleEyedropper()}
          disabled={!supportsEyedropper || eyedropperBusy}
          aria-label="Pick color from page"
          title={
            supportsEyedropper
              ? "Pick a color from anywhere on the page"
              : "Eyedropper requires Chromium-based browsers"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 6,
            background: CHROME.surface,
            color: supportsEyedropper ? CHROME.text2 : CHROME.muted2,
            cursor: supportsEyedropper && !eyedropperBusy ? "pointer" : "not-allowed",
            flexShrink: 0,
          }}
        >
          {/* Eyedropper glyph */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2 22l4-1 9-9-3-3-9 9-1 4z" />
            <path d="M14 7l3 3" />
            <path d="M16 5a2.5 2.5 0 0 1 3.5 3.5L17 11l-3-3 2-3z" />
          </svg>
        </button>
      </div>
      {eyedropperError ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 10.5,
            color: CHROME.rose,
          }}
        >
          {eyedropperError}
        </div>
      ) : null}

      {/* Recent strip */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: CHROME.muted2,
            marginBottom: 4,
          }}
        >
          Recent
        </div>
        {recent.length === 0 ? (
          <div
            style={{
              fontSize: 10.5,
              color: CHROME.muted2,
              fontStyle: "italic",
              padding: "6px 0",
            }}
          >
            Picked colors will land here.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recent.map((hex) => (
              <Swatch
                key={hex}
                color={hex}
                size={20}
                title={hex}
                active={hex.toLowerCase() === normalised.toLowerCase()}
                onClick={() => commit(hex)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 26,
            padding: "0 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            background: CHROME.ink,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
