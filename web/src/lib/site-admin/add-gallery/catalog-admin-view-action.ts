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

  // Resolve placement (tab/category) the SAME way the live "+" gallery does so
  // the Lab groups every component under its live-rendered tab/category (F4).
  // The live read path applies the overlay FIRST, then the structure — so a
  // structure `item:<id>` placement WINS over an overlay `category_override`.
  // buildCatalogAdminView owns that precedence internally (base → overlay →
  // structure); we therefore pass the RAW universe (not pre-structured) plus the
  // structure map, so `baseCategory` stays the genuine default and the inversion
  // — overlay winning in the Lab while structure wins live — is gone. Empty
  // structure ⇒ identity.
  const universe: AddGalleryItem[] = [...ADD_GALLERY_ITEMS, ...templateItems];
  return buildCatalogAdminView(universe, overlays, statusByRef, structure);
}
