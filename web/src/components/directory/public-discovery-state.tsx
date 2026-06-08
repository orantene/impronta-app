"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DirectorySortValue } from "@/lib/directory/types";

/**
 * Two independent lists per visitor:
 *
 *  - `savedIds`     — the **inquiry cart**. Backed by `saved_talent`
 *                     (server) and `impronta.public.saved-ids`
 *                     localStorage (client). Transient; clears on inquiry
 *                     submit.
 *  - `favoriteIds`  — the **personal favorites** (♥ bookmark). Backed by
 *                     `client_favorites` (server, auth only) and
 *                     `impronta.public.favorite-ids` localStorage
 *                     (client, guest layer). Persists across sessions.
 *                     Sweeps into `client_favorites` on signup via
 *                     `MergeGuestFavorites`.
 *
 * A talent can be in BOTH lists, neither, or just one — they're
 * orthogonal user concepts (the prototype shows a card with the bookmark
 * filled but no `ADDED ✓`, and another with `ADDED ✓` but no bookmark).
 */
const SAVED_IDS_KEY = "impronta.public.saved-ids";
const FAVORITE_IDS_KEY = "impronta.public.favorite-ids";
const SEARCH_CONTEXT_KEY = "impronta.public.search-context";

export type PublicFlashMessage = {
  title: string;
  message?: string;
  tone?: "error" | "success" | "info";
};

export type DiscoverySearchContext = {
  q: string;
  locationSlug: string;
  sort: DirectorySortValue;
  taxonomyTermIds: string[];
  sourcePage: string;
  selectedTalentIds?: string[];
  selectedTalent?: Array<{
    id: string;
    profileCode: string;
    displayName: string;
  }>;
};

type PublicDiscoveryStateValue = {
  // — Inquiry cart (saved_talent) ——————————————————————————————
  savedIds: string[];
  savedCount: number;
  isSaved: (id: string) => boolean;
  setSavedState: (id: string, saved: boolean) => void;
  hydrateSavedIds: (ids: string[]) => void;
  clearSavedIds: () => void;
  // — Personal favorites (client_favorites) ——————————————————————
  favoriteIds: string[];
  favoritesCount: number;
  isFavorited: (id: string) => boolean;
  setFavoriteState: (id: string, favorited: boolean) => void;
  hydrateFavoriteIds: (ids: string[]) => void;
  clearFavoriteIds: () => void;
  /** True after guest localStorage/sessionStorage has been merged (post-hydration). */
  storageMerged: boolean;
  // — Branding tokens (seeded from SSR, read-only for UI components) ————
  /** A1/A2 — which icon to use for the favorites toggle. Default 'bookmark'. */
  favoriteIcon: "heart" | "bookmark";
  setFavoriteIcon: (icon: "heart" | "bookmark") => void;
  // — Search context (for inquiry analytics + AI assist) ————————
  searchContext: DiscoverySearchContext | null;
  setSearchContext: (context: DiscoverySearchContext | null) => void;
  flash: PublicFlashMessage | null;
  setFlash: (flash: PublicFlashMessage | null) => void;
};

const PublicDiscoveryStateContext =
  createContext<PublicDiscoveryStateValue | null>(null);

