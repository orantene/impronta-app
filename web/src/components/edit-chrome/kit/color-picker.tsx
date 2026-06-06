"use client";

/**
 * ColorPickerPopover — popover-mounted color picker for theme + style fields.
 *
 * Implements builder-experience.html surface §12 (Theme drawer) color-row
 * polish. Last reconciled: 2026-04-25.
 *
 * Three input paths in one surface:
 *
 *   1. **In-app HSV picker** — a self-contained saturation/value square + hue
 *      strip (`HsvPicker`). Replaces the OS `<input type="color">` so the
 *      color surface stays on the branded chrome and never drops to OS chrome
 *      (W3-T5). Pointer-drag + keyboard, hex in/out.
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
import { HsvPicker } from "./hsv-picker";

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

/**
 * Resolve a CSS custom property's live value off the document root so a theme
 * swatch can preview the *current* theme color, not just its literal fallback.
 * getComputedStyle returns rgb()/hex; callers normalise to hex where needed.
 */
function resolveCssVarColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const live = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim();
    return live || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Best-effort hex for the preview tile + native `<input type="color">`. A token
 * value (`var(--token-…, #hex)`) resolves through the live custom property,
 * falling back to the declared literal; plain values go through normaliseHex.
 * A `token:<key>` sentinel resolves via its matching swatch's cssVar/fallback.
 */
function previewHex(value: string, bound?: ColorTokenSwatch | null): string {
  const v = value.trim();
  if (bound && v.startsWith(TOKEN_REF_PREFIX)) {
    const live = resolveCssVarColor(bound.cssVar, bound.fallback);
    return normaliseHex(live) ?? normaliseHex(bound.fallback) ?? "#000000";
  }
  if (v.startsWith("var(")) {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(v);
    if (m) {
      const fallback = (m[2] ?? "").trim();
      const live = resolveCssVarColor(m[1], fallback);
      return normaliseHex(live) ?? normaliseHex(fallback) ?? "#000000";
    }
  }
  return normaliseHex(v) ?? "#000000";
}

/**
 * A theme-token swatch the field can bind to. When `tokenKey` is set the field
 * binds via the FIRST-CLASS `token:<key>` sentinel (Wave 3 · 3A — the renderer
 * resolves it to `var(--token-…)` so a theme change cascades, and the inspector
 * can show the bound token name + unbind). When `tokenKey` is absent the field
 * binds with a literal `var(--token-…, fallback)` string (legacy behaviour for
 * any other caller).
 */
export interface ColorTokenSwatch {
  label: string;
  cssVar: string;
  fallback: string;
  /** Registry key (e.g. "color.primary"). Present → emit the `token:` sentinel. */
  tokenKey?: string;
}

const TOKEN_REF_PREFIX = "token:";

/** The value a swatch emits — the sentinel when keyed, else a literal var(). */
function emittedValueFor(token: ColorTokenSwatch): string {
  return token.tokenKey
    ? `${TOKEN_REF_PREFIX}${token.tokenKey}`
    : `var(${token.cssVar}, ${token.fallback})`;
}

/**
 * Identify the bound token for the current value, matching BOTH the first-class
 * `token:<key>` sentinel and a literal `var(--token-…)` string (so previously
 * saved literal-var bindings still read as "bound"). Returns the swatch or null.
 */
function boundTokenFor(
  value: string,
  themeTokens: ColorTokenSwatch[] | undefined,
): ColorTokenSwatch | null {
  if (!themeTokens) return null;
  const v = value.trim();
  if (v.startsWith(TOKEN_REF_PREFIX)) {
    const key = v.slice(TOKEN_REF_PREFIX.length);
    return themeTokens.find((t) => t.tokenKey === key) ?? null;
  }
  if (v.startsWith("var(")) {
    return (
      themeTokens.find(
        (t) =>
          v === `var(${t.cssVar}, ${t.fallback})` ||
          v === `var(${t.cssVar})` ||
          v.startsWith(`var(${t.cssVar}`),
      ) ?? null
    );
  }
  return null;
}

interface ColorPickerPopoverProps {
  open: boolean;
  /** The element the popover should anchor against. */
  anchor: HTMLElement | null;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /**
   * Optional theme-token swatches. When present, a "Theme" row lets the field
   * bind to a token so it tracks the global theme instead of freezing a hex.
   */
  themeTokens?: ColorTokenSwatch[];
}

export function ColorPickerPopover({
  open,
  anchor,
  value,
  onChange,
  onClose,
  themeTokens,
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
      // ~164px HSV surface + hex echo + recents + (optional) theme/gradient rows.
      const popH = 420;
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

  const bound = boundTokenFor(value, themeTokens);
  const normalised = previewHex(value, bound);

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="color-picker-dialog-title"
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
        id="color-picker-dialog-title"
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

      {/* Bound-to-token banner (Wave 3 · 3A). When the value is bound to a Theme
          token, surface the token name + an "Unbind" action that converts the
          binding to its current resolved hex so the user keeps the color as an
          editable raw value. */}
      {bound ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${CHROME.lineMid}`,
            background: CHROME.surface2,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text2,
              minWidth: 0,
            }}
          >
            <Swatch color={normalised} size={14} title={bound.label} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Bound to {bound.label}
            </span>
          </span>
          <button
            type="button"
            onClick={() => commit(normalised)}
            title="Unbind — keep this color as an editable value"
            style={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: CHROME.muted,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            Unbind
          </button>
        </div>
      ) : null}
      {/* In-app HSV surface — saturation/value square + hue strip. Replaces the
          OS `<input type="color">` so color-picking never drops to OS chrome
          and stays on the branded surface (W3-T5). */}
      <div id={inputId}>
        <HsvPicker value={normalised} onChange={commit} />
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
          onMouseEnter={(e) => { e.currentTarget.style.background = CHROME.paper2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = CHROME.surface; }}
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
            transition: "background 120ms ease",
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
          role="alert"
          aria-live="polite"
          style={{
            marginTop: 6,
            fontSize: 10.5,
            color: CHROME.rose,
          }}
        >
          {eyedropperError}
        </div>
      ) : null}

      {/* Theme tokens — bind the field to a global color so it tracks the theme
          (emits `var(--token-…, fallback)`) instead of freezing a one-off hex.
          onChange is called directly, bypassing the hex-only commit() path. */}
      {themeTokens && themeTokens.length > 0 ? (
        <div className="mt-2.5">
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
            Theme
          </div>
          <div className="flex flex-wrap gap-1.5">
            {themeTokens.map((token) => {
              const emitted = emittedValueFor(token);
              const swatchHex =
                normaliseHex(resolveCssVarColor(token.cssVar, token.fallback)) ??
                token.fallback;
              const isActive =
                value.trim() === emitted ||
                (bound != null && bound.tokenKey === token.tokenKey && bound.cssVar === token.cssVar);
              return (
                <Swatch
                  key={token.tokenKey ?? token.cssVar}
                  color={swatchHex}
                  size={20}
                  title={`${token.label} — bind to the theme token (updates with the theme)`}
                  active={isActive}
                  onClick={() => onChange(emitted)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Recent strip */}
      <div className="mt-2.5">
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
          <div className="flex flex-wrap gap-1.5">
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
          onMouseEnter={(e) => { e.currentTarget.style.background = CHROME.accent2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = CHROME.accent; }}
          style={{
            height: 26,
            padding: "0 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            // Sprint 3.2.1 — primary CTA matches the editor's slate
            // accent family rather than brand-black ink.
            background: CHROME.accent,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            transition: "background 120ms ease",
          }}
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
