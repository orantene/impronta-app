"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bookmark, Trash2, X } from "lucide-react";

import { setTalentFavorited, setTalentSaved } from "@/app/(public)/directory/actions";
import { useFavoritesDrawer } from "@/components/directory/favorites-drawer-context";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { Button } from "@/components/ui/button";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { createTranslator } from "@/i18n/messages";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import type { DirectoryTalentMini } from "@/app/api/directory/talents-by-ids/route";

function subscribeNoop(): () => void {
  return () => undefined;
}

/** False during SSR/hydration — avoids favorite-count / drawer chrome drift. */
function useClientMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * The bookmark-icon drawer. Lists every talent the visitor has hearted
 * (`favoriteIds` from `usePublicDiscoveryState`), with three primary
 * actions:
 *
 *   1. Remove a single favorite (✕ on the row)
 *   2. Clear all favorites
 *   3. Bulk-move into the inquiry cart and open the inquiry drawer
 *
 * For guests, a "Save these forever — sign up" CTA appears at the
 * bottom. Signup triggers the merge bridge which mirrors localStorage
 * favorites into `client_favorites`.
 */
export function FavoritesDrawer({
  signupHref,
  locale: localeProp,
  initialFavoriteIdsCount = 0,
  isAuthenticated = false,
}: {
  signupHref: string;
  /** SSR-resolved locale — avoids pathname/cookie drift on first paint. */
  locale?: string;
  /** SSR favorite count — matches header badge seed until client storage merges. */
  initialFavoriteIdsCount?: number;
  /** Whether the viewer is a signed-in client. The "Build your portfolio"
   *  link targets /client/favorites (auth-only) → shown only when authed;
   *  guests get the sign-up CTA that's already in the footer. */
  isAuthenticated?: boolean;
}) {
  const mounted = useClientMounted();
  const drawer = useFavoritesDrawer();
  const discovery = usePublicDiscoveryState();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const pathname = usePathname();
  const pathnameLocale = stripLocaleFromPathname(pathname).locale;
  const locale = localeProp ?? pathnameLocale;
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [talents, setTalents] = useState<DirectoryTalentMini[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const favoriteIds = discovery.favoriteIds;
  const isOpen = drawer?.isOpen ?? false;

  // Keep SSR/first paint aligned until guest localStorage merges post-hydration.
  const displayFavoriteCount = discovery.storageMerged
    ? favoriteIds.length
    : initialFavoriteIdsCount;
  const hasFavorites = displayFavoriteCount > 0;

  // Load talent metadata whenever drawer opens with a non-empty list.
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
        setTalents(data.talents ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setTalents([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, favoriteIds]);

  // ESC dismisses.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") drawer?.close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, drawer]);

  const removeOne = useCallback(
    async (id: string) => {
      discovery.setFavoriteState(id, false);
      setTalents((prev) => prev.filter((t) => t.id !== id));
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
    [discovery, t],
  );

  const clearAll = useCallback(async () => {
    const previous = favoriteIds.slice();
    discovery.clearFavoriteIds();
    setTalents([]);
    // Fire-and-forget per-id removal. The drawer is already empty
    // optimistically — if any fail, we just leave the corresponding
    // server row; the next signup-merge sweep reconciles.
    await Promise.all(previous.map((id) => setTalentFavorited(id, false)));
  }, [discovery, favoriteIds]);

  const moveAllToCart = useCallback(async () => {
    if (favoriteIds.length === 0) return;
    setBulkPending(true);
    try {
      // Optimistic — flip cart state for any not already in cart.
      const toMove = favoriteIds.filter((id) => !discovery.isSaved(id));
      for (const id of toMove) {
        discovery.setSavedState(id, true);
      }
      // Persist server-side (parallel).
      await Promise.all(toMove.map((id) => setTalentSaved(id, true)));
      // Cue the inquiry icon, then swap drawer surfaces.
      inquiryModal?.bumpSaveCue();
      drawer?.close();
      inquiryModal?.openInquiry();
    } finally {
      setBulkPending(false);
    }
  }, [discovery, favoriteIds, inquiryModal, drawer]);

  if (!drawer) return null;
  if (!mounted) return null;

  const isGuest = !inquiryModal; // Heuristic — inquiry provider mounts on every public page; only missing in odd embeds.
  void isGuest;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        className={
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 " +
          (isOpen ? "opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={() => drawer.close()}
      />
      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-label={t("public.directory.ui.favorites.title")}
        aria-modal="true"
        className={
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md transform flex-col border-l border-white/10 bg-zinc-950/97 backdrop-blur-md shadow-2xl transition-transform duration-300 ease-out " +
          (isOpen ? "translate-x-0" : "translate-x-full")
        }
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Bookmark
              className="size-5 shrink-0 text-[var(--impronta-gold)]"
              fill="currentColor"
            />
            <h2
              className="truncate font-display text-lg font-medium tracking-wide text-foreground"
              suppressHydrationWarning
            >
              {t("public.directory.ui.favorites.title")}
              {hasFavorites ? (
                <span
                  className="ml-2 font-mono text-[11px] tabular-nums text-white/55"
                  suppressHydrationWarning
                >
                  {displayFavoriteCount}
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => drawer.close()}
            aria-label={t("public.directory.ui.favorites.close")}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!hasFavorites ? (
            <EmptyState locale={locale} />
          ) : loading && talents.length === 0 ? (
            <FavoritesSkeleton count={Math.min(displayFavoriteCount, 4)} />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {talents.map((talent) => (
                <FavoriteRow
                  key={talent.id}
                  talent={talent}
                  pathname={pathname}
                  onRemove={() => removeOne(talent.id)}
                  removeLabel={t("public.directory.ui.favorites.removeTalent")}
                />
              ))}
              {/* Ghost rows for IDs that didn't resolve (e.g. talent removed) */}
              {talents.length < favoriteIds.length ? (
                <li className="px-3 py-2 text-[11px] text-white/40">
                  {t("public.directory.ui.favorites.hiddenUnavailable").replace(
                    "{count}",
                    String(favoriteIds.length - talents.length),
                  )}
                </li>
              ) : null}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-white/10 px-5 py-4">
          {hasFavorites ? (
            <div className="flex flex-col gap-2.5">
              <Button
                onClick={moveAllToCart}
                disabled={bulkPending}
                className="w-full bg-white text-black hover:bg-white/90"
              >
                {t("public.directory.ui.favorites.inquireAboutThese").replace(
                  "{count}",
                  String(displayFavoriteCount),
                )}
              </Button>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                {isAuthenticated ? (
                  <Link
                    href={clientLocaleHref(pathname, "/client/favorites")}
                    onClick={() => drawer.close()}
                    className="text-white/55 underline-offset-4 hover:text-white hover:underline"
                  >
                    {t("public.directory.ui.favorites.buildPortfolio")}
                  </Link>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-white/45 transition-colors hover:text-white/85"
                >
                  <Trash2 className="size-3.5" />
                  {t("public.directory.ui.favorites.clearAll")}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                <Link
                  href={signupHref}
                  onClick={() => drawer.close()}
                  className="text-white/70 underline-offset-4 hover:text-white hover:underline"
                >
                  {t("public.directory.ui.favorites.saveForever")}
                </Link>{" "}
                {t("public.directory.ui.favorites.listFollows")}
              </p>
            </div>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

function FavoriteRow({
  talent,
  pathname,
  onRemove,
  removeLabel,
}: {
  talent: DirectoryTalentMini;
  pathname: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  const profileHref = talent.profileCode
    ? clientLocaleHref(
        pathname,
        `/t/${encodeURIComponent(talent.profileCode)}`,
      )
    : "#";

  return (
    <li className="group/row flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-white/10 hover:bg-white/[0.03]">
      <Link
        href={profileHref}
        className="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <div
          className="relative size-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]"
          aria-hidden
        >
          {talent.photoUrl ? (
            <Image
              src={talent.photoUrl}
              alt={talent.displayName}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-xs text-white/50">
              {talent.displayName.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm leading-tight text-foreground">
            {talent.displayName}
          </p>
          <p className="truncate text-[11px] text-white/55">
            {talent.locationLabel ?? talent.profileCode ?? ""}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel.replace("{name}", talent.displayName)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/35 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

function EmptyState({ locale }: { locale: string }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return (
    <div className="mx-auto mt-12 max-w-xs text-center">
      <Bookmark className="mx-auto size-7 text-white/30" />
      <p className="mt-4 font-display text-base tracking-wide text-foreground">
        {t("public.directory.ui.favorites.emptyTitle")}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/55">
        {t("public.directory.ui.favorites.emptyDescription")}
      </p>
    </div>
  );
}

function FavoritesSkeleton({ count }: { count: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-lg px-2 py-2"
        >
          <div className="size-12 shrink-0 rounded-md bg-white/[0.04]" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-2/3 rounded bg-white/[0.06]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
