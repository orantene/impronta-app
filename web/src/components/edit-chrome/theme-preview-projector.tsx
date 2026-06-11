"use client";

/**
 * theme-preview-projector.tsx — GAP A (live theme reactivity), DOM side.
 *
 * Subscribes to the theme-preview bridge and projects the working DRAFT's
 * CSS-var tokens onto the editor CANVAS ROOT — the storefront wrapper marked
 * `data-theme-canvas-root` (see `agency-home-storefront.tsx`). NOT the
 * published <html>: the served bytes stay byte-stable until Publish.
 *
 * Why this works with zero tree re-render: every bound node already renders
 * `var(--token-x, fallback)`. Setting `--token-x` on an ancestor of the whole
 * canvas overrides the value inherited from <html> for the entire subtree, so
 * a single `setProperty` call recolours everything instantly — no React render.
 * CSS custom properties resolve lazily at the consuming element, so even the
 * indirect chain (`--site-heading-font: var(--token-typography-heading-font-family,…)`)
 * re-resolves against the canvas-root override.
 *
 * Coverage: this projects the tokens with a direct `var(--token-*)` consumer —
 * all palette colors, the header surface colors, and the per-level type sizes
 * (h1–h6/body). The two CUSTOM FONT-FAMILY tokens are a special case: their
 * consumer is `--site-heading-font` / `--site-body-font`, which are *declared
 * on <html>* (token-presets.css), so their `var(--token-…)` substitution
 * resolves at <html> and a canvas-root override of the `--token-…` var alone
 * does nothing. We therefore ALSO set the `--site-*` consumable directly on the
 * canvas root when a custom family is present (mirroring token-presets.css's
 * `--site-heading-font: var(--token-typography-heading-font-family, …)` rule).
 *
 * Enum PRESET tokens (radius/shadow/spacing/typography presets, background
 * mode) drive `html[data-token-*]` selectors that flip OTHER `--site-*`
 * consumables; those are not previewed live by this pass — they still require
 * Publish. That is a deliberate, documented first-cut scope.
 *
 * Diffing: the projector remembers the var names it last set and removes any
 * that drop out of the new map (or all of them on clear), so reverting a token
 * to its default restores inheritance from <html> rather than freezing the last
 * previewed value.
 */
import { useEffect, useRef, type ReactElement } from "react";

import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";
import { useThemePreview } from "./theme-preview-bridge";

/** The marker attribute on the storefront canvas root(s). */
const CANVAS_ROOT_SELECTOR = "[data-theme-canvas-root]";

export function ThemePreviewProjector(): ReactElement | null {
  const tokens = useThemePreview();
  // The var names currently applied, so we can remove stale ones on the next
  // publish (or on clear). Kept in a ref — it's bookkeeping, not render state.
  const appliedVarsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(CANVAS_ROOT_SELECTOR),
    );
    if (roots.length === 0) return;

    const nextVars: Record<string, string> = tokens
      ? designTokensToCssVars({ ...tokens })
      : {};

    // Custom font families: redefine the html-declared `--site-*` consumable
    // at the canvas root so the override actually resolves for descendants
    // (see header comment). Only when the operator set a non-empty family;
    // empty → leave `--site-*` unset so it inherits the preset chain.
    if (tokens) {
      const headingFamily = tokens["typography.heading-font-family"]?.trim();
      const bodyFamily = tokens["typography.body-font-family"]?.trim();
      if (headingFamily) nextVars["--site-heading-font"] = headingFamily;
      if (bodyFamily) nextVars["--site-body-font"] = bodyFamily;
    }

    const nextKeys = new Set(Object.keys(nextVars));

    for (const root of roots) {
      // Remove vars that were set last time but aren't in the new map.
      for (const varName of appliedVarsRef.current) {
        if (!nextKeys.has(varName)) root.style.removeProperty(varName);
      }
      // Apply / update the new map.
      for (const [varName, value] of Object.entries(nextVars)) {
        root.style.setProperty(varName, value);
      }
    }

    appliedVarsRef.current = nextKeys;
  }, [tokens]);

  // Cleanup on unmount: strip any projected vars so a teardown (e.g. leaving
  // edit mode) never leaves the canvas frozen on a draft value.
  useEffect(() => {
    return () => {
      const roots = document.querySelectorAll<HTMLElement>(CANVAS_ROOT_SELECTOR);
      roots.forEach((root) => {
        for (const varName of appliedVarsRef.current) {
          root.style.removeProperty(varName);
        }
      });
      appliedVarsRef.current = new Set();
    };
  }, []);

  return null;
}
