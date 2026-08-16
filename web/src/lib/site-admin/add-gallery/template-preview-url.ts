/**
 * template-preview-url.ts — resolve a `builder_templates` row's card thumbnail.
 *
 * THE GAP THIS CLOSES
 * --------------------------------------------------------------------------
 * `listGalleryItems` has always accepted a `resolvePreviewImageUrl` dep, and
 * `builderTemplateRowToGalleryItem` has always flipped the card to `image-card`
 * when one comes back. But nothing ever PASSED it: `fetchSurfaceGalleryItems`
 * omitted the dep, so every DB template in every live gallery fell back to the
 * generic SVG wireframe. The hook existed and was never plugged in.
 *
 * THREE SOURCES, IN PRIORITY ORDER
 * --------------------------------------------------------------------------
 *   1. `preview_image_url` — a static, repo-served path (`/builder-previews/…`).
 *      This is what platform-authored templates use. It needs no storage
 *      round-trip, no `media_assets` row, and no tenant ownership, which matters
 *      because a platform template belongs to no tenant and therefore cannot
 *      own a media asset in the first place.
 *   2. `thumbnail_asset_id` — the operator-chosen thumbnail, for templates
 *      donated from a real workspace.
 *   3. `hero_asset_id` — fallback when a donated template has a hero but no
 *      dedicated thumbnail.
 *
 * ONE BATCHED LOOKUP, NOT ONE PER ROW
 * --------------------------------------------------------------------------
 * `listGalleryItems` awaits the resolver inside its per-row loop. A resolver
 * that issued a query per row would therefore serialise N round-trips on every
 * gallery open. `createTemplatePreviewResolver` takes the whole row set up
 * front, resolves every asset id in ONE query, and hands back a synchronous
 * lookup — so the loop stays O(1) queries regardless of catalog size.
 *
 * PURE core + injected client: the mapping logic is testable without Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

/** The subset of a template row this module reads. */
export type TemplatePreviewSource = Pick<
  BuilderTemplateRow,
  "thumbnail_asset_id" | "hero_asset_id"
> & { preview_image_url?: string | null };

/**
 * Accept only same-origin absolute paths and https URLs.
 *
 * The value reaches an `<img src>` in the editor chrome. A `javascript:` or
 * `data:text/html` URL there is stored XSS, and `builder_templates` is
 * super-admin-writable rather than immutable — so this validates rather than
 * trusts. Same posture as `isSafeMediaUrl` in the media lane.
 */
export function isSafeTemplatePreviewUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (!value) return false;
  // Same-origin absolute path, e.g. "/builder-previews/shell-header-x.svg".
  // Reject "//host" (protocol-relative) — that is a remote origin in disguise.
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return /^https:\/\//i.test(value);
}

/** Which asset id, if any, this row wants resolved. */
export function preferredAssetId(
  row: TemplatePreviewSource,
): string | null {
  return row.thumbnail_asset_id ?? row.hero_asset_id ?? null;
}

/**
 * PURE resolution given an already-built asset-id → URL map.
 *
 * Exported for the node test: it is the whole decision, with the I/O lifted out.
 */
export function resolvePreviewUrlFromMap(
  row: TemplatePreviewSource,
  assetUrls: ReadonlyMap<string, string>,
): string | undefined {
  const direct = row.preview_image_url;
  if (isSafeTemplatePreviewUrl(direct)) return direct;

  const assetId = preferredAssetId(row);
  if (!assetId) return undefined;
  const url = assetUrls.get(assetId);
  return isSafeTemplatePreviewUrl(url) ? url : undefined;
}

/**
 * Build the batched resolver `listGalleryItems` expects.
 *
 * Never throws and never rejects: a failed thumbnail lookup must degrade the
 * card to its wireframe, not blank the gallery. `listGalleryItems` already
 * treats a template-fetch failure that way; the thumbnail is strictly less
 * important than the template itself.
 */
export async function createTemplatePreviewResolver(
  supabase: SupabaseClient | null,
  rows: ReadonlyArray<TemplatePreviewSource>,
): Promise<(row: TemplatePreviewSource) => string | undefined> {
  const assetIds = new Set<string>();
  for (const row of rows) {
    // Rows already carrying a static preview need no lookup at all — this is
    // why the platform variants cost zero queries.
    if (isSafeTemplatePreviewUrl(row.preview_image_url)) continue;
    const id = preferredAssetId(row);
    if (id) assetIds.add(id);
  }

  const assetUrls = new Map<string, string>();
  if (supabase && assetIds.size > 0) {
    try {
      const { data } = await supabase
        .from("media_assets")
        .select("id, bucket_id, storage_path, public_url")
        .in("id", [...assetIds]);
      for (const raw of data ?? []) {
        const asset = raw as {
          id: string;
          bucket_id: string | null;
          storage_path: string | null;
          public_url: string | null;
        };
        if (isSafeTemplatePreviewUrl(asset.public_url)) {
          assetUrls.set(asset.id, asset.public_url as string);
          continue;
        }
        if (!asset.bucket_id || !asset.storage_path) continue;
        const { data: pub } = supabase.storage
          .from(asset.bucket_id)
          .getPublicUrl(asset.storage_path);
        if (isSafeTemplatePreviewUrl(pub?.publicUrl)) {
          assetUrls.set(asset.id, pub.publicUrl);
        }
      }
    } catch {
      // Degrade to wireframes. See the doc comment.
    }
  }

  return (row: TemplatePreviewSource) => resolvePreviewUrlFromMap(row, assetUrls);
}
