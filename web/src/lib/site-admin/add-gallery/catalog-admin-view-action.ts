"use server";

/**
 * loadCatalogAdminView (P3) — the Builder Lab Catalog tab's data source.
 *
 * Returns the FULL ungated universe — every built-in code item ∪ every
 * published template — joined with its overlay state and computed effective
 * per-surface visibility. Unlike the live gallery fetch (which subtracts hidden
 * items), this lists hidden items too so a super-admin can re-enable them.
 *
 * Specific-module imports (not the barrel) so this server module never pulls in
 * the DOM-only drag/perform-insert code the barrel re-exports.
 */

import { ADD_GALLERY_ITEMS } from "./registry";
import {
  buildCatalogAdminView,
  builderTemplateRowToGalleryItem,
  type CatalogAdminItem,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";
import { listPublishedTemplates } from "@/lib/site-admin/builder-core/templates/registry-actions";
import { listCatalogOverlays } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";

export async function loadCatalogAdminView(): Promise<CatalogAdminItem[]> {
  const [templatesRes, overlays] = await Promise.all([
    listPublishedTemplates({}),
    listCatalogOverlays(),
  ]);

  const templateItems: AddGalleryItem[] = templatesRes.ok
    ? templatesRes.data.map((row) => builderTemplateRowToGalleryItem(row))
    : [];

  const universe: AddGalleryItem[] = [...ADD_GALLERY_ITEMS, ...templateItems];
  return buildCatalogAdminView(universe, overlays);
}
