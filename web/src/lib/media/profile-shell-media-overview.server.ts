import "server-only";

/**
 * Profile shell drawer media read (TUL-277). Replaces "load every row and build
 * albums from the list" with:
 *   1. the paged bundle's first page (singletons incl. polaroid slots, plus the
 *      gallery cursor), reused from `loadTalentMediaBundle`, not forked;
 *   2. a lean (id, albumId) scan folded server-side into one COUNT and a few
 *      cover ids per album (only covers are hydrated into full rows);
 *   3. `loadProfileShellAlbumPage`: one album's photos, paged with the same
 *      offset cursor, read only when that album is opened.
 * Every read is bounded (range / limit), checks `error`, logs it, and fails
 * closed to an empty result with a dev-only warning naming the profile id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  ALBUM_COVER_LIMIT,
  ALBUM_SCAN_CHUNK,
  albumOrFilter,
  createAlbumGrouper,
  type AlbumGroup,
} from "./profile-shell-media-grouping";
import {
  loadTalentMediaBundle,
  TALENT_MEDIA_COLUMNS,
  toItem,
  type TalentMediaBundle,
  type TalentMediaItem,
  type TalentMediaRow,
} from "./talent-media-bundle.server";
import { TALENT_MEDIA_ALL_MAX_ROWS, nextOffset, pageWindow } from "./talent-media-paging";

export type AlbumSummary = {
  /** null = rows with no album id (the client files them under its first album). */
  albumId: string | null;
  /** Exact number of live photos in the album. */
  count: number;
  /** First ALBUM_COVER_LIMIT photos, in gallery order. */
  covers: TalentMediaItem[];
};

export type ProfileShellMediaOverview = {
  /** Singletons + the gallery's first page and cursor (same contract as the editors). */
  bundle: TalentMediaBundle;
  albums: AlbumSummary[];
  unassigned: AlbumSummary;
  /** Exact total of live gallery photos (from the count, never from rows.length). */
  totalPhotos: number;
  /** True when a read failed and this is the empty fail-closed result. */
  degraded: boolean;
};

export type AlbumPage = {
  items: TalentMediaItem[];
  total: number;
  nextOffset: number | null;
};

type ScanRow = { id: string; albumId: string | null };

function emptyBundle(): TalentMediaBundle {
  return {
    gallery: [],
    hero: null,
    card: null,
    polaroids: {},
    reel: null,
    galleryTotal: 0,
    galleryHasMore: false,
    galleryNextOffset: null,
  };
}

export function emptyProfileShellMediaOverview(degraded: boolean): ProfileShellMediaOverview {
  return {
    bundle: emptyBundle(),
    albums: [],
    unassigned: { albumId: null, count: 0, covers: [] },
    totalPhotos: 0,
    degraded,
  };
}

function warnDev(scope: string, talentProfileId: string): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev-only fail-closed signal (AGENTS.md "Silent failure"); production logs via logServerError
    console.warn(`[profile-shell-media] ${scope} failed for talent_profile ${talentProfileId}; returning an empty result`);
  }
}

/** Lean scan: two short columns per row, 1000 rows a request, folded as it streams. */
async function scanAlbums(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ groups: AlbumGroup[]; unassigned: AlbumGroup; truncated: boolean } | null> {
  const grouper = createAlbumGrouper(ALBUM_COVER_LIMIT);
  let scanned = 0;
  let truncated = false;
  for (let from = 0; ; from += ALBUM_SCAN_CHUNK) {
    if (scanned >= TALENT_MEDIA_ALL_MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await admin
      .from("media_assets")
      .select("id, albumId:metadata->>albumId")
      .eq("owner_talent_profile_id", talentProfileId)
      .eq("variant_kind", "gallery")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + ALBUM_SCAN_CHUNK - 1);
    if (error) {
      logServerError("media.profileShell.albumScan", error);
      return null;
    }
    const rows = (data as ScanRow[] | null) ?? [];
    for (const row of rows) grouper.add(row);
    scanned += rows.length;
    if (rows.length < ALBUM_SCAN_CHUNK) break;
  }
  const { groups, unassigned } = grouper.result();
  return { groups, unassigned, truncated };
}

/** Hydrate the cover ids (a handful of rows) in one bounded query. */
async function readCovers(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, TalentMediaItem> | null> {
  const out = new Map<string, TalentMediaItem>();
  if (ids.length === 0) return out;
  const { data, error } = await admin
    .from("media_assets")
    .select(TALENT_MEDIA_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null)
    .limit(ids.length);
  if (error) {
    logServerError("media.profileShell.covers", error);
    return null;
  }
  for (const row of (data as TalentMediaRow[] | null) ?? []) out.set(row.id, toItem(admin, row));
  return out;
}

function summarize(group: AlbumGroup, covers: Map<string, TalentMediaItem>): AlbumSummary {
  return {
    albumId: group.albumId,
    count: group.count,
    covers: group.coverIds.flatMap((id) => {
      const item = covers.get(id);
      return item ? [item] : [];
    }),
  };
}

export async function loadProfileShellMediaOverview(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<ProfileShellMediaOverview> {
  const [bundle, scan] = await Promise.all([
    loadTalentMediaBundle(admin, talentProfileId, { offset: 0 }),
    scanAlbums(admin, talentProfileId),
  ]);
  if (!bundle || !scan) {
    warnDev("overview", talentProfileId);
    return emptyProfileShellMediaOverview(true);
  }
  const coverIds = [...scan.groups, scan.unassigned].flatMap((g) => g.coverIds);
  const covers = await readCovers(admin, coverIds);
  if (!covers) {
    warnDev("overview covers", talentProfileId);
    return emptyProfileShellMediaOverview(true);
  }
  if (scan.truncated) {
    warnDev("overview scan (truncated at the row cap, album counts may undercount)", talentProfileId);
  }
  return {
    bundle,
    albums: scan.groups.map((g) => summarize(g, covers)),
    unassigned: summarize(scan.unassigned, covers),
    totalPhotos: bundle.galleryTotal,
    degraded: false,
  };
}

/**
 * One album's photos, a page at a time. `includeUnassigned` is set for the
 * album the client files unassigned rows under, so its list matches its count.
 * Returns null on a read error (already logged, warned in dev).
 */
export async function loadProfileShellAlbumPage(
  admin: SupabaseClient,
  talentProfileId: string,
  q: { albumId: string; includeUnassigned: boolean; offset?: number; limit?: number },
): Promise<AlbumPage | null> {
  const w = pageWindow(q.offset, q.limit);
  const { data, error, count } = await admin
    .from("media_assets")
    .select(TALENT_MEDIA_COLUMNS, { count: "exact" })
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .or(albumOrFilter(q.albumId, q.includeUnassigned))
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range(w.from, w.to);
  if (error) {
    logServerError("media.profileShell.albumPage", error);
    warnDev(`album page "${q.albumId}"`, talentProfileId);
    return null;
  }
  const rows = (data as TalentMediaRow[] | null) ?? [];
  const total = count ?? w.offset + rows.length;
  return {
    items: rows.map((r) => toItem(admin, r)),
    total,
    nextOffset: nextOffset(w.offset, rows.length, total),
  };
}
