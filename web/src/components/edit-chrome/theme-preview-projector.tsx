"use client";

/**
 * theme-preview-projector.tsx — GAP A (live theme reactivity), DOM side.
 *
 * Subscribes to the theme-preview bridge and projects the working DRAFT onto the
 * editor at runtime so theme edits preview instantly, with zero tree re-render
 * and without changing a single served byte (the projection lives only in the
 * operator's DOM; Publish is still the only path that changes what visitors get).
 *
 * Two projection channels, matching how tokens reach the DOM in production:
 *
 *  1. CSS-VAR tokens → the CANVAS ROOT (`[data-theme-canvas-root]`).
 *     Every bound node renders `var(--token-x, fallback)`; setting `--token-x`
 *     on an ancestor of the whole canvas overrides the value inherited from
 *     <html> for the subtree. Covers all palette colors, header surface colors,
 *     per-level type sizes. Custom font families are a special case (their
 *     consumer `--site-heading/body-font` is declared on <html>), so we also set
 *     that consumable on the canvas root when a custom family is present.
 *
 *     Talent builder canvases paint LIVE site tokens as React inline styles on
 *     the same canvas root (not on <html>). So on clear we must RESTORE the
 *     pre-preview inline values — `removeProperty` would strip the site look
 *     and leave platform defaults until an unrelated remount.
 *
 *  2. ENUM PRESET tokens → `<html>` data-attributes.
 *     Radius / shadow / spacing / typography presets, background mode, motion,
 *     etc. flip `--site-*` consumables via `html[data-token-*]` rules in
 *     token-presets.css. A canvas-root CSS-var write can't trigger those rules,
 *     so we instead write the draft's `data-token-*` attributes onto the live
 *     <html> at runtime — the SAME element + attributes the SSR resolver targets,
 *     so the existing CSS applies with NO duplication and NO drift. We snapshot
 *     the original <html> attribute values first and restore them on clear, so
 *     closing the drawer reverts to the live theme exactly.
 *
 * Writing to <html> at runtime is editor-only and never reaches the served HTML
 * or another visitor's DOM, so the byte-stability guarantee holds.
 *
 * Diffing: we remember the canvas vars + html attrs we last applied and revert
 * any that drop out of the new map (or all of them on clear), so reverting a
 * token to its default restores the live value rather than freezing the draft.
 */
import { useEffect, useRef, type ReactElement } from "react";

import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { useThemePreview } from "./theme-preview-bridge";

/** The marker attribute on the storefront canvas root(s). */
const CANVAS_ROOT_SELECTOR = "[data-theme-canvas-root]";

