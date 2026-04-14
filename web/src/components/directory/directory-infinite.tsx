"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import type { SearchResult } from "@/lib/ai/search-result";
import { AI_SEARCH_DEBOUNCE_MS_DEFAULT } from "@/lib/ai/search-debounce";
import { buildDirectoryAiOverlayByTalentId } from "@/lib/directory/directory-ai-overlay";

import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Search } from "lucide-react";
import type {
  DirectoryAiCardOverlay,
  DirectoryCardDTO,
  DirectoryPageResponse,
} from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_DEFAULT } from "@/lib/directory/types";
import { MAX_CARD_FIT_LABELS } from "@/lib/directory/talent-card-dto";
import type { DirectoryFieldFacetSelection, DirectorySortValue } from "@/lib/directory/types";

import { ContactTalentButton, SaveTalentButton } from "./directory-inquiry-actions";
import { TalentCard } from "./talent-card";
import { TalentDirectoryListRow } from "./talent-directory-list-row";
import { usePublicDiscoveryState } from "./public-discovery-state";
import {
  applyCanonicalDirectoryFetchSearchParams,
  parseTaxonomyParam,
  serializeDirectoryFieldFacetParams,
  type DirectoryViewMode,
} from "@/lib/directory/search-params";
import { collectFitSlugsFromCards } from "@/lib/directory/collect-fit-slugs-from-cards";
import { useDirectoryMatchFitOptional } from "@/components/directory/directory-match-fit-context";
import {
  formatPreviewDialogAria,
  formatPreviewImageAlt,
  type DirectoryUiCopy,
} from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";

type DirectoryPreviewResponse = {
  id: string;
  profileCode: string;
  displayName: string;
  shortBio: string | null;
  heightCm: number | null;
  primaryTalentTypeLabel: string;
  locationLabel: string;
  livesInLabel: string;
  originallyFromLabel: string;
  fitLabels: string[];
  skills: string[];
  languages: string[];
  image: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
};

async function fetchDirectoryPageClient(
  taxKey: string,
  cursor: string | null,
  locale: "en" | "es",
  sort: DirectorySortValue,
  query: string,
  locationSlug: string,
  heightMinCm: number | null,
  heightMaxCm: number | null,
  fieldFacets: DirectoryFieldFacetSelection[],
  loadErrorMessage: string,
): Promise<DirectoryPageResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(DIRECTORY_PAGE_SIZE_DEFAULT));
  const taxonomyTermIds = taxKey
    ? taxKey.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  applyCanonicalDirectoryFetchSearchParams(params, {
    taxonomyTermIds,
    locale,
    sort,
    query,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    fieldFacets,
  });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/directory?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? loadErrorMessage);
  }
  return res.json() as Promise<DirectoryPageResponse>;
}

type AiSearchPageJson = {
  results: SearchResult[];
  next_cursor: string | null;
  taxonomy_term_ids: string[];
  error?: string;
};

async function fetchAiSearchDirectoryPageClient(
  taxKey: string,
  cursor: string | null,
  locale: "en" | "es",
  sort: DirectorySortValue,
  query: string,
  locationSlug: string,
  heightMinCm: number | null,
  heightMaxCm: number | null,
  fieldFacets: DirectoryFieldFacetSelection[],
  loadErrorMessage: string,
): Promise<DirectoryPageResponse> {
  const taxonomyTermIds = parseTaxonomyParam(taxKey || undefined);
  const res = await fetch("/api/ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      q: query.trim() ? query : null,
      taxonomyTermIds: taxonomyTermIds.length ? taxonomyTermIds : undefined,
      locationSlug: locationSlug.trim() ? locationSlug : null,
      sort,
      locale,
      limit: DIRECTORY_PAGE_SIZE_DEFAULT,
      heightMinCm,
      heightMaxCm,
      cursor: cursor || null,
      fieldFacets: fieldFacets.length ? fieldFacets : undefined,
      analyticsSource: "directory",
    }),
  });
  const body = (await res.json()) as AiSearchPageJson;
  if (!res.ok) {
    throw new Error(body.error ?? loadErrorMessage);
  }
  const aiOverlayByTalentId = buildDirectoryAiOverlayByTalentId(
    body.results,
    locale,
  );
  return {
    items: body.results.map((r) => r.card),
    nextCursor: body.next_cursor,
    taxonomyTermIds: body.taxonomy_term_ids,
    ...(aiOverlayByTalentId ? { aiOverlayByTalentId } : {}),
  };
}

