"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AI_SEARCH_DEBOUNCE_MS_DEFAULT } from "@/lib/ai/search-debounce";
import {
  applyCanonicalDirectoryFetchSearchParams,
  parseTaxonomyParam,
  serializeDirectoryFieldFacetParams,
  type DirectoryViewMode,
} from "@/lib/directory/search-params";
import type {
  DirectoryFieldFacetSelection,
  DirectoryPageResponse,
  DirectorySortValue,
} from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_DEFAULT } from "@/lib/directory/types";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { SearchResult } from "@/lib/ai/search-result";

import { DirectoryCardAdapter } from "./DirectoryCardAdapter";
import type { DirectoryV1 } from "./schema";

/**
 * B3 — Premium reactive grid for the portable Directory section.
 *
 * Path β (per evolution prompts doc): owns its own `useInfiniteQuery`
 * against `/api/directory` (or `/api/ai/search` when the AI strip is
 * driving the URL `q`). Renders the canonical `<TalentCard>` via
 * `<DirectoryCardAdapter>`, with cool-shimmer skeletons during initial
 * fetch and an editorial empty-state.
 *
 * No legacy chrome: no preview dialog, no inline save/contact buttons
 * (the canonical card is a pure link to the profile — affordances
 * relocate to the profile page; hover-reveal is planned in B7).
 */
export function DirectoryReactiveGrid({
  taxonomyTermIds,
  initialPage,
  locale = "en",
  sort,
  query,
  locationSlug,
  heightMinCm = null,
  heightMaxCm = null,
  ageMin = null,
  ageMax = null,
  fieldFacets = [],
  view = "grid",
  ui,
  directorySearchViaAi = false,
  cardStyle,
  cardAspect,
  show,
  nameFallback,
  columnsDesktop,
  columnsTablet,
  columnsMobile,
  onFetchingChange,
}: {
  taxonomyTermIds: string[];
  initialPage: DirectoryPageResponse;
  locale?: string;
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacets?: DirectoryFieldFacetSelection[];
  view?: DirectoryViewMode;
  ui: DirectoryUiCopy;
  directorySearchViaAi?: boolean;
  cardStyle: DirectoryV1["cardStyle"];
  cardAspect: DirectoryV1["cardAspect"];
  show: Pick<
    DirectoryV1,
    | "showName"
    | "showTalentType"
    | "showLocation"
    | "showAvailability"
    | "showBadges"
  >;
  nameFallback: DirectoryV1["nameFallback"];
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
  /** Called whenever the filter-refetch-in-flight state changes. */
  onFetchingChange?: (isFetching: boolean) => void;
}) {
  const taxKey = [...taxonomyTermIds].sort().join(",");
  const ffKey = serializeDirectoryFieldFacetParams(fieldFacets).join("|");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
    // Stable queryKey shape for the directory infinite cache.
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
      ageMin ?? "",
      ageMax ?? "",
      view,
    ],
    queryFn: ({ pageParam }) =>
      directorySearchViaAi
        ? fetchAiPage({
            taxKey,
            cursor: pageParam,
            locale,
            sort,
            query: effectiveQuery,
            locationSlug,
            heightMinCm,
            heightMaxCm,
            ageMin,
            ageMax,
            fieldFacets,
            loadErrorMessage: ui.loadResultsError,
          })
        : fetchClassicPage({
            taxKey,
            cursor: pageParam,
            locale,
            sort,
            query: effectiveQuery,
            locationSlug,
            heightMinCm,
            heightMaxCm,
            ageMin,
            ageMax,
            fieldFacets,
            loadErrorMessage: ui.loadResultsError,
          }),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialPage], pageParams: [null] },
    // Mark SSR seed immediately stale so the client always reconciles
    // with the API once per key change (same pattern as legacy grid).
    initialDataUpdatedAt: 0,
  });

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

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

  const gridClass = useMemo(
    () => gridClassFor(columnsMobile, columnsTablet, columnsDesktop),
    [columnsMobile, columnsTablet, columnsDesktop],
  );

  // Initial loading: render skeleton placeholders (delivers a slice of
  // B2 for free — editorial 4:5 cool-shimmer boxes, no zinc gradient).
  // With SSR `initialData` the query is never in "pending" state — we
  // only show skeletons when we have no items AND a fetch is in flight.
  const isInitialLoading = items.length === 0 && isFetching;

  // Report filter-refetch-in-flight state to the parent toolbar so the
  // result count dims while a filter change is loading (Task 4).
  // Computed before early returns so the hook is always called.
  const filterRefetchInFlight =
    isFetching && !isFetchingNextPage && (isPlaceholderData || isRefetching);

  useEffect(() => {
    onFetchingChange?.(filterRefetchInFlight);
  }, [filterRefetchInFlight, onFetchingChange]);

  if (status === "error" && items.length === 0) {
    return (
      <p className="text-sm text-[var(--impronta-muted)]" role="alert">
        {ui.loadResultsError}
      </p>
    );
  }

  if (isInitialLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          <DirectoryCardSkeleton key={i} aspect={cardAspect} />
        ))}
      </div>
    );
  }

  if (items.length === 0 && !isPlaceholderData) {
    // B2 — editorial empty state. Two-line editorial composition
    // instead of the technical "no matches" wall. The first line is
    // brand-tone (Cinzel display), the second is a gentle next step.
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
        <p className="font-display text-xl tracking-wide text-foreground">
          Nothing in the roster matches that yet.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-white/55">
          Try a broader discipline, clear filters, or check back as the
          roster grows.
        </p>
      </div>
    );
  }

  const filterRefetchBusy = filterRefetchInFlight;

  return (
    <>
      <div
        className={
          filterRefetchBusy
            ? "relative transition-opacity duration-200 after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:rounded-lg after:bg-background/40"
            : undefined
        }
      >
        <div className={gridClass}>
          {items.map((card, index) => (
            <DirectoryCardAdapter
              key={card.id}
              card={card}
              cardStyle={cardStyle}
              cardAspect={cardAspect}
              show={show}
              nameFallback={nameFallback}
              priority={index < 4}
              index={index}
            />
          ))}
        </div>
      </div>
      {filterRefetchBusy ? (
        <p
          className="mt-2 text-center text-xs text-[var(--impronta-muted)]"
          role="status"
        >
          {ui.loadingMore}
        </p>
      ) : null}
      <div
        ref={sentinelRef}
        className="flex h-12 w-full items-center justify-center"
        aria-hidden
      >
        {isFetchingNextPage ? (
          <span className="text-sm text-[var(--impronta-muted)]">
            {ui.loadingMore}
          </span>
        ) : null}
      </div>
    </>
  );
}