export function ThemePreviewProjector(): ReactElement | null {
  const tokens = useThemePreview();
  // Canvas-root CSS vars we last set (so we can restore baseline on clear).
  const appliedVarsRef = useRef<Set<string>>(new Set());
  // Per-root snapshot of each var's ORIGINAL inline value before we overwrote
  // it (null = property was absent). Closing the drawer restores these so the
  // talent canvas keeps its site tokens instead of falling through to platform
  // defaults.
  const varSnapshotRef = useRef<Map<HTMLElement, Map<string, string | null>> | null>(
    null,
  );
  // <html> data-attrs we last set + a snapshot of their ORIGINAL values, so a
  // clear restores the live theme (set back the original, or remove if the
  // attribute didn't exist before we touched it).
  const appliedAttrsRef = useRef<Set<string>>(new Set());
  const attrSnapshotRef = useRef<Map<string, string | null> | null>(null);

  useEffect(() => {
    // ── Channel 1: canvas-root CSS vars ──────────────────────────────────
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(CANVAS_ROOT_SELECTOR),
    );
    const nextVars: Record<string, string> = tokens
      ? designTokensToCssVars({ ...tokens })
      : {};
    if (tokens) {
      const headingFamily = tokens["typography.heading-font-family"]?.trim();
      const bodyFamily = tokens["typography.body-font-family"]?.trim();
      if (headingFamily) nextVars["--site-heading-font"] = headingFamily;
      if (bodyFamily) nextVars["--site-body-font"] = bodyFamily;
      if (varSnapshotRef.current === null) varSnapshotRef.current = new Map();
    }
    const nextVarKeys = new Set(Object.keys(nextVars));
    const varSnap = varSnapshotRef.current;

    if (tokens && varSnap) {
      for (const root of roots) {
        let rootSnap = varSnap.get(root);
        if (!rootSnap) {
          rootSnap = new Map();
          varSnap.set(root, rootSnap);
        }
        for (const varName of appliedVarsRef.current) {
          if (!nextVarKeys.has(varName)) {
            restoreCssVar(root, varName, rootSnap);
          }
        }
        for (const [varName, value] of Object.entries(nextVars)) {
          if (!rootSnap.has(varName)) {
            const existing = root.style.getPropertyValue(varName);
            rootSnap.set(varName, existing === "" ? null : existing);
          }
          root.style.setProperty(varName, value);
        }
      }
      appliedVarsRef.current = nextVarKeys;
    } else {
      // Clear → restore every var we touched to its pre-preview inline value.
      if (varSnap) {
        for (const [root, rootSnap] of varSnap) {
          for (const varName of appliedVarsRef.current) {
            restoreCssVar(root, varName, rootSnap);
          }
        }
      }
      appliedVarsRef.current = new Set();
      varSnapshotRef.current = null;
    }

    // ── Channel 2: <html> enum data-attrs ────────────────────────────────
    const html = document.documentElement;
    if (tokens) {
      if (attrSnapshotRef.current === null) attrSnapshotRef.current = new Map();
      const snap = attrSnapshotRef.current;
      const nextAttrs = designTokensToDataAttrs({ ...tokens });
      const nextAttrKeys = new Set(Object.keys(nextAttrs));
      // Revert attrs we set last time that are gone now.
      for (const attr of appliedAttrsRef.current) {
        if (!nextAttrKeys.has(attr)) restoreAttr(html, attr, snap);
      }
      // Apply next attrs, snapshotting each original the first time we touch it.
      for (const [attr, value] of Object.entries(nextAttrs)) {
        if (!snap.has(attr)) snap.set(attr, html.getAttribute(attr));
        html.setAttribute(attr, value);
      }
      appliedAttrsRef.current = nextAttrKeys;
    } else {
      // Clear → restore every attr we touched, then drop the snapshot.
      const snap = attrSnapshotRef.current;
      if (snap) {
        for (const attr of appliedAttrsRef.current) restoreAttr(html, attr, snap);
      }
      appliedAttrsRef.current = new Set();
      attrSnapshotRef.current = null;
    }
  }, [tokens]);

  // Cleanup on unmount: restore canvas vars + <html> attrs so a teardown
  // (e.g. leaving edit mode) never leaves the editor frozen on a draft value.
  useEffect(() => {
    return () => {
      const varSnap = varSnapshotRef.current;
      document
        .querySelectorAll<HTMLElement>(CANVAS_ROOT_SELECTOR)
        .forEach((root) => {
          const rootSnap = varSnap?.get(root);
          for (const varName of appliedVarsRef.current) {
            if (rootSnap) restoreCssVar(root, varName, rootSnap);
            else root.style.removeProperty(varName);
          }
        });
      appliedVarsRef.current = new Set();
      varSnapshotRef.current = null;
      const html = document.documentElement;
      const snap = attrSnapshotRef.current;
      if (snap) {
        for (const attr of appliedAttrsRef.current) restoreAttr(html, attr, snap);
      }
      appliedAttrsRef.current = new Set();
      attrSnapshotRef.current = null;
    };
  }, []);

  return null;
}

/** Restore a single CSS var from the snapshot, then forget it. */
function restoreCssVar(
  root: HTMLElement,
  varName: string,
  snap: Map<string, string | null>,
): void {
  const original = snap.get(varName);
  if (original === null || original === undefined) {
    root.style.removeProperty(varName);
  } else {
    root.style.setProperty(varName, original);
  }
  snap.delete(varName);
}

/** Restore a single data-attr from the snapshot, then forget it. */
function restoreAttr(
  html: HTMLElement,
  attr: string,
  snap: Map<string, string | null>,
): void {
  const original = snap.get(attr);
  if (original === null || original === undefined) {
    html.removeAttribute(attr);
  } else {
    html.setAttribute(attr, original);
  }
  snap.delete(attr);
}
