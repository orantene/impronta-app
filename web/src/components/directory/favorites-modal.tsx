"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { setTalentFavorited, setTalentSaved } from "@/app/(public)/directory/actions";
import { useFavoritesDrawer } from "@/components/directory/favorites-drawer-context";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import {
  FavoritesModalView,
  useFavoritesSelection,
  type FavoriteModalTalent,
  type FavoritesModalCopy,
  type FavoritesModalTokens,
} from "@/components/directory/favorites-modal-view";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { createTranslator } from "@/i18n/messages";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import type { DirectoryTalentMini } from "@/app/api/directory/talents-by-ids/route";

function subscribeNoop(): () => void {
  return () => undefined;
}
function useClientMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * Public-storefront favorites surface — the 2026 modal that REPLACES the old
 * slide-out `FavoritesDrawer`. Drop-in: same props, same `useFavoritesDrawer()`
 * open/close, so the header bookmark icon + the editorial-split header + every
 * other entry point keep working unchanged.
 *
 * The bridge (the whole point of the redesign): "Inquire about the {n}
 * selected" ADDS the selected favorites into the inquiry lineup (`saved_talent`
 * — the cart store, kept strictly separate from `client_favorites`) and then
 * opens the one canonical inquiry surface via `requestOpenChat()`. It never
 * merges the two stores and never forks a parallel single-talent inquiry.
 *
 * Theme-portable: the panel is portaled to <body>, which carries the
 * `.site-theme-*` class, so the `--fav-*` tokens below resolve to the tenant's
 * palette (dark on a noir tenant). Accent moments run through `--dir-accent` /
 * `--token-color-accent` (the tenant `color.accent`), never a hardcoded gold.
 */
const PUBLIC_TOKENS: FavoritesModalTokens = {
  bg: "var(--background, #0a0a0b)",
  fg: "var(--foreground, #fafafa)",
  border: "var(--border, rgba(250,250,250,0.14))",
  muted: "var(--muted-foreground, rgba(250,250,250,0.6))",
  accent: "var(--dir-accent, var(--token-color-accent, var(--impronta-gold-bright, var(--accent))))",
  tile: "var(--card, rgba(250,250,250,0.05))",
};

