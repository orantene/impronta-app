/**
 * Pure helpers for the profile shell drawer's media read (TUL-277).
 *
 * The drawer used to load EVERY media row and build albums from the full list.
 * It now reads a lean (id, albumId) scan on the server, folds it into one
 * count and a few cover ids per album, and loads an album's photos only when
 * that album is opened (same offset cursor as `actionLoadTalentMediaBundle`).
 * Nothing here touches Supabase, so it is unit-testable.
 */

/** Cover thumbnails kept per album. */
export const ALBUM_COVER_LIMIT = 4;
/** Rows per lean scan request (PostgREST's default max-rows). */
export const ALBUM_SCAN_CHUNK = 1000;

export type AlbumScanRow = { id: string; albumId: string | null };

export type AlbumGroup = { albumId: string | null; count: number; coverIds: string[] };

export type AlbumGrouping = {
  /** Explicit album ids, in order of first appearance (sort_order, id). */
  groups: AlbumGroup[];
  /** Rows with no album id: the client files them under its first album. */
  unassigned: AlbumGroup;
  total: number;
};

/** `metadata->>albumId` arrives as text or null; empty text means "no album". */
export function normalizeAlbumId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Incremental grouper so the scan never has to hold every row in memory. */
export function createAlbumGrouper(coverLimit: number = ALBUM_COVER_LIMIT) {
  const byAlbum = new Map<string, AlbumGroup>();
  const unassigned: AlbumGroup = { albumId: null, count: 0, coverIds: [] };
  let total = 0;
  return {
    add(row: AlbumScanRow): void {
      total += 1;
      const albumId = normalizeAlbumId(row.albumId);
      let group = unassigned;
      if (albumId !== null) {
        let existing = byAlbum.get(albumId);
        if (!existing) {
          existing = { albumId, count: 0, coverIds: [] };
          byAlbum.set(albumId, existing);
        }
        group = existing;
      }
      group.count += 1;
      if (group.coverIds.length < coverLimit) group.coverIds.push(row.id);
    },
    result(): AlbumGrouping {
      return { groups: [...byAlbum.values()], unassigned, total };
    },
  };
}

export function groupAlbumRows(rows: AlbumScanRow[], coverLimit: number = ALBUM_COVER_LIMIT): AlbumGrouping {
  const grouper = createAlbumGrouper(coverLimit);
  for (const row of rows) grouper.add(row);
  return grouper.result();
}

/** Quote a value for use inside a PostgREST `.or()` filter string. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The `.or()` filter for "rows that belong to this album". The album the
 * client files unassigned rows under also matches null and empty album ids.
 */
export function albumOrFilter(albumId: string, includeUnassigned: boolean): string {
  const own = `metadata->>albumId.eq.${quoteFilterValue(albumId)}`;
  return includeUnassigned
    ? `metadata->>albumId.is.null,metadata->>albumId.eq.${quoteFilterValue("")},${own}`
    : own;
}