function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseSearchContext(raw: string | null): DiscoverySearchContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DiscoverySearchContext> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      locationSlug:
        typeof parsed.locationSlug === "string" ? parsed.locationSlug : "",
      sort:
        parsed.sort === "featured" ||
        parsed.sort === "recent" ||
        parsed.sort === "updated"
          ? parsed.sort
          : "recommended",
      taxonomyTermIds: Array.isArray(parsed.taxonomyTermIds)
        ? parsed.taxonomyTermIds.filter((item): item is string => typeof item === "string")
        : [],
      sourcePage:
        typeof parsed.sourcePage === "string" ? parsed.sourcePage : "/directory",
      selectedTalentIds: Array.isArray(parsed.selectedTalentIds)
        ? parsed.selectedTalentIds.filter((item): item is string => typeof item === "string")
        : undefined,
      selectedTalent: Array.isArray(parsed.selectedTalent)
        ? parsed.selectedTalent.filter(
            (
              item,
            ): item is {
              id: string;
              profileCode: string;
              displayName: string;
            } =>
              typeof item === "object" &&
              item !== null &&
              typeof item.id === "string" &&
              typeof item.profileCode === "string" &&
              typeof item.displayName === "string",
          )
        : undefined,
    };
  } catch {
    return null;
  }
}

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function PublicDiscoveryStateProvider({
  children,
  initialSavedIds = [],
  initialFavoriteIds = [],
}: {
  children: React.ReactNode;
  /** SSR-seeded inquiry cart — matches `getSavedTalentIds()` on first paint. */
  initialSavedIds?: string[];
  /** SSR-seeded favorites — matches `getFavoriteTalentIds()` on first paint. */
  initialFavoriteIds?: string[];
}) {
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    Array.from(new Set(initialSavedIds)),
  );
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    Array.from(new Set(initialFavoriteIds)),
  );
  const [storageMerged, setStorageMerged] = useState(false);
  const [favoriteIcon, setFavoriteIconState] = useState<"heart" | "bookmark">("bookmark");
  const [searchContext, setSearchContextState] =
    useState<DiscoverySearchContext | null>(null);
  const [flash, setFlashState] = useState<PublicFlashMessage | null>(null);

  useEffect(() => {
    const localSaved = parseIdList(window.localStorage.getItem(SAVED_IDS_KEY));
    const localFavorites = parseIdList(
      window.localStorage.getItem(FAVORITE_IDS_KEY),
    );
    if (localSaved.length > 0) {
      setSavedIds((prev) => Array.from(new Set([...prev, ...localSaved])));
    }
    if (localFavorites.length > 0) {
      setFavoriteIds((prev) => Array.from(new Set([...prev, ...localFavorites])));
    }
    setSearchContextState(
      parseSearchContext(window.sessionStorage.getItem(SEARCH_CONTEXT_KEY)),
    );
    setStorageMerged(true);
  }, []);

  const isSaved = useCallback(
    (id: string) => savedIds.includes(id),
    [savedIds],
  );

  const setSavedState = useCallback((id: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = saved
        ? Array.from(new Set([...prev, id]))
        : prev.filter((item) => item !== id);
      window.localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hydrateSavedIds = useCallback((ids: string[]) => {
    const next = Array.from(new Set(ids));
    setSavedIds((prev) => {
      if (sameIdList(prev, next)) return prev;
      window.localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSavedIds = useCallback(() => {
    setSavedIds([]);
    window.localStorage.setItem(SAVED_IDS_KEY, JSON.stringify([]));
  }, []);

  const isFavorited = useCallback(
    (id: string) => favoriteIds.includes(id),
    [favoriteIds],
  );

  const setFavoriteState = useCallback((id: string, favorited: boolean) => {
    setFavoriteIds((prev) => {
      const next = favorited
        ? Array.from(new Set([...prev, id]))
        : prev.filter((item) => item !== id);
      window.localStorage.setItem(FAVORITE_IDS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hydrateFavoriteIds = useCallback((ids: string[]) => {
    const next = Array.from(new Set(ids));
    setFavoriteIds((prev) => {
      if (sameIdList(prev, next)) return prev;
      window.localStorage.setItem(FAVORITE_IDS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearFavoriteIds = useCallback(() => {
    setFavoriteIds([]);
    window.localStorage.setItem(FAVORITE_IDS_KEY, JSON.stringify([]));
  }, []);

  const setSearchContext = useCallback(
    (context: DiscoverySearchContext | null) => {
      setSearchContextState(context);
      if (context) {
        window.sessionStorage.setItem(
          SEARCH_CONTEXT_KEY,
          JSON.stringify(context),
        );
      } else {
        window.sessionStorage.removeItem(SEARCH_CONTEXT_KEY);
      }
    },
    [],
  );

  const setFavoriteIcon = useCallback((icon: "heart" | "bookmark") => {
    setFavoriteIconState(icon);
  }, []);

  const setFlash = useCallback((next: PublicFlashMessage | null) => {
    setFlashState(next);
  }, []);

  const value = useMemo<PublicDiscoveryStateValue>(
    () => ({
      savedIds,
      savedCount: savedIds.length,
      isSaved,
      setSavedState,
      hydrateSavedIds,
      clearSavedIds,
      favoriteIds,
      favoritesCount: favoriteIds.length,
      isFavorited,
      setFavoriteState,
      hydrateFavoriteIds,
      clearFavoriteIds,
      storageMerged,
      favoriteIcon,
      setFavoriteIcon,
      searchContext,
      setSearchContext,
      flash,
      setFlash,
    }),
    [
      flash,
      hydrateSavedIds,
      hydrateFavoriteIds,
      clearSavedIds,
      clearFavoriteIds,
      isSaved,
      isFavorited,
      savedIds,
      favoriteIds,
      storageMerged,
      favoriteIcon,
      setFavoriteIcon,
      searchContext,
      setSavedState,
      setFavoriteState,
      setSearchContext,
      setFlash,
    ],
  );

  return (
    <PublicDiscoveryStateContext.Provider value={value}>
      {children}
    </PublicDiscoveryStateContext.Provider>
  );
}

export function usePublicDiscoveryState(): PublicDiscoveryStateValue {
  const value = useContext(PublicDiscoveryStateContext);
  if (!value) {
    throw new Error("usePublicDiscoveryState must be used inside the provider");
  }
  return value;
}

/**
 * Safe variant — returns `null` when no provider is mounted instead of
 * throwing. Lets components like `DirectoryCardAdapter` render gracefully
 * outside the public layout (e.g. talent-dashboard card preview).
 */
export function usePublicDiscoveryStateOptional(): PublicDiscoveryStateValue | null {
  return useContext(PublicDiscoveryStateContext);
}

export function DiscoveryStateBridge({
  savedIds,
  favoriteIds,
  favoriteIcon,
  searchContext,
}: {
  savedIds?: string[];
  favoriteIds?: string[];
  /** A1/A2 — SSR-seeded favorite icon token from agency branding. */
  favoriteIcon?: "heart" | "bookmark" | null;
  searchContext?: DiscoverySearchContext | null;
}) {
  const { hydrateSavedIds, hydrateFavoriteIds, setFavoriteIcon, setSearchContext } =
    usePublicDiscoveryState();

  const savedIdsKey = savedIds?.join("\0") ?? "";
  const favoriteIdsKey = favoriteIds?.join("\0") ?? "";

  useEffect(() => {
    if (savedIds && savedIds.length > 0) {
      hydrateSavedIds(savedIds);
    }
  }, [hydrateSavedIds, savedIdsKey, savedIds]);

  useEffect(() => {
    // Guests keep favorites in localStorage until signup — an empty server
    // seed must not clobber them (see MergeGuestFavorites race note).
    if (favoriteIds && favoriteIds.length > 0) {
      hydrateFavoriteIds(favoriteIds);
    }
  }, [hydrateFavoriteIds, favoriteIdsKey, favoriteIds]);

  useEffect(() => {
    if (favoriteIcon) {
      setFavoriteIcon(favoriteIcon);
    }
  }, [favoriteIcon, setFavoriteIcon]);

  useEffect(() => {
    if (searchContext) {
      setSearchContext(searchContext);
    }
  }, [searchContext, setSearchContext]);

  return null;
}
