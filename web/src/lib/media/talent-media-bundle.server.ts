import "server-only";

/**
 * Row loading for the talent media bundle (#224). Singletons (hero / card /
 * reel / polaroids) come from one bounded query; the gallery is read a page at
 * a time with a stable order (sort_order, then id) so offsets never skip or
 * repeat a row. Every read checks `error` and logs it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  TALENT_MEDIA_ALL_CHUNK,
  TALENT_MEDIA_ALL_MAX_ROWS,
  TALENT_MEDIA_SINGLETON_KINDS,
  TALENT_MEDIA_SINGLETON_LIMIT,
  computeHasMore,
  pageWindow,
} from "./talent-media-paging";

export type TalentMediaItem = {
  id: string;
  url: string;
  variantKind: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  /** Parent asset id when this row is a crop / baked-watermark derivative. */
  sourceMediaAssetId: string | null;
};

export type TalentMediaBundle = {
  gallery: TalentMediaItem[];
  hero: TalentMediaItem | null;
  card: TalentMediaItem | null;
  polaroids: Record<string, TalentMediaItem>;
  reel: TalentMediaItem | null;
  /** Total live gallery rows (not just this page). */
  galleryTotal: number;
  /** True when more gallery rows exist after this page. */
  galleryHasMore: boolean;
  /** Offset to pass for the next page, or null. */
  galleryNextOffset: number | null;
};

// Only the columns the callers read (id/url/variant/sort/metadata/source).
export const TALENT_MEDIA_COLUMNS = "id, bucket_id, storage_path, variant_kind, sort_order, metadata, source_media_asset_id";

export type TalentMediaRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string;
  sort_order: number | null;
  metadata: Record<string, unknown> | null;
  source_media_asset_id: string | null;
};

export function toItem(admin: SupabaseClient, r: TalentMediaRow): TalentMediaItem {
  return {
    id: r.id,
    url: admin.storage.from(r.bucket_id).getPublicUrl(r.storage_path).data.publicUrl,
    variantKind: r.variant_kind,
    sortOrder: r.sort_order ?? 0,
    metadata: r.metadata ?? {},
    sourceMediaAssetId: r.source_media_asset_id,
  };
}

/** One gallery page. `null` on a read error (already logged). */
async function readGalleryPage(
  admin: SupabaseClient,
  talentProfileId: string,
  offset: number,
  limit: number | undefined,
): Promise<{ items: TalentMediaItem[]; total: number } | null> {
  const w = pageWindow(offset, limit);
  const { data, error, count } = await admin
    .from("media_assets")
    .select(TALENT_MEDIA_COLUMNS, { count: "exact" })
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range(w.from, w.to);
  if (error) {
    logServerError("media.bundle.galleryPage", error);
    return null;
  }
  const rows = (data as TalentMediaRow[] | null) ?? [];
  return { items: rows.map((r) => toItem(admin, r)), total: count ?? offset + rows.length };
}

async function readSingletons(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<TalentMediaRow[] | null> {
  const { data, error } = await admin
    .from("media_assets")
    .select(TALENT_MEDIA_COLUMNS)
    .eq("owner_talent_profile_id", talentProfileId)
    .in("variant_kind", [...TALENT_MEDIA_SINGLETON_KINDS])
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(TALENT_MEDIA_SINGLETON_LIMIT);
  if (error) {
    logServerError("media.bundle.singletons", error);
    return null;
  }
  return (data as TalentMediaRow[] | null) ?? [];
}

/**
 * Load the bundle. `opts.all` reads the whole gallery in chunks (editors that
 * reorder / delete / group by album need every row); otherwise one page.
 */
export async function loadTalentMediaBundle(
  admin: SupabaseClient,
  talentProfileId: string,
  opts: { offset?: number; limit?: number; all?: boolean } = {},
): Promise<TalentMediaBundle | null> {
  const [singles, first] = await Promise.all([
    readSingletons(admin, talentProfileId),
    readGalleryPage(
      admin,
      talentProfileId,
      opts.all ? 0 : (opts.offset ?? 0),
      opts.all ? TALENT_MEDIA_ALL_CHUNK : opts.limit,
    ),
  ]);
  if (!singles || !first) return null;

  const startOffset = opts.all ? 0 : pageWindow(opts.offset, opts.limit).offset;
  let gallery = first.items;
  const total = first.total;

  if (opts.all) {
    while (gallery.length < total && gallery.length < TALENT_MEDIA_ALL_MAX_ROWS) {
      const next = await readGalleryPage(admin, talentProfileId, gallery.length, TALENT_MEDIA_ALL_CHUNK);
      if (!next) return null;
      if (next.items.length === 0) break;
      gallery = gallery.concat(next.items);
    }
  }

  const bundle: TalentMediaBundle = {
    gallery,
    hero: null,
    card: null,
    polaroids: {},
    reel: null,
    galleryTotal: total,
    galleryHasMore: computeHasMore(startOffset, gallery.length, total),
    galleryNextOffset: null,
  };
  if (bundle.galleryHasMore && gallery.length > 0) bundle.galleryNextOffset = startOffset + gallery.length;

  for (const r of singles) {
    const item = toItem(admin, r);
    if (r.variant_kind === "polaroid") {
      const slot = (item.metadata.polaroidSlot ?? item.metadata.slot ?? r.id) as string;
      bundle.polaroids[slot] = item;
    } else if (r.variant_kind === "hero") {
      if (!bundle.hero) bundle.hero = item;
    } else if (r.variant_kind === "card") {
      if (!bundle.card) bundle.card = item;
    } else if (r.variant_kind === "reel") {
      if (!bundle.reel) bundle.reel = item;
    }
  }
  return bundle;
}
