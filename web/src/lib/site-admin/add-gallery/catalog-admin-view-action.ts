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
 * P3 SCALE FIX: the D1 component-TYPE usage counts (`usageCount`) are NO LONGER
 * computed on Lab open. The eager path used to fold the whole platform usage
 * tally into every row, blocking first paint on a four-table walk. Usage is now
 * loaded LAZILY by `loadCatalogUsageCounts()` (a tiny RPC) AFTER first paint and
 * merged into rows client-side; `loadCatalogAdminView` returns rows with
 * `usageCount: undefined` ("—") until the lazy fetch lands. The health
 * dead-weight bucket keys off D7 template totals, not D1, so it is unaffected.
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
import { loadComponentUsageTally } from "./component-usage-action";
import { usageCountForItem } from "./component-usage-scan";
import type { AddGalleryItem } from "./types";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { listCatalogOverlays } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";

export async function loadCatalogAdminView(): Promise<CatalogAdminItem[]> {
  // P3: usage is intentionally NOT in this Promise.all — it loads lazily after
  // first paint via loadCatalogUsageCounts(). Lab open no longer blocks on it.
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
  // No usageTally arg → rows get `usageCount: undefined` (the UI renders "—" until
  // loadCatalogUsageCounts resolves and the client merges the counts in by id).
  return buildCatalogAdminView(universe, overlays, statusByRef, structure);
}

/**
 * P3 — the LAZY D1 usage map: `CatalogAdminItem.id → usageCount`. Loaded by the
 * Catalog AFTER first paint and merged into already-rendered rows (the eager Lab
 * open no longer waits on it). Computes the platform-wide tally ONCE via the
 * cheap SECURITY-DEFINER RPC pair (`loadComponentUsageTally`), then resolves each
 * countable item over the SAME universe `loadCatalogAdminView` builds — so the
 * map is keyed by the exact `item.id` the client rows carry (native + curated
 * section_embed items resolve a number; DB page/section templates have no single
 * countable TYPE and are simply omitted → the row keeps "—").
 *
 * super_admin-gated implicitly: `loadComponentUsageTally` returns an empty tally
 * when unauthorized, so an unauthorized caller gets an all-zero/empty map rather
 * than a leak. Non-fatal by construction — never throws.
 */
export async function loadCatalogUsageCounts(): Promise<Record<string, number>> {
  const [tally, templatesRes] = await Promise.all([
    loadComponentUsageTally(),
    listAllTemplates(),
  ]);

  const rows = templatesRes.ok ? templatesRes.data : [];
  const templateItems: AddGalleryItem[] = rows.map((row) =>
    builderTemplateRowToGalleryItem(row),
  );
  const universe: AddGalleryItem[] = [...ADD_GALLERY_ITEMS, ...templateItems];

  const map: Record<string, number> = {};
  for (const item of universe) {
    const count = usageCountForItem(item, tally);
    if (count !== undefined) map[item.id] = count;
  }
  return map;
}
