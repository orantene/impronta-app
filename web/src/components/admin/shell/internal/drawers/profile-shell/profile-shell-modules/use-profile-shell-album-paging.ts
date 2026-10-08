"use client";

import { useCallback, useRef, useState } from "react";

import { actionLoadProfileShellAlbumPage } from "@/app/(workspace)/[tenantSlug]/admin/media/profile-shell-media-actions";

import {
  appendAlbumPage,
  type AlbumPagingMap,
  type DrawerAlbum,
} from "./profile-shell-album-media";

/**
 * Per-album "Load more" for the profile shell drawer (TUL-277). Albums open
 * with their cover photos and exact count; this fetches an album's next page
 * with the bundle's offset cursor and appends it. Same busy-guard shape as
 * `useGalleryLoadMore`.
 */
export function useProfileShellAlbumPaging(
  talentId: string | undefined,
  getAlbums: () => DrawerAlbum[],
  setAlbums: (albums: DrawerAlbum[]) => void,
) {
  const [paging, setPagingState] = useState<AlbumPagingMap>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const pagingRef = useRef<AlbumPagingMap>({});
  const busyRef = useRef(false);

  const setPaging = useCallback((next: AlbumPagingMap) => {
    pagingRef.current = next;
    setPagingState(next);
  }, []);

  const loadMore = useCallback(
    async (albumId: string) => {
      const info = pagingRef.current[albumId];
      if (!talentId || !info || info.nextOffset == null || busyRef.current) return;
      busyRef.current = true;
      setLoadingId(albumId);
      try {
        const res = await actionLoadProfileShellAlbumPage(talentId, {
          albumId,
          includeUnassigned: info.includeUnassigned,
          offset: info.nextOffset,
        });
        if (!res.ok) return;
        const next = appendAlbumPage(getAlbums(), pagingRef.current, albumId, res.data);
        setAlbums(next.albums);
        setPaging(next.paging);
      } finally {
        busyRef.current = false;
        setLoadingId(null);
      }
    },
    [talentId, getAlbums, setAlbums, setPaging],
  );

  return { paging, setPaging, loadingId, loadMore };
}
