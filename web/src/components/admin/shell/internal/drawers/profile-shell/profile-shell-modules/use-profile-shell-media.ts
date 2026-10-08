"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { actionLoadProfileShellMedia } from "@/app/(workspace)/[tenantSlug]/admin/media/profile-shell-media-actions";
import type { ProfileShellMediaOverview } from "@/lib/media/profile-shell-media-overview.server";
import type { MediaAsset } from "@/components/talent/media-gallery-drawer";
import { useGalleryLoadMore } from "@/components/talent/use-gallery-load-more";

import { applyOverviewToAlbums } from "./profile-shell-album-media";
import type { ProfileState } from "./profile-state";
import { useProfileShellAlbumPaging } from "./use-profile-shell-album-paging";

/**
 * Media state of the profile shell drawer (TUL-277): the server overview
 * (album counts + covers, singletons, the gallery's first page) replaces the
 * old "load every row" bundle. Owns the gallery and per-album Load more
 * cursors and re-reads the overview when the gallery drawer closes, so album
 * counts follow uploads and deletes without re-deriving them from a partial list.
 */
export function useProfileShellMedia(args: {
  talentId: string | undefined;
  enabled: boolean;
  stateRef: { current: ProfileState };
  patch: (p: Partial<ProfileState>, opts?: { silent?: boolean }) => void;
  setGalleryAssets: Dispatch<SetStateAction<MediaAsset[]>>;
  setAvatarPhotoUrl: (url: string) => void;
  setHeroPhotoUrl: (url: string) => void;
  galleryDrawerOpen: boolean;
}) {
  const { talentId, enabled, stateRef, patch, setGalleryAssets, setAvatarPhotoUrl, setHeroPhotoUrl, galleryDrawerOpen } = args;
  const galleryPaging = useGalleryLoadMore(talentId ?? "", setGalleryAssets);
  const albumPaging = useProfileShellAlbumPaging(
    talentId,
    () => stateRef.current.albumsPro,
    (albumsPro) => patch({ albumsPro }, { silent: true }),
  );
  const setGalleryPage = galleryPaging.setPage;
  const setAlbumPaging = albumPaging.setPaging;

  const applyOverview = useCallback(
    (data: ProfileShellMediaOverview) => {
      const { gallery, hero, polaroids: polaroidsMap, card } = data.bundle;
      if (card?.url) setAvatarPhotoUrl(card.url);
      if (hero?.url) setHeroPhotoUrl(hero.url);
      const assets: MediaAsset[] = [];
      if (card) assets.push({ id: card.id, url: card.url, variantKind: "card", sortOrder: 0 });
      if (hero) assets.push({ id: hero.id, url: hero.url, variantKind: "hero", sortOrder: 0 });
      for (const g of gallery) {
        assets.push({ id: g.id, url: g.url, variantKind: "gallery", sortOrder: g.sortOrder, sourceMediaAssetId: g.sourceMediaAssetId });
      }
      setGalleryAssets(assets);
      setGalleryPage(data.bundle);
      const s = stateRef.current;
      const applied = applyOverviewToAlbums(s.albumsPro, data);
      setAlbumPaging(applied.paging);
      const polaroids = s.polaroids.map((p) => {
        const hit = polaroidsMap[p.id];
        return hit ? { ...p, url: hit.url, mediaAssetId: hit.id } : p;
      });
      patch({ albumsPro: applied.albums, polaroids }, { silent: true });
    },
    [setAvatarPhotoUrl, setHeroPhotoUrl, setGalleryAssets, setGalleryPage, setAlbumPaging, stateRef, patch],
  );

  // Re-read the overview when the gallery drawer closes (uploads / deletes).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justClosed = wasOpenRef.current && !galleryDrawerOpen;
    wasOpenRef.current = galleryDrawerOpen;
    if (!justClosed || !enabled || !talentId) return;
    let cancelled = false;
    void actionLoadProfileShellMedia(talentId).then((res) => {
      if (!cancelled && res.ok) applyOverview(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [galleryDrawerOpen, enabled, talentId, applyOverview]);

  return { galleryPaging, albumPaging, applyOverview };
}
