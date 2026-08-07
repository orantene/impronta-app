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
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";

/**
 * Static thumbnail fallback for the BUILT-IN starters. The import action keys
 * each built-in `builder_templates` row on the deterministic slug
 * `builtin-<design.id>`, and the client-safe design summaries carry a curated
 * static `thumbnailUrl` (a committed `web/public` marketing photo). Those
 * static paths cannot live in `thumbnail_asset_id` (FK → media_assets), which
 * left EVERY built-in row rendering the empty "Set thumb" placeholder — a
 * wall of gray boxes in a surface that is supposed to read as a visual
 * gallery. An admin-picked media asset still wins; this only fills the gap.
 */
const BUILTIN_THUMB_URL_BY_SLUG: ReadonlyMap<string, string> = new Map(
  PAGE_DESIGN_SUMMARIES.filter(
    (s): s is typeof s & { thumbnailUrl: string } =>
      typeof s.thumbnailUrl === "string" && s.thumbnailUrl.length > 0,
  ).map((s) => [`builtin-${s.id}`, s.thumbnailUrl] as const),
);

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
  rows: ReadonlyArray<{
    id: string;
    thumbnail_asset_id: string | null;
    /** Row slug — used for the built-in static-thumbnail fallback. */
    slug?: string | null;
  }>,
  assetUrlById: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const assetId = row.thumbnail_asset_id;
    const url = assetId ? assetUrlById.get(assetId) : undefined;
    if (url && url.length > 0) {
      out.set(row.id, url);
      continue;
    }
    // Built-in fallback: static curated thumbnail keyed by `builtin-<id>` slug.
    const builtinUrl = row.slug ? BUILTIN_THUMB_URL_BY_SLUG.get(row.slug) : undefined;
    if (builtinUrl) out.set(row.id, builtinUrl);
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
