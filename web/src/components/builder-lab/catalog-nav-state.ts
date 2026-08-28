/**
 * catalog-nav-state — SSR-safe localStorage I/O + URL/precedence resolution for
 * the two-tier Catalog nav.
 *
 * Mirrors the catalog-filter-presets.ts split: the pure taxonomy lives in
 * catalog-nav.ts; the localStorage reads/writes here are SSR-safe (every export
 * guards `typeof window`), called only from effects/handlers, never during
 * render. `resolveInitialView` is pure (no I/O) and unit-tested.
 *
 *   • loadLastViewPerGroup / saveLastViewForGroup — remember the last view a
 *     user was on within each group, so re-entering a group restores it.
 *   • parseViewParam — read a `?view=` query value, canonicalizing legacy tab ids.
 *   • resolveInitialView — the mount precedence: URL > preset > defaultView >
 *     firstStructureView.
 */

import {
  type CatalogGroup,
  type CatalogView,
  GROUP_ORDER,
  coerceCatalogView,
} from "./catalog-nav";

const LAST_VIEW_KEY = "builder-lab/catalog-last-view-per-group";

/** Per-group last-visited view map. Values are validated on read (a stale /
 *  removed view is dropped) so callers can trust what they get back. */
export type LastViewPerGroup = Partial<Record<CatalogGroup, CatalogView>>;

export function loadLastViewPerGroup(): LastViewPerGroup {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_VIEW_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: LastViewPerGroup = {};
    for (const group of GROUP_ORDER) {
      const v = (parsed as Record<string, unknown>)[group];
      if (typeof v === "string") {
        const coerced = coerceCatalogView(v);
        if (coerced) out[group] = coerced;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLastViewForGroup(
  group: CatalogGroup,
  view: CatalogView,
): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadLastViewPerGroup();
    const next: LastViewPerGroup = { ...current, [group]: view };
    window.localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded — ignore */
  }
}

/** Parse a raw `?view=` value into a CatalogView, or null. Canonicalizes
 *  legacy six-tab ids (layout → blocks, page_templates → designs, …). */
export function parseViewParam(raw: string | null | undefined): CatalogView | null {
  if (!raw) return null;
  return coerceCatalogView(raw);
}

/** Resolve the view to activate on mount. PURE precedence (highest first):
 *    1. urlView      — an explicit `?view=` (deep link / refresh)
 *    2. presetTab    — the O7 active filter preset's tab (if a valid view)
 *    3. defaultView  — the shell-provided default (e.g. "playground")
 *    4. firstStructureView — last-resort landing (the Structure group's first
 *       view, typically "all").
 *  Each candidate is validated; the first valid one wins. */
export function resolveInitialView({
  urlView,
  presetTab,
  defaultView,
  firstStructureView,
}: {
  urlView: CatalogView | null;
  presetTab: string | null | undefined;
  defaultView: CatalogView | null | undefined;
  firstStructureView: CatalogView;
}): CatalogView {
  const url = urlView ? coerceCatalogView(urlView) : null;
  if (url) return url;
  if (presetTab) {
    const preset = coerceCatalogView(presetTab);
    if (preset) return preset;
  }
  if (defaultView) {
    const fallback = coerceCatalogView(defaultView);
    if (fallback) return fallback;
  }
  return firstStructureView;
}
