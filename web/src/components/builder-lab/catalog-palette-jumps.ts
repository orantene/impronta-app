/**
 * Command-palette / all-index / health-issue jump handlers + palette index
 * builders for ComponentCatalog. Carved VERBATIM out of component-catalog.tsx
 * (god-file decomposition). These are pure render-scope derivations and plain
 * jump callbacks (no hooks), so moving them into a factory called once per render
 * is behavior-identical. The controller passes the live `items` / `allTemplates`
 * plus its `selectView` / `startEdit` and consumes the returned bundle.
 */

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { AllIndexRow } from "./catalog-all-index";
import type { CatalogHealthIssue } from "./catalog-health";
import { type CatalogView, isSpecialTab } from "./catalog-nav";

export function buildPaletteJumps(params: {
  items: CatalogAdminItem[];
  allTemplates: BuilderTemplateRow[];
  selectView: (view: CatalogView) => void;
  startEdit: (item: CatalogAdminItem) => void;
}) {
  const { items, allTemplates, selectView, startEdit } = params;

  // ── O6: command-palette index inputs + jump handler ─────────────────────────
  // Gallery components carry their gallery `tab` so a hit jumps straight to that
  // Catalog view. builder_templates rows split by kind: page/shell kinds are the
  // Playground's drafts (jump → "playground"), the rest are governed templates
  // (jump → the "templates" manager). The pure index lives in command-search.
  const paletteComponents = items.map((r) => ({
    id: r.id,
    tab: r.tab,
    effectiveLabel: r.effectiveLabel,
    effectiveCategory: r.effectiveCategory,
    baseLabel: r.baseLabel,
  }));
  const isDraftKind = (k: string) =>
    k === "page_template" || k === "shell_header" || k === "shell_footer";
  const paletteDrafts = allTemplates
    .filter((t) => isDraftKind(t.kind))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: t.status,
      kind: t.kind,
    }));
  const paletteTemplates = allTemplates
    .filter((t) => !isDraftKind(t.kind))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: t.status,
      kind: t.kind,
    }));

  /** Jump to a catalog view from a palette result. For a gallery tab the target
   *  row is also pre-expanded (O9 expand set); special views (Playground /
   *  Templates) just activate — they own their own row state. The chosen view
   *  may not be in the active group's tier-2 list if it's a gallery tab
   *  currently empty under the active filter, but selectView is tolerant
   *  (currentView falls back, and the group is re-derived from the new view). */
  const handlePaletteJump = (tab: string, rowId: string) => {
    selectView(tab as CatalogView);
    if (!isSpecialTab(tab as CatalogView)) {
      // Gallery component — open its override editor (seed the form).
      const row = items.find((r) => r.id === rowId);
      if (row) startEdit(row);
    }
  };

  // O10 — jump from an All-index row to its owning Catalog view. Code/template
  // rows that ARE gallery items (have a real `tab`) jump to that gallery view
  // with the row pre-expanded; draft/template-only rows route to the Templates
  // manager. Mirrors handlePaletteJump's expand-on-arrival behavior.
  const handleAllIndexJump = (row: AllIndexRow) => {
    if (row.tab) {
      selectView(row.tab as CatalogView);
      const gridRow = items.find((r) => r.id === row.id);
      if (gridRow) startEdit(gridRow);
      return;
    }
    selectView("templates");
  };

  // D8 — jump from a Catalog-health issue to the offending row. A flagged row
  // that IS a live gallery item (its catalog id is in `items`) jumps to its tab
  // with the override editor pre-opened — mirroring handleAllIndexJump. Anything
  // else (a draft/non-gallery template) routes to the Templates manager. Reuses
  // the existing jump machinery; adds no new navigation surface.
  const handleHealthJump = (issue: CatalogHealthIssue) => {
    const gridRow = issue.rowId
      ? items.find((r) => r.id === issue.rowId)
      : undefined;
    if (gridRow) {
      selectView(gridRow.tab as CatalogView);
      startEdit(gridRow);
      return;
    }
    // P1 — an orphaned-category issue with no concrete row is a taxonomy
    // problem; route it to the Taxonomy manager (Admin group) rather than the
    // Templates manager. Everything else still routes to Templates.
    if (issue.bucket === "orphaned_category") {
      selectView("taxonomy");
      return;
    }
    selectView("templates");
  };

  return {
    paletteComponents,
    paletteDrafts,
    paletteTemplates,
    handlePaletteJump,
    handleAllIndexJump,
    handleHealthJump,
  };
}
