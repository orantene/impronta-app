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

const SAVED_IDS_KEY = "impronta.public.saved-ids";
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
  savedIds: string[];
  savedCount: number;
  isSaved: (id: string) => boolean;
  setSavedState: (id: string, saved: boolean) => void;
  hydrateSavedIds: (ids: string[]) => void;
  searchContext: DiscoverySearchContext | null;
  setSearchContext: (context: DiscoverySearchContext | null) => void;
  flash: PublicFlashMessage | null;
  setFlash: (flash: PublicFlashMessage | null) => void;
};

const PublicDiscoveryStateContext =
  createContext<PublicDiscoveryStateValue | null>(null);

function parseSavedIds(raw: string | null): string[] {
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

export function PublicDiscoveryStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [searchContext, setSearchContextState] =
    useState<DiscoverySearchContext | null>(null);
  const [flash, setFlashState] = useState<PublicFlashMessage | null>(null);

  useEffect(() => {
    setSavedIds(parseSavedIds(window.localStorage.getItem(SAVED_IDS_KEY)));
    setSearchContextState(
      parseSearchContext(window.sessionStorage.getItem(SEARCH_CONTEXT_KEY)),
    );
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
    setSavedIds(next);
    window.localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(next));
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
      searchContext,
      setSearchContext,
      flash,
      setFlash,
    }),
    [
      flash,
      hydrateSavedIds,
      isSaved,
      savedIds,
      searchContext,
      setSavedState,
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

export function DiscoveryStateBridge({
  savedIds,
  searchContext,
}: {
  savedIds?: string[];
  searchContext?: DiscoverySearchContext | null;
}) {
  const { hydrateSavedIds, setSearchContext } = usePublicDiscoveryState();

  useEffect(() => {
    if (savedIds) {
      hydrateSavedIds(savedIds);
    }
  }, [hydrateSavedIds, savedIds]);

  useEffect(() => {
    if (searchContext) {
      setSearchContext(searchContext);
    }
  }, [searchContext, setSearchContext]);

  return null;
}