const ASPECT_RATIO: Record<DirectoryV1["cardAspect"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

function DirectoryCardSkeleton({
  aspect,
}: {
  aspect: DirectoryV1["cardAspect"];
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"
      data-card-style="skeleton"
    >
      <div
        className="w-full animate-pulse bg-white/[0.04]"
        style={{ aspectRatio: ASPECT_RATIO[aspect] }}
        aria-hidden
      />
    </div>
  );
}

function gridClassFor(mobile: number, tablet: number, desktop: number) {
  const m = clamp(mobile, 1, 2);
  const t = clamp(tablet, 1, 4);
  const d = clamp(desktop, 1, 6);
  return [
    "grid gap-3 sm:gap-4",
    GRID_COLS_MOBILE[m],
    GRID_COLS_TABLET[t],
    GRID_COLS_DESKTOP[d],
  ]
    .filter(Boolean)
    .join(" ");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Static Tailwind class maps so the JIT picks them up.
const GRID_COLS_MOBILE: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
};
const GRID_COLS_TABLET: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};
const GRID_COLS_DESKTOP: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

// --- Fetchers for the directory infinite query (`/api/directory` +
//     `/api/ai/search`).

type FetchArgs = {
  taxKey: string;
  cursor: string | null;
  locale: string;
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  loadErrorMessage: string;
};

async function fetchClassicPage({
  taxKey,
  cursor,
  locale,
  sort,
  query,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  ageMin,
  ageMax,
  fieldFacets,
  loadErrorMessage,
}: FetchArgs): Promise<DirectoryPageResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(DIRECTORY_PAGE_SIZE_DEFAULT));
  const taxonomyTermIds = taxKey
    ? taxKey
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  applyCanonicalDirectoryFetchSearchParams(params, {
    taxonomyTermIds,
    locale,
    sort,
    query,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    ageMin,
    ageMax,
    fieldFacets,
  });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/directory?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
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

async function fetchAiPage({
  taxKey,
  cursor,
  locale,
  sort,
  query,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  ageMin,
  ageMax,
  fieldFacets,
  loadErrorMessage,
}: FetchArgs): Promise<DirectoryPageResponse> {
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
      ageMin,
      ageMax,
      cursor: cursor || null,
      fieldFacets: fieldFacets.length ? fieldFacets : undefined,
      analyticsSource: "directory",
    }),
  });
  const body = (await res.json()) as AiSearchPageJson;
  if (!res.ok) {
    throw new Error(body.error ?? loadErrorMessage);
  }
  return {
    items: body.results.map((r) => r.card),
    nextCursor: body.next_cursor,
    taxonomyTermIds: body.taxonomy_term_ids,
  };
}
