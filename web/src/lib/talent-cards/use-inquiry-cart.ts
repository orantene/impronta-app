"use client";

/**
 * Lane G / G3 — canonical inquiry-cart hook + single `openInquiry()` entry.
 *
 * Thin facade over the `PublicDiscoveryState` provider (which owns the
 * `saved_talent` cart mirror + guest localStorage) and the `setTalentSaved`
 * server action (auth → `saved_talent`, guest → `guest_add_saved_talent`
 * RPC). `openInquiry()` delegates to the `DirectoryInquiryModal` provider —
 * the one canonical composer entry point.
 *
 * Source attribution: adding a talent seeds a minimal directory search
 * context with `sourcePage` *only when none exists*, so a homepage save
 * attributes correctly without clobbering a real `/directory` search.
 *
 * See `./contracts` for the published `UseInquiryCartResult` signature.
 */

import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { setTalentSaved } from "@/app/(public)/directory/actions";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";

import { addToScope, idsInScope, inScope, removeFromScope, scopeKeyForPath } from "./cart-scope";
import { getCartScopes, setCartScopes, useCartScopes } from "./cart-scope-store";
import type {
  OpenInquiryOptions,
  TalentCardRef,
  UseInquiryCartResult,
} from "./contracts";

const EMPTY: readonly string[] = Object.freeze([]);

export function useInquiryCart(): UseInquiryCartResult {
  const discovery = usePublicDiscoveryStateOptional();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  // TUL-1068 #11: the cart only shows and sends entries added in THIS context.
  const scope = scopeKeyForPath(usePathname());
  const scopes = useCartScopes();
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

  /** Seed source attribution without overwriting a live directory search. */
  const noteSourcePage = useCallback(
    (sourcePage?: string) => {
      if (!discovery || !sourcePage) return;
      if (discovery.searchContext) return;
      discovery.setSearchContext({
        q: "",
        locationSlug: "",
        sort: "recommended",
        taxonomyTermIds: [],
        sourcePage,
      });
    },
    [discovery],
  );

  const isInCart = useCallback(
    (id: string) => (discovery?.isSaved(id) ?? false) && inScope(scopes, id, scope),
    [discovery, scopes, scope],
  );

  const isPending = useCallback(
    (id: string) => pendingIds.has(id),
    [pendingIds],
  );

  const setInCart = useCallback(
    (talent: TalentCardRef, inCart: boolean, sourcePage?: string) => {
      if (!discovery) return;
      const id = talent.talentProfileId;
      if (isInCart(id) === inCart) return; // idempotent
      if (inCart) noteSourcePage(sourcePage);
      const restoreScopes = getCartScopes();
      if (inCart) {
        setCartScopes(addToScope(restoreScopes, id, scope));
        // Already saved from another context: it joins this one, no server write.
        if (discovery.isSaved(id)) {
          if (inquiryModal) inquiryModal.bumpSaveCue();
          return;
        }
      } else {
        const { map, lastScope } = removeFromScope(restoreScopes, id, scope);
        setCartScopes(map);
        if (!lastScope) return; // still held by another context
      }

      // Optimistic commit (also writes the guest localStorage mirror).
      discovery.setSavedState(id, inCart);
      markPending(id, true);

      void setTalentSaved(id, inCart)
        .then((res) => {
          if (!res.ok) {
            discovery.setSavedState(id, !inCart); // revert
            setCartScopes(restoreScopes);
            discovery.setFlash({
              tone: "error",
              title: "Could not update your inquiry list",
              message: res.error,
            });
            return;
          }
          // Cue the header inquiry control's "you have something to send".
          if (inCart && inquiryModal) inquiryModal.bumpSaveCue();
        })
        .catch(() => {
          discovery.setSavedState(id, !inCart); // revert
          setCartScopes(restoreScopes);
          discovery.setFlash({
            tone: "error",
            title: "Could not update your inquiry list",
          });
        })
        .finally(() => {
          markPending(id, false);
        });
    },
    [discovery, inquiryModal, isInCart, markPending, noteSourcePage, scope],
  );

  const toggleInCart = useCallback(
    (talent: TalentCardRef, sourcePage?: string) => {
      if (!discovery) return;
      setInCart(talent, !isInCart(talent.talentProfileId), sourcePage);
    },
    [discovery, isInCart, setInCart],
  );

  const cartIds = useMemo(
    () => (discovery ? idsInScope(discovery.savedIds, scopes, scope) : EMPTY),
    [discovery, scopes, scope],
  );

  const openInquiry = useCallback(
    (options?: OpenInquiryOptions) => {
      noteSourcePage(options?.sourcePage);
      // W2-E — route to the canonical CHAT launcher (the one floating inquiry
      // surface), not the legacy InquiryDrawer sheet. requestOpenChat falls back
      // to the sheet only when no launcher is mounted (no dead CTA).
      inquiryModal?.requestOpenChat();
    },
    [inquiryModal, noteSourcePage],
  );

  return {
    cartIds,
    cartCount: cartIds.length,
    isInCart,
    isPending,
    toggleInCart,
    setInCart,
    openInquiry,
    isReady: discovery !== null,
    canOpenInquiry: inquiryModal !== null,
  };
}
