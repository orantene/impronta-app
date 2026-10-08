/**
 * Pure client-side half of the profile shell media paging (TUL-277).
 *
 * Folds the server overview (per-album COUNT + a few covers) into the drawer's
 * `albumsPro` list and tracks, per album, the exact total and the offset cursor
 * for "Load more". Counts come from the server's grouped counts, never from
 * `items.length` of a partial page.
 */

import type { PhotoMeta } from "../../../state/types";
import { ALBUM_COVER_LIMIT } from "@/lib/media/profile-shell-media-grouping";

export type DrawerAlbum = { id: string; name: string; items: PhotoMeta[] };

/** Wire shape of one album summary (structural subset of the server type). */
export type AlbumSummaryWire = {
  albumId: string | null;
  count: number;
  covers: { id: string; url: string; sortOrder: number }[];
};

export type OverviewWire = { albums: AlbumSummaryWire[]; unassigned: AlbumSummaryWire };

export type AlbumPageWire = {
  items: { id: string; url: string }[];
  total: number;
  nextOffset: number | null;
};

export type AlbumPaging = {
  /** Exact photos in the album on the server. */
  total: number;
  /** Offset for the next page, or null when everything is loaded. */
  nextOffset: number | null;
  /** True for the album that also owns rows with no album id. */
  includeUnassigned: boolean;
};

export type AlbumPagingMap = Record<string, AlbumPaging>;

/** Same readable name the drawer has always derived for an album it only knows by id. */
export function albumNameFromId(id: string): string {
  return id.replace(/-[a-z0-9]{4,}$/, "").replace(/-/g, " ") || "Untitled";
}

function toPhoto(item: { id: string; url: string }): PhotoMeta {
  return { url: item.url, mediaAssetId: item.id };
}

/** Merge two cover lists in the server's gallery order (sort_order, then id). */
function mergeCovers(a: AlbumSummaryWire["covers"], b: AlbumSummaryWire["covers"]): AlbumSummaryWire["covers"] {
  return [...a, ...b]
    .sort((x, y) => x.sortOrder - y.sortOrder || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, ALBUM_COVER_LIMIT);
}

/**
 * Replace each album's photo list with its covers and compute the paging map.
 * Albums that only exist in the media (not in `albums`) are appended, as before.
 * Rows with no album id belong to the first album.
 */
export function applyOverviewToAlbums(
  albums: DrawerAlbum[],
  overview: OverviewWire,
): { albums: DrawerAlbum[]; paging: AlbumPagingMap } {
  // No gallery photos: keep whatever the albums already hold (seeded items).
  const overall = overview.unassigned.count + overview.albums.reduce((n, g) => n + g.count, 0);
  if (overall === 0) return { albums, paging: {} };
  const fallbackId = albums[0]?.id ?? "main";
  const known = new Set(albums.map((a) => a.id));
  const base: DrawerAlbum[] = [...albums];
  for (const g of overview.albums) {
    if (g.albumId && !known.has(g.albumId)) {
      known.add(g.albumId);
      base.push({ id: g.albumId, name: albumNameFromId(g.albumId), items: [] });
    }
  }
  const byId = new Map<string, AlbumSummaryWire>();
  for (const g of overview.albums) if (g.albumId) byId.set(g.albumId, g);

  const paging: AlbumPagingMap = {};
  const next = base.map((album) => {
    const own = byId.get(album.id);
    const isFallback = album.id === fallbackId;
    const count = (own?.count ?? 0) + (isFallback ? overview.unassigned.count : 0);
    const covers = isFallback
      ? mergeCovers(own?.covers ?? [], overview.unassigned.covers)
      : (own?.covers ?? []);
    paging[album.id] = {
      total: count,
      nextOffset: count > covers.length ? covers.length : null,
      includeUnassigned: isFallback,
    };
    return { ...album, items: covers.map(toPhoto) };
  });
  return { albums: next, paging };
}

/** Append one loaded page to an album and advance its cursor. */
export function appendAlbumPage(
  albums: DrawerAlbum[],
  paging: AlbumPagingMap,
  albumId: string,
  page: AlbumPageWire,
): { albums: DrawerAlbum[]; paging: AlbumPagingMap } {
  const current = paging[albumId];
  if (!current) return { albums, paging };
  const incoming = page.items.map(toPhoto);
  const nextAlbums = albums.map((a) => {
    if (a.id !== albumId) return a;
    const seen = new Set(a.items.map((p) => p.mediaAssetId ?? p.url));
    const merged = a.items.concat(incoming.filter((p) => !seen.has(p.mediaAssetId ?? p.url)));
    return { ...a, items: merged };
  });
  return {
    albums: nextAlbums,
    paging: { ...paging, [albumId]: { ...current, total: page.total, nextOffset: page.nextOffset } },
  };
}

/** An album's photo count: the server's exact count when known, else what it holds. */
export function albumPhotoCount(paging: AlbumPagingMap, album: DrawerAlbum): number {
  return paging[album.id]?.total ?? album.items.length;
}

/** Total photos across albums from the exact per-album counts. */
export function totalPhotosOf(paging: AlbumPagingMap, albums: DrawerAlbum[]): number {
  return albums.reduce((n, a) => n + albumPhotoCount(paging, a), 0);
}
