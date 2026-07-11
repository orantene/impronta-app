/**
 * StylePanel · shared module-level helpers for the domain sub-sections (W5-C1).
 *
 * These were module-scope (never closure-scope) helpers in style-panel.tsx that
 * more than one extracted domain section depends on. Moving them here — verbatim
 * — lets the parent panel and each section import the identical implementation,
 * with zero behavior change. Pure/self-contained: StyleGroupOverrideDot &
 * ThemeBindRow own their state; colorSwatchDisplay is pure.
 */

import { useState } from "react";
import { Segmented, type SegmentedOption } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { type ColorTokenSwatch } from "../../kit/color-picker";
import {
  STYLE_BINDABLE_COLOR_TOKENS,
  type StyleBindableToken,
  type StyleBindableTokenKind,
  bindableTokensForStyleProp,
  parseStyleTokenRef,
  rebindRawToTokenRef,
  styleTokenRef,
} from "@/lib/site-admin/builder-node/style-token-bindings";

export const BUILDER_NODE_THEME_COLOR_TOKENS: ColorTokenSwatch[] =
  STYLE_BINDABLE_COLOR_TOKENS.map((t) => ({
    label: t.label,
    cssVar: t.cssVar,
    fallback: t.fallback,
    tokenKey: t.key,
  }));

// Map a stored color value to a CSS-DISPLAYABLE string for the inspector swatch
// preview. A `token:<key>` binding resolves to `var(--token-…, fallback)` so the
// swatch shows the live theme color; a raw value (hex / rgb / keyword) is shown
// as-is. Mirrors the renderer's resolveStyleTokenRef without importing it (this
// stays a pure presentation helper). Returns undefined for an empty value so the
// caller's checkerboard fallback shows.
export function colorSwatchDisplay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("token:")) {
    const token = STYLE_BINDABLE_COLOR_TOKENS.find(
      (t) => t.key === value.slice("token:".length),
    );
    return token ? `var(${token.cssVar}, ${token.fallback})` : undefined;
  }
  return value;
}

/**
 * Job #33 — per-group "has responsive overrides" dot. Rendered as an
 * InspectorGroup accessory on the Typography + Spacing groups so an operator
 * (even while scoped to Desktop) can see at a glance that the group behaves
 * differently on a smaller breakpoint. Blue to match the viewport-scope banner +
 * the layer-row dot.
 */
export function StyleGroupOverrideDot({ label }: { label: string }) {
  return (
    <span
      data-style-group-override-dot=""
      title={label}
      aria-label={label}
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: CHROME.blue,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: CHROME.blue,
          boxShadow: "0 0 0 2px rgba(58,123,255,0.18)",
        }}
      />
      Responsive
    </span>
  );
}

/**
 * Theme-binding affordance for a non-color style prop (radius / shadow /
 * spacing / type-scale). Sits beside the prop's raw control and lets the author
 * BIND the prop to a Theme token (emits the `token:<key>` sentinel the renderer
 * resolves to `var(--site-…)`, so a global theme change re-styles the node) or
 * DETACH it back to a raw value.
 *
 * - When BOUND: shows a "Theme · <label>" pill + a Detach (×) button, plus a
 *   compact Segmented to switch which token within the same category.
 * - When RAW / empty: shows a "Bind" toggle that reveals the token Segmented,
 *   and — when the current raw value is an EXACT theme-token value — a one-click
 *   "Follow theme" that rebinds it conservatively.
 *
 * Matches the premium control idiom (Segmented chips; no raw <select>). Renders
 * nothing when the prop has no bindable tokens, so it's a safe no-op to drop in.
 */
export function ThemeBindRow({
  prop,
  value,
  onSet,
  onDetach,
}: {
  prop: string;
  value: string | undefined;
  /** Set the prop to a `token:<key>` sentinel. */
  onSet: (sentinel: string) => void;
  /** Restore the prop to a raw value (undefined clears it). */
  onDetach: () => void;
}) {
  const tokens = bindableTokensForStyleProp(prop);
  const [bindOpen, setBindOpen] = useState(false);
  if (tokens.length === 0) return null;

  const bound = parseStyleTokenRef(value);
  const kind = tokens[0]!.kind as StyleBindableTokenKind;
  const tokenOptions: ReadonlyArray<SegmentedOption<string>> = tokens.map(
    (t: StyleBindableToken) => ({
      value: t.key,
      // Short chip label — the token label is e.g. "Radius — base"; show the
      // part after the em-dash so chips stay tight.
      label: t.label.includes("—") ? t.label.split("—")[1]!.trim() : t.label,
      title: t.label,
    }),
  );
  // A conservative one-click suggestion when the raw value IS a token's value.
  const followSuggestion =
    !bound && value ? rebindRawToTokenRef(value, kind) : null;
  const followToken = followSuggestion ? parseStyleTokenRef(followSuggestion) : null;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-builder-node-theme-bind={prop}
      style={{ marginTop: 2 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: bound ? CHROME.blue : CHROME.muted,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: bound ? CHROME.blue : "transparent",
              border: bound ? "none" : `1px solid ${CHROME.controlBorder}`,
              boxShadow: bound ? "0 0 0 2px rgba(58,123,255,0.18)" : "none",
            }}
          />
          {bound ? `Theme · ${bound.label}` : "Theme"}
        </span>
        {bound ? (
          <button
            type="button"
            onClick={() => {
              onDetach();
              setBindOpen(false);
            }}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{ background: "transparent", border: "none", color: CHROME.muted, padding: 0 }}
            title="Stop following the brand style (use a fixed value)"
          >
            Detach
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setBindOpen((o) => !o)}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{ background: "transparent", border: "none", color: CHROME.blue, padding: 0 }}
            title="Use a brand style for this property"
            aria-expanded={bindOpen}
          >
            {bindOpen ? "Cancel" : "Bind"}
          </button>
        )}
      </div>

      {followSuggestion && followToken && !bindOpen ? (
        <button
          type="button"
          onClick={() => onSet(followSuggestion)}
          className="cursor-pointer text-left text-[11px]"
          style={{
            background: CHROME.surface2,
            border: `1px solid ${CHROME.controlBorder}`,
            borderRadius: 7,
            color: CHROME.ink,
            padding: "5px 8px",
          }}
          title={`This value matches the brand style "${followToken.label}". Use it to follow the theme`}
        >
          Follow theme · {followToken.label}
        </button>
      ) : null}

      {bound || bindOpen ? (
        <Segmented
          fullWidth
          compact
          value={bound?.key ?? ""}
          onChange={(next) => {
            if (next) {
              onSet(styleTokenRef(next));
              setBindOpen(false);
            }
          }}
          options={tokenOptions}
        />
      ) : null}
    </div>
  );
}
