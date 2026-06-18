/**
 * Pure helpers for the Builder Lab template / starter THUMBNAIL affordance (A2).
 *
 * A `builder_templates` row carries an optional `thumbnail_asset_id` (FK →
 * media_assets). The Template Manager + Starter Kit table let an admin pick a
 * media asset for that column via the shared `MediaPickerDrawer`, persist it
 * through `updateTemplateDraft`, and render the resolved public URL as the
 * row/card thumbnail (the "never placeholder boxes" bar — the kit reads as a
 * visual gallery).
 *
 * Everything here is PURE (no React, no IO) so it is unit-testable in the
 * `test:builder` list: the `updateTemplateDraft` patch shape and the
 * assetId→URL → templateId→URL resolution map.
 */

import type { UpdateTemplateDraftInput } from "@/lib/site-admin/builder-core/templates/registry-rows";

/**
 * The exact `updateTemplateDraft` patch that sets (or clears) a template's
 * thumbnail. Passing `null` / "" clears the column; a non-empty id sets it.
 * Kept pure + tiny so both call sites build the patch identically and a unit
 * test can pin the field shape.
 */
export function templateThumbnailPatch(
  templateId: string,
  assetId: string | null,
): UpdateTemplateDraftInput {
  return {
    id: templateId,
    thumbnail_asset_id: assetId && assetId.trim() ? assetId : null,
  };
}

/**
 * Given the rows (each carrying a possibly-null `thumbnail_asset_id`) and an
 * already-resolved `assetId → publicUrl` map, build the `templateId → publicUrl`
 * map the UI renders from. Rows with no thumbnail asset, or an asset that didn't
 * resolve to a safe URL, are simply absent from the result (the UI falls back to
 * the "Set thumbnail" placeholder affordance).
 *
 * PURE — the async storage/DB lookup that produces `assetUrlById` lives in a
 * server action; this only shapes the result.
 */
export function resolveTemplateThumbnailMap(
  rows: ReadonlyArray<{ id: string; thumbnail_asset_id: string | null }>,
  assetUrlById: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const assetId = row.thumbnail_asset_id;
    if (!assetId) continue;
    const url = assetUrlById.get(assetId);
    if (url && url.length > 0) out.set(row.id, url);
  }
  return out;
}

/**
 * The distinct, non-empty `thumbnail_asset_id`s across a set of rows — the input
 * the batch resolver server action needs (one `media_assets` lookup, deduped).
 */
export function distinctThumbnailAssetIds(
  rows: ReadonlyArray<{ thumbnail_asset_id: string | null }>,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.thumbnail_asset_id;
    if (id && id.trim()) seen.add(id);
  }
  return [...seen];
}