export function FavoritesModal({
  signupHref,
  locale: localeProp,
  initialFavoriteIdsCount = 0,
  isAuthenticated = false,
}: {
  signupHref: string;
  locale?: string;
  initialFavoriteIdsCount?: number;
  isAuthenticated?: boolean;
}) {
  const mounted = useClientMounted();
  const drawer = useFavoritesDrawer();
  const discovery = usePublicDiscoveryState();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const pathname = usePathname();
  const locale = localeProp ?? stripLocaleFromPathname(pathname).locale;
  const t = useMemo(() => createTranslator(locale), [locale]);

  const [talents, setTalents] = useState<FavoriteModalTalent[]>([]);
  const [loading, setLoading] = useState(false);
  const [inquirePending, setInquirePending] = useState(false);

  const favoriteIds = discovery.favoriteIds;
  const isOpen = drawer?.isOpen ?? false;

  const talentIds = useMemo(() => talents.map((tt) => tt.id), [talents]);
  const { selectedIds, toggle, selectAll, clear, drop } = useFavoritesSelection(
    talentIds,
    isOpen,
  );

  const displayFavoriteCount = discovery.storageMerged
    ? favoriteIds.length
    : initialFavoriteIdsCount;

  // Load talent metadata whenever the modal opens with a non-empty list.
  useEffect(() => {
    if (!isOpen || favoriteIds.length === 0) {
      setTalents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/directory/talents-by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids: favoriteIds }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { talents: DirectoryTalentMini[] }) => {
        if (cancelled) return;
        const mapped: FavoriteModalTalent[] = (data.talents ?? []).map((mini) => ({
          id: mini.id,
          name: mini.displayName,
          profileCode: mini.profileCode,
          photoUrl: mini.photoUrl,
          primaryType: mini.primaryTypeLabel,
          location: mini.locationLabel,
          profileHref: mini.profileCode
            ? clientLocaleHref(pathname, `/t/${encodeURIComponent(mini.profileCode)}`)
            : null,
        }));
        setTalents(mapped);
      })
      .catch(() => {
        if (!cancelled) setTalents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, favoriteIds, pathname]);

  const onRemove = useCallback(
    async (id: string) => {
      discovery.setFavoriteState(id, false);
      setTalents((prev) => prev.filter((tt) => tt.id !== id));
      drop(id);
      const res = await setTalentFavorited(id, false);
      if (!res.ok) {
        discovery.setFavoriteState(id, true);
        discovery.setFlash({
          tone: "error",
          title: t("public.directory.ui.favorites.updateFailed"),
          message: res.error,
        });
      }
    },
    [discovery, t, drop],
  );

  const onClearAll = useCallback(async () => {
    const previous = favoriteIds.slice();
    discovery.clearFavoriteIds();
    setTalents([]);
    clear();
    await Promise.all(previous.map((id) => setTalentFavorited(id, false)));
  }, [discovery, favoriteIds, clear]);

  // The bridge: add the SELECTED favorites into the inquiry lineup
  // (saved_talent) without merging stores, then open the canonical chat.
  const onInquire = useCallback(async () => {
    const selected = talents
      .filter((tt) => selectedIds.has(tt.id))
      .map((tt) => tt.id);
    if (selected.length === 0) return;
    setInquirePending(true);
    try {
      const toAdd = selected.filter((id) => !discovery.isSaved(id));
      for (const id of toAdd) discovery.setSavedState(id, true);
      await Promise.all(toAdd.map((id) => setTalentSaved(id, true)));
      inquiryModal?.bumpSaveCue();
      drawer?.close();
      // The one canonical inquiry surface (chat launcher); falls back to the
      // synced inquiry sheet when no launcher is mounted, never a dead CTA.
      inquiryModal?.requestOpenChat();
    } finally {
      setInquirePending(false);
    }
  }, [talents, selectedIds, discovery, inquiryModal, drawer]);

  const copy = useMemo<FavoritesModalCopy>(
    () => ({
      title: t("public.directory.ui.favorites.title"),
      subtitle: t("public.directory.ui.favorites.subtitle"),
      close: t("public.directory.ui.favorites.close"),
      selectAll: t("public.directory.ui.favorites.selectAll"),
      clearSelection: t("public.directory.ui.favorites.clearSelection"),
      selectedOfCount: t("public.directory.ui.favorites.selectedOfCount"),
      inquireZero: t("public.directory.ui.favorites.inquireZero"),
      inquireOne: t("public.directory.ui.favorites.inquireOne"),
      inquireMany: t("public.directory.ui.favorites.inquireMany"),
      inquirePending: t("public.directory.ui.favorites.inquirePending"),
      clearAll: t("public.directory.ui.favorites.clearAll"),
      favoritesPageLabel: t("public.directory.ui.favorites.buildPortfolio"),
      saveForever: t("public.directory.ui.favorites.saveForever"),
      saveForeverFollows: t("public.directory.ui.favorites.listFollows"),
      viewProfile: t("public.directory.ui.favorites.viewProfile"),
      selectAria: t("public.directory.ui.favorites.selectAria"),
      deselectAria: t("public.directory.ui.favorites.deselectAria"),
      removeAria: t("public.directory.ui.favorites.removeTalent"),
      hiddenUnavailable: t("public.directory.ui.favorites.hiddenUnavailable"),
      emptyTitle: t("public.directory.ui.favorites.emptyTitle"),
      emptyDescription: t("public.directory.ui.favorites.emptyDescription"),
    }),
    [t],
  );

  if (!drawer || !mounted) return null;

  const favoritesPageHref = isAuthenticated
    ? clientLocaleHref(pathname, "/client/favorites")
    : null;

  return (
    <FavoritesModalView
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) drawer.close();
      }}
      talents={talents}
      totalCount={displayFavoriteCount}
      loading={loading}
      selectedIds={selectedIds}
      onToggleSelect={toggle}
      onSelectAll={selectAll}
      onClearSelection={clear}
      onRemove={onRemove}
      onClearAll={onClearAll}
      onInquire={onInquire}
      inquirePending={inquirePending}
      isAuthenticated={isAuthenticated}
      signupHref={signupHref}
      favoritesPageHref={favoritesPageHref}
      copy={copy}
      tokens={PUBLIC_TOKENS}
    />
  );
}
