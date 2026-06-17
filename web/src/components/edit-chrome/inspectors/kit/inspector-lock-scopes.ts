/**
 * INS-1 — per-TAB lock scoping (pure).
 *
 * A node's `lockedProps` is a flat list of dot-paths (`style.textColor`,
 * `layout`, `gap`, `dataBinding`, `visibilityCondition`, …). Each inspector tab
 * only edits a subset of those paths, so each tab surfaces only the locks it
 * governs in its own banner/badge — Style shows `style.*`, Layout shows the
 * structural props, Data shows binding/field-binding/visibility. The patch guard
 * (`stripLockedKeysFromPatch`) still enforces ALL locks regardless of tab; these
 * filters only decide which paths a given tab DISPLAYS as locked.
 *
 * Pure (no React, no I/O) so the three panels share one home and a unit test can
 * assert each tab scopes the same locked node identically.
 */

function clean(lockedProps: readonly string[] | null | undefined): string[] {
  return Array.isArray(lockedProps)
    ? lockedProps.filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      )
    : [];
}

/** Paths the Data tab owns: data binding, field bindings, conditional visibility. */
export function isDataLockPath(path: string): boolean {
  return (
    path === "dataBinding" ||
    path === "fieldBindings" ||
    path === "visibilityCondition" ||
    path.startsWith("dataBinding.") ||
    path.startsWith("fieldBindings.")
  );
}

/** Paths the Style tab owns: the `style` object (colour / typography / box). */
export function isStyleLockPath(path: string): boolean {
  return path === "style" || path.startsWith("style.");
}

/** Style-tab locked paths for a node. */
export function styleLockedPathsOf(
  lockedProps: readonly string[] | null | undefined,
): string[] {
  return clean(lockedProps).filter(isStyleLockPath);
}

/** Data-tab locked paths for a node. */
export function dataLockedPathsOf(
  lockedProps: readonly string[] | null | undefined,
): string[] {
  return clean(lockedProps).filter(isDataLockPath);
}

/**
 * Layout-tab locked paths for a node — the structural remainder: everything that
 * is NOT a Data-tab path. (Layout edits top-level structural props like `layout`,
 * `gap`, `columns`, `ratio`, plus responsive overrides under `style.responsive`,
 * so it intentionally overlaps the Style scope on `style.*`.)
 */
export function layoutLockedPathsOf(
  lockedProps: readonly string[] | null | undefined,
): string[] {
  return clean(lockedProps).filter((p) => !isDataLockPath(p));
}
