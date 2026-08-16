"use client";

/**
 * use-media-library.ts — SEAM 2's data half.
 *
 * Owns the conversation with `/api/admin/media/library` and
 * `/api/talent/media/library`: debounced server-side search, folder / kind /
 * ownership filters, and cursor-driven infinite scroll. The component half
 * (`media-library.tsx`) is presentational and holds no fetching.
 *
 * WHY THE FILTERS LIVE ON THE SERVER
 * The old picker fetched a hard-capped 60 items once and filtered that array
 * client-side. On a 1,900-asset tenant that meant the album chips filtered
 * inside a 3% sample, so clicking a real album showed "No images in this
 * album". Every filter here goes into the request, and the response is the
 * answer for the WHOLE library.
 *
 * RACE DISCIPLINE
 * Filters change faster than requests return. Every fetch carries a monotonic
 * request id and a response whose id is stale is dropped, so a slow "all" page
 * can never land on top of a fast "images" page. `AbortController` cancels the
 * in-flight request on top of that; the id check is the one that is load-bearing
 * because an aborted fetch and a superseded one are different failures.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  MediaLibraryKindFilter,
  MediaLibraryOwnershipFilter,
} from "@/lib/media/library-item";
import type {
  MediaLibraryWireFolder,
  MediaLibraryWireItem,
} from "@/lib/media/library-wire";

/** Assets the two-key rule will not let this talent use here (ownership phase 3). */
export type MediaLibraryLock = {
  assetId: string;
  reason: "owned_by_workspace" | "master_profile_off" | null;
  ownerName: string | null;
};

export type MediaLibraryFilters = {
  search: string;
  folderId: string | null;
  kind: MediaLibraryKindFilter;
  ownership: MediaLibraryOwnershipFilter;
};

export const EMPTY_MEDIA_FILTERS: MediaLibraryFilters = {
  search: "",
  folderId: null,
  kind: "all",
  ownership: "all",
};

export type MediaLibrarySource =
  | { kind: "tenant"; tenantId: string }
  | { kind: "talent"; talentProfileId: string };

type QuotaSnapshot = unknown;

export type MediaLibraryState = {
  items: MediaLibraryWireItem[];
  folders: MediaLibraryWireFolder[];
  portfolioAssetIds: string[];
  locks: MediaLibraryLock[];
  quota: QuotaSnapshot | null;
  totalCount: number;
  pendingCount: number;
  /** First-page load (shows the skeleton grid). */
  loading: boolean;
  /** Appending the next page (shows the footer spinner, keeps the grid). */
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
};

const SEARCH_DEBOUNCE_MS = 260;
const PAGE_SIZE = 60;

function buildUrl(
  source: MediaLibrarySource,
  filters: MediaLibraryFilters,
  cursor: string | null,
): string {
  const params = new URLSearchParams();
  if (source.kind === "tenant") params.set("tenantId", source.tenantId);
  else params.set("talentProfileId", source.talentProfileId);
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.folderId) params.set("folderId", filters.folderId);
  // The talent route has no kind/ownership lanes (a talent's library is their
  // own photos), so those params are only sent where they mean something.
  if (source.kind === "tenant") {
    if (filters.kind !== "all") params.set("kind", filters.kind);
    if (filters.ownership !== "all") params.set("ownership", filters.ownership);
  }
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(PAGE_SIZE));
  const base =
    source.kind === "tenant"
      ? "/api/admin/media/library"
      : "/api/talent/media/library";
  return `${base}?${params.toString()}`;
}