export function DirectoryInfiniteGrid({
  taxonomyTermIds,
  initialPage,
  locale = "en",
  sort,
  query,
  locationSlug,
  heightMinCm = null,
  heightMaxCm = null,
  fieldFacets = [],
  view = "grid",
  initialSavedIds = [],
  ui,
  directorySearchViaAi = false,
}: {
  taxonomyTermIds: string[];
  initialPage: DirectoryPageResponse;
  locale?: "en" | "es";
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  fieldFacets?: DirectoryFieldFacetSelection[];
  view?: DirectoryViewMode;
  initialSavedIds?: string[];
  ui: DirectoryUiCopy;
  /** When true, listing pages use `POST /api/ai/search` (hybrid when configured). */
  directorySearchViaAi?: boolean;
}) {
  const pathname = usePathname();
  const taxKey = [...taxonomyTermIds].sort().join(",");
  const ffKey = serializeDirectoryFieldFacetParams(fieldFacets).join("|");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [gridUiMounted, setGridUiMounted] = useState(false);
  const [preview, setPreview] = useState<DirectoryCardDTO | null>(null);
  const [previewDetails, setPreviewDetails] =
    useState<DirectoryPreviewResponse | null>(null);
  const [, startTransition] = useTransition();
  const discoveryState = usePublicDiscoveryState();
  const matchFitCtx = useDirectoryMatchFitOptional();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!directorySearchViaAi) {
      setDebouncedQuery(query);
      return;
    }
    const t = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, AI_SEARCH_DEBOUNCE_MS_DEFAULT);
    return () => window.clearTimeout(t);
  }, [query, directorySearchViaAi]);

  const effectiveQuery = directorySearchViaAi ? debouncedQuery : query;

  const isSaved = useCallback(
    (id: string) =>
      hydrated ? discoveryState.isSaved(id) : initialSavedIds.includes(id),
    [discoveryState, hydrated, initialSavedIds],
  );

  const toggleSave = useCallback(
    (id: string) => {
      startTransition(async () => {
        const saved = isSaved(id);
        const nextWantSaved = !saved;
        discoveryState.setSavedState(id, nextWantSaved);
        const res = await setTalentSaved(id, nextWantSaved);
        if (!res.ok) {
          discoveryState.setSavedState(id, saved);
          discoveryState.setFlash({
            tone: "error",
            title: ui.inquiry.flashCouldNotUpdateSaved,
            message: res.error,
          });
        }
      });
    },
    [discoveryState, isSaved, startTransition, ui.inquiry.flashCouldNotUpdateSaved],
  );

  const previewCacheRef = useRef(
    new Map<string, Promise<DirectoryPreviewResponse | null>>(),
  );

  const openPreview = useCallback((card: DirectoryCardDTO) => {
    setPreview(card);
    setPreviewDetails(null);
    queueMicrotask(() => dialogRef.current?.showModal());
    const params = new URLSearchParams();
    if (locale !== "en") params.set("locale", locale);
    const qs = params.toString();
    const cacheKey = `${card.id}:${locale}`;
    const map = previewCacheRef.current;
    let req = map.get(cacheKey);
    if (!req) {
      req = fetch(
        `/api/directory/preview/${encodeURIComponent(card.id)}${qs ? `?${qs}` : ""}`,
        { cache: "no-store" },
      ).then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as DirectoryPreviewResponse;
      });
      map.set(cacheKey, req);
      while (map.size > 64) {
        const k = map.keys().next().value;
        if (k === undefined) break;
        map.delete(k);
      }
    }
    void req.then((data) => {
      if (data?.id === card.id) setPreviewDetails(data);
    });
  }, [locale]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isPlaceholderData,
    isRefetching,
    status,
  } = useInfiniteQuery({
    queryKey: [
      "directory",
      directorySearchViaAi ? "ai" : "classic",
      taxKey,
      ffKey,
      locale,
      sort,
      effectiveQuery,
      locationSlug,
      heightMinCm ?? "",
      heightMaxCm ?? "",
      view,
    ],
    queryFn: ({ pageParam }) =>
      directorySearchViaAi
        ? fetchAiSearchDirectoryPageClient(
            taxKey,
            pageParam,
            locale,
            sort,
            effectiveQuery,
            locationSlug,
            heightMinCm ?? null,
            heightMaxCm ?? null,
            fieldFacets,
            ui.loadResultsError,
          )
        : fetchDirectoryPageClient(
            taxKey,
            pageParam,
            locale,
            sort,
            effectiveQuery,
            locationSlug,
            heightMinCm ?? null,
            heightMaxCm ?? null,
            fieldFacets,
            ui.loadResultsError,
          ),
    /** Reconcile-after-navigation refetch can fail transiently; keep SSR first page instead of blanking the grid. */
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: {
      pages: [initialPage],
      pageParams: [null],
    },
    /**
     * SSR `initialData` gets `dataUpdatedAt: Date.now()` by default, so with the app-wide
     * `staleTime: 60_000` the new query is not stale and TanStack Query skips the
     * `shouldFetchOptionally` fetch after a filter navigation (`query !== prevQuery`).
     * Mark SSR data as immediately stale so the client always reconciles with `/api/directory`
     * once per key change, without forcing `staleTime: 0` for the whole query lifetime.
     */
    initialDataUpdatedAt: 0,
  });

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (
        entry?.isIntersecting &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    setGridUiMounted(true);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: "240px",
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? initialPage.items,
    [data?.pages, initialPage.items],
  );

  const fitSlugsForCards = useMemo(
    () => collectFitSlugsFromCards(items),
    [items],
  );

  useEffect(() => {
    if (!matchFitCtx) return;
    matchFitCtx.setFitSlugs(fitSlugsForCards);
  }, [fitSlugsForCards, matchFitCtx]);

  const aiOverlayByTalentId = useMemo(() => {
    const map: Record<string, DirectoryAiCardOverlay> = {};
    const pages = data?.pages ?? [initialPage];
    for (const p of pages) {
      if (p.aiOverlayByTalentId) {
        Object.assign(map, p.aiOverlayByTalentId);
      }
    }
    return map;
  }, [data?.pages, initialPage]);

  const previewFit =
    previewDetails?.fitLabels.slice(0, MAX_CARD_FIT_LABELS) ??
    preview?.fitLabels.slice(0, MAX_CARD_FIT_LABELS).map((fit) => fit.label) ??
    [];

  if (status === "error" && items.length === 0) {
    return <p className="text-m text-[var(--impronta-muted)]">{ui.loadResultsError}</p>;
  }

  if (items.length === 0 && !isPlaceholderData) {
    return (
      <EmptyState
        icon={Search}
        title={ui.emptyResults}
        className="border-[var(--impronta-gold-border)] bg-black/20 py-16"
      />
    );
  }

  const sourcePage = discoveryState.searchContext?.sourcePage ?? "/directory";
  /** Query fetch flags can differ on the client vs SSR HTML; gate busy UI until after mount. */
  const filterRefetchBusy =
    gridUiMounted &&
    isFetching &&
    !isFetchingNextPage &&
    (isPlaceholderData || isRefetching);

  return (
    <>
      <div
        className={
          filterRefetchBusy
            ? "relative transition-opacity duration-200 after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:rounded-lg after:bg-background/40"
            : undefined
        }
      >
      {view === "list" ? (
        <div className="flex flex-col gap-3">
          {items.map((card, index) => (
            <TalentDirectoryListRow
              key={card.id}
              card={card}
              saved={isSaved(card.id)}
              onSaveToggle={() => toggleSave(card.id)}
              onQuickPreview={() => openPreview(card)}
              priority={index < 4}
              sourcePage={sourcePage}
              ui={ui}
              aiOverlay={aiOverlayByTalentId[card.id] ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {items.map((card, index) => (
            <TalentCard
              key={card.id}
              card={card}
              saved={isSaved(card.id)}
              onSaveToggle={() => toggleSave(card.id)}
              onQuickPreview={() => openPreview(card)}
              priority={index < 4}
              sourcePage={sourcePage}
              ui={ui}
              aiOverlay={aiOverlayByTalentId[card.id] ?? null}
            />
          ))}
        </div>
      )}
      </div>
      {filterRefetchBusy ? (
        <p className="mt-2 text-center text-xs text-[var(--impronta-muted)]" role="status">
          {ui.loadingMore}
        </p>
      ) : null}
      <div
        ref={sentinelRef}
        className="flex h-12 w-full items-center justify-center"
        aria-hidden
      >
        {isFetchingNextPage ? (
          <span className="text-sm text-[var(--impronta-muted)]">{ui.loadingMore}</span>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        aria-label={
          preview ? formatPreviewDialogAria(ui.preview, preview.displayName) : undefined
        }
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-6 text-[var(--impronta-foreground)] shadow-xl [&::backdrop]:bg-black/75"
        onClose={() => {
          setPreview(null);
          setPreviewDetails(null);
        }}
      >
        {preview ? (
          <div className="space-y-4">
            {previewDetails?.image?.url ? (
              <div
                className="relative overflow-hidden rounded-lg bg-black/20"
                style={{
                  aspectRatio:
                    previewDetails.image.width && previewDetails.image.height
                      ? `${previewDetails.image.width} / ${previewDetails.image.height}`
                      : "3 / 4",
                }}
              >
                <Image
                  src={previewDetails.image.url}
                  alt={formatPreviewImageAlt(ui.preview, preview.displayName)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 24rem"
                />
              </div>
            ) : null}
            <div>
              <h2 className="font-[family-name:var(--font-cinzel)] text-xl font-semibold tracking-wide">
                {preview.displayName}
              </h2>
              <p className="mt-1 text-m text-[var(--impronta-muted)]">
                <span className="truncate">
                  {preview.primaryTalentTypeLabel}
                  {`${previewDetails?.livesInLabel ?? preview.locationLabel ?? ""}`.trim()
                    ? ` · ${`${previewDetails?.livesInLabel ?? preview.locationLabel ?? ""}`.trim()}`
                    : ""}
                </span>
              </p>
              {(previewDetails?.originallyFromLabel ?? "").trim() ? (
                <p className="mt-1 text-xs text-[var(--impronta-muted)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--impronta-gold-dim)]">
                    {ui.preview.originallyFrom}
                  </span>{" "}
                  {previewDetails?.originallyFromLabel}
                </p>
              ) : null}
            </div>
            {previewFit.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {previewFit.map((label) => (
                  <li
                    key={label}
                    className="max-w-full truncate rounded-full border border-[var(--impronta-gold-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--impronta-gold-dim)]"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
            {previewDetails?.shortBio ? (
              <p className="text-m leading-6 text-[var(--impronta-muted)]">
                {previewDetails.shortBio}
              </p>
            ) : (
              <p className="text-m text-[var(--impronta-muted)]">{ui.preview.editorialOnly}</p>
            )}
            {previewDetails?.languages?.length ? (
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)]">
                {ui.preview.languagesPrefix} {previewDetails.languages.join(" · ")}
              </p>
            ) : null}
            {previewDetails?.skills?.length ? (
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)]">
                {ui.preview.skillsPrefix} {previewDetails.skills.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <SaveTalentButton
                talent={{
                  id: preview.id,
                  profileCode: preview.profileCode,
                  displayName: preview.displayName,
                }}
                sourcePage={discoveryState.searchContext?.sourcePage ?? "/directory"}
                inquiry={ui.inquiry}
                label={ui.preview.saveThisTalent}
                savedLabel={ui.preview.savedToCart}
                className="w-full border-[var(--impronta-gold-border)] text-[var(--impronta-gold)] hover:text-[var(--impronta-gold)]"
              />
              <ContactTalentButton
                talent={{
                  id: preview.id,
                  profileCode: preview.profileCode,
                  displayName: preview.displayName,
                }}
                sourcePage={discoveryState.searchContext?.sourcePage ?? "/directory"}
                inquiry={ui.inquiry}
                className="w-full bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
              />
              <Button asChild variant="ghost" className="w-full">
                <Link
                  href={clientLocaleHref(
                    pathname,
                    `/t/${encodeURIComponent(preview.profileCode)}`,
                  )}
                >
                  {ui.preview.viewFullProfile}
                </Link>
              </Button>
            </div>
            <form method="dialog" className="flex justify-end">
              <Button type="submit" variant="outline">
                {ui.preview.close}
              </Button>
            </form>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
