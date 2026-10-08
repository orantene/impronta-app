"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { actionLoadTalentMediaBundle } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { appendUniquePage } from "@/lib/media/talent-media-paging";
import type { MediaAsset } from "./media-gallery-drawer";

type PageInfo = { galleryTotal: number; galleryNextOffset: number | null };

/**
 * Paging state for the photo gallery editors (TUL-228). The first page comes
 * from the editor's own bundle read; `loadMore` fetches the following page and
 * appends it. The cursor is the server's `galleryNextOffset` (null = done).
 */
export function useGalleryLoadMore(talentId: string, setAssets: Dispatch<SetStateAction<MediaAsset[]>>) {
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const busyRef = useRef(false);

  const setPage = useCallback((page: PageInfo) => {
    setNextOffset(page.galleryNextOffset);
    setTotal(page.galleryTotal);
  }, []);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || busyRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const res = await actionLoadTalentMediaBundle(talentId, { galleryOffset: nextOffset });
      if (!res.ok) return;
      const page: MediaAsset[] = res.data.gallery.map((g) => ({
        id: g.id,
        url: g.url,
        variantKind: "gallery",
        sortOrder: g.sortOrder,
        sourceMediaAssetId: g.sourceMediaAssetId,
      }));
      setAssets((prev) => appendUniquePage(prev, page));
      setPage(res.data);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, talentId, setAssets, setPage]);

  return { hasMore: nextOffset != null, total, loadingMore, loadMore, setPage };
}
