"use client";

/**
 * Lane G / G2 — canonical favorites hook.
 *
 * Thin facade over the `PublicDiscoveryState` provider (which owns the
 * favorite-ids list + guest `impronta.public.favorite-ids` localStorage
 * mirror) and the `setTalentFavorited` server action (which branches
 * auth → `client_favorites` vs guest → no-op). Adds optimistic toggling
 * with revert-on-failure and per-id pending tracking.
 *
 * See `./contracts` for the published `UseFavoritesResult` signature.
 */

import { useCallback, useState } from "react";

import { setTalentFavorited } from "@/app/(public)/directory/actions";
import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";

import type { UseFavoritesResult } from "./contracts";

const EMPTY: readonly string[] = Object.freeze([]);

export function useFavorites(): UseFavoritesResult {
  const discovery = usePublicDiscoveryStateOptional();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      if (pending === prev.has(id)) return prev;
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const isFavorited = useCallback(
    (id: string) => discovery?.isFavorited(id) ?? false,
    [discovery],
  );

  const isPending = useCallback(
    (id: string) => pendingIds.has(id),
    [pendingIds],
  );

  const setFavorite = useCallback(
    (id: string, favorited: boolean) => {
      if (!discovery) return;
      if (discovery.isFavorited(id) === favorited) return; // idempotent

      // Optimistic commit (also writes the guest localStorage mirror).
      discovery.setFavoriteState(id, favorited);
      markPending(id, true);

      void setTalentFavorited(id, favorited)
        .then((res) => {
          if (!res.ok) {
            discovery.setFavoriteState(id, !favorited); // revert
            discovery.setFlash({
              tone: "error",
              title: "Could not update favorites",
              message: res.error,
            });
          }
        })
        .catch(() => {
          discovery.setFavoriteState(id, !favorited); // revert
          discovery.setFlash({
            tone: "error",
            title: "Could not update favorites",
          });
        })
        .finally(() => {
          markPending(id, false);
        });
    },
    [discovery, markPending],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      if (!discovery) return;
      setFavorite(id, !discovery.isFavorited(id));
    },
    [discovery, setFavorite],
  );

  return {
    favoriteIds: discovery?.favoriteIds ?? EMPTY,
    favoritesCount: discovery?.favoritesCount ?? 0,
    isFavorited,
    isPending,
    toggleFavorite,
    setFavorite,
    isReady: discovery !== null,
  };
}
