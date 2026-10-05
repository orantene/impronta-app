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
  // Canvas-root CSS vars we last set (so we can remove stale ones on clear).
  const appliedVarsRef = useRef<Set<string>>(new Set());
  // <html> data-attrs we last set + a snapshot of their ORIGINAL values, so a
  // clear restores the live theme (set back the original, or remove if the
  // attribute didn't exist before we touched it).
  const appliedAttrsRef = useRef<Set<string>>(new Set());
  const attrSnapshotRef = useRef<Map<string, string | null> | null>(null);
  // The canvas root's OWN inline value for each var before we first overrode
  // it. A talent canvas root is server-painted with her effective site tokens
  // as inline `--token-*` vars; removing them on clear would drop the canvas
  // to the host <html> platform defaults. Restore the original instead.
  const varSnapshotRef = useRef<WeakMap<HTMLElement, Map<string, string>>>(new WeakMap());

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
    }
    const nextVarKeys = new Set(Object.keys(nextVars));
    for (const root of roots) {
      let snap = varSnapshotRef.current.get(root);
      if (!snap) {
        snap = new Map();
        varSnapshotRef.current.set(root, snap);
      }
      for (const varName of appliedVarsRef.current) {
        if (!nextVarKeys.has(varName)) restoreVar(root, varName, snap);
      }
      for (const [varName, value] of Object.entries(nextVars)) {
        if (!snap.has(varName)) snap.set(varName, root.style.getPropertyValue(varName));
        root.style.setProperty(varName, value);
      }
    }
    appliedVarsRef.current = nextVarKeys;

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

  // Cleanup on unmount: strip canvas vars + restore <html> attrs so a teardown
  // (e.g. leaving edit mode) never leaves the editor frozen on a draft value.
  useEffect(() => {
    return () => {
      document
        .querySelectorAll<HTMLElement>(CANVAS_ROOT_SELECTOR)
        .forEach((root) => {
          const snap = varSnapshotRef.current.get(root);
          for (const varName of appliedVarsRef.current) {
            if (snap) restoreVar(root, varName, snap);
            else root.style.removeProperty(varName);
          }
        });
      appliedVarsRef.current = new Set();
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

/** Restore a canvas-root var to its pre-preview inline value, then forget it. */
function restoreVar(root: HTMLElement, varName: string, snap: Map<string, string>): void {
  const original = snap.get(varName);
  if (original) root.style.setProperty(varName, original);
  else root.style.removeProperty(varName);
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