export function useMediaLibrary(input: {
  source: MediaLibrarySource;
  /** Nothing is fetched until the surface is actually visible. */
  active: boolean;
}) {
  const { active } = input;
  // The caller builds `input.source` inline, so it is a fresh object on every
  // render. Rebuild it from its primitives here: that makes `runFetch` — and
  // therefore the refetch effect below — depend on the source's IDENTITY
  // rather than on its object identity, which is what lets the dependency
  // array be honest instead of suppressed.
  const sourceKind = input.source.kind;
  const sourceId =
    input.source.kind === "tenant"
      ? input.source.tenantId
      : input.source.talentProfileId;
  const source = useMemo<MediaLibrarySource>(
    () =>
      sourceKind === "tenant"
        ? { kind: "tenant", tenantId: sourceId }
        : { kind: "talent", talentProfileId: sourceId },
    [sourceKind, sourceId],
  );

  const [filters, setFilters] = useState<MediaLibraryFilters>(EMPTY_MEDIA_FILTERS);
  /** What the input shows. `filters.search` is what the server was asked. */
  const [searchDraft, setSearchDraft] = useState("");
  const [state, setState] = useState<MediaLibraryState>({
    items: [],
    folders: [],
    portfolioAssetIds: [],
    locks: [],
    quota: null,
    totalCount: 0,
    pendingCount: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
  });

  const cursorRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce the typed value into the committed filter. Typing "swimwear"
  // should be one request, not eight.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchDraft }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search]);

  const runFetch = useCallback(
    async (mode: "replace" | "append") => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({
        ...prev,
        loading: mode === "replace",
        loadingMore: mode === "append",
        error: null,
      }));

      try {
        const cursor = mode === "append" ? cursorRef.current : null;
        const res = await fetch(buildUrl(source, filters, cursor), {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          items?: MediaLibraryWireItem[];
          folders?: MediaLibraryWireFolder[];
          portfolioAssetIds?: string[];
          locked?: MediaLibraryLock[];
          quota?: QuotaSnapshot;
          nextCursor?: string | null;
          totalCount?: number;
          pendingCount?: number;
        };
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        // A superseded response must never land, even successfully.
        if (requestIdRef.current !== requestId) return;

        const incoming = body.items ?? [];
        cursorRef.current = body.nextCursor ?? null;
        setState((prev) => ({
          items: mode === "append" ? [...prev.items, ...incoming] : incoming,
          folders: body.folders ?? prev.folders,
          portfolioAssetIds: body.portfolioAssetIds ?? [],
          locks: body.locked ?? [],
          quota: body.quota ?? prev.quota,
          totalCount: body.totalCount ?? incoming.length,
          pendingCount: body.pendingCount ?? 0,
          loading: false,
          loadingMore: false,
          hasMore: !!body.nextCursor,
          error: null,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestIdRef.current !== requestId) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: String(err).slice(0, 200),
        }));
      }
    },
    [source, filters],
  );

  // Refetch from page one whenever the surface opens, the source changes, or
  // a filter commits. `runFetch` is a stable function of exactly those things.
  useEffect(() => {
    if (!active) return;
    cursorRef.current = null;
    void runFetch("replace");
  }, [active, runFetch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (!cursorRef.current) return;
    if (state.loading || state.loadingMore) return;
    void runFetch("append");
  }, [runFetch, state.loading, state.loadingMore]);

  const reload = useCallback(() => {
    cursorRef.current = null;
    void runFetch("replace");
  }, [runFetch]);

  /**
   * Splice a just-uploaded asset into the top of the grid without a refetch,
   * so the tile the operator is looking for is where they expect it.
   */
  const prependItem = useCallback((item: MediaLibraryWireItem) => {
    setState((prev) => ({
      ...prev,
      items: [item, ...prev.items.filter((existing) => existing.id !== item.id)],
      totalCount: prev.totalCount + 1,
    }));
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<MediaLibraryWireItem>) => {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
    },
    [],
  );

  const lockByAssetId = useMemo(
    () => new Map(state.locks.map((lock) => [lock.assetId, lock])),
    [state.locks],
  );

  const portfolioSet = useMemo(
    () => new Set(state.portfolioAssetIds),
    [state.portfolioAssetIds],
  );

  return {
    ...state,
    filters,
    setFilters,
    searchDraft,
    setSearchDraft,
    lockByAssetId,
    portfolioSet,
    loadMore,
    reload,
    prependItem,
    patchItem,
  };
}

export type UseMediaLibraryReturn = ReturnType<typeof useMediaLibrary>;
