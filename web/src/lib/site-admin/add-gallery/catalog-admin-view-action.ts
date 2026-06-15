"use server";

/**
 * loadCatalogAdminView (P3 / W2) — the Builder Lab Catalog tab's data source.
 *
 * Returns the FULL ungated universe — every built-in code item ∪ every template
 * (ALL statuses: draft / in_review / published / archived) — joined with its
 * overlay state, lifecycle status, and computed effective per-surface
 * visibility. Unlike the live gallery fetch (which subtracts hidden items AND
 * only sees published templates), this lists everything so a super-admin has a
 * true inventory and can manage drafts/hidden items.
 *
 * Specific-module imports (not the barrel) so this server module never pulls in
 * the DOM-only drag/perform-insert code the barrel re-exports.
 */

import { ADD_GALLERY_ITEMS } from "./registry";
import {
  buildCatalogAdminView,
  builderTemplateRowToGalleryItem,
  dbTemplateGalleryItemId,
  type CatalogAdminItem,
} from "./registry-db-merge";
import { applyStructureToItems } from "./catalog-structure";
import { listCatalogStructure } from "./catalog-structure-actions";
import type { AddGalleryItem } from "./types";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { listCatalogOverlays } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";

export async function loadCatalogAdminView(): Promise<CatalogAdminItem[]> {
  const [templatesRes, overlays, structure] = await Promise.all([
    listAllTemplates(), // super_admin-gated; ALL statuses
    listCatalogOverlays(),
    listCatalogStructure(),
  ]);

  const rows = templatesRes.ok ? templatesRes.data : [];
  const templateItems: AddGalleryItem[] = rows.map((row) =>
    builderTemplateRowToGalleryItem(row),
  );
  const statusByRef: Record<string, string> = {};
  for (const row of rows) {
    statusByRef[dbTemplateGalleryItemId(row.id)] = row.status;
  }

  // Apply structure (tab/category placement) to the universe BEFORE building the
  // admin view, so the Lab groups every component under its assigned tab/category
  // — the same placement the live "+" galleries see. Empty structure ⇒ identity.
  const universe: AddGalleryItem[] = applyStructureToItems(
    [...ADD_GALLERY_ITEMS, ...templateItems],
    structure,
  );
  return buildCatalogAdminView(universe, overlays, statusByRef);
}
