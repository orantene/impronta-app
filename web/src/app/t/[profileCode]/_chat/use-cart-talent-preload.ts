"use client";

/**
 * useCartTalentPreload — when the "Message {agency}" launcher pill is opened with
 * talent in the inquiry cart, preload them into the inquiry's Talent selection so
 * the chat opens already populated (plan §B.1: "avatars present → open guided
 * composer, conversation preloaded, Talent prefilled from cartIds").
 *
 * The cart (useInquiryCart().cartIds) is the single source of truth for WHICH
 * talent the visitor picked from directory cards. This hook pushes that set into
 * the one inquiry record via the SAME useUnifiedInquiry.patch path the chips use
 * (lazy early-row create + synced thread note + cross-role realtime), so the
 * Talent rail row renders filled and the agency sees the lineup. It writes once
 * per distinct cart set and never clobbers a richer already-selected set.
 *
 * Why a hook (not an inline effect): the patch + the latest selection are read
 * through refs so the effect depends only on stable inputs (open + the cart
 * signature + whether the unified path is available). That keeps the dependency
 * array honest without suppressing react-hooks/exhaustive-deps, and keeps
 * MiniChatPanel under its line cap.
 */

import { useEffect, useRef } from "react";

import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { UnifiedInquiryPatch } from "./use-unified-inquiry";

export type UseCartTalentPreloadArgs = {
  /** Panel open state — preload only while the panel is open. */
  open: boolean;
  /** The inquiry cart ids (useInquiryCart().cartIds). Empty → nothing to preload. */
  cartTalentIds?: readonly string[];
  /** Best-effort names aligned with the cart ids (friendlier system note). */
  cartTalentNames?: string[];
  /** Whether the unified patch path is available (onEnsureInquiry injected). */
  enabled: boolean;
  /** The live unified draft (to avoid clobbering an existing richer selection). */
  intent: InquiryIntent;
  /** The unified patch fn — routes the preload through the one inquiry record. */
  patch: (p: UnifiedInquiryPatch) => Promise<void>;
};

export function useCartTalentPreload({
  open,
  cartTalentIds,
  cartTalentNames,
  enabled,
  intent,
  patch,
}: UseCartTalentPreloadArgs): void {
  // Latest selection + patch + names read through refs so the effect can stay
  // keyed on stable inputs only.
  const intentRef = useRef(intent);
  const patchRef = useRef(patch);
  const namesRef = useRef(cartTalentNames);
  useEffect(() => {
    intentRef.current = intent;
    patchRef.current = patch;
    namesRef.current = cartTalentNames;
  }, [intent, patch, cartTalentNames]);

  // One write per distinct cart set.
  const preloadedKeyRef = useRef<string | null>(null);
  const ids = (cartTalentIds ?? []).filter(Boolean);
  const cartKey = ids.join(" ");

  useEffect(() => {
    if (!open || !enabled || ids.length === 0) return;
    if (preloadedKeyRef.current === cartKey) return;
    preloadedKeyRef.current = cartKey;

    const already = new Set(intentRef.current.talent?.selected_ids ?? []);
    const missing = ids.some((id) => !already.has(id));
    if (!missing) return; // selection already reflects the cart — no write needed

    // Union: keep any already-selected talent (e.g. picked in-chat) first, then
    // append the newly-carted ids.
    const union = [
      ...(intentRef.current.talent?.selected_ids ?? []),
      ...ids.filter((id) => !already.has(id)),
    ];
    void patchRef.current({
      kind: "talent",
      selectedIds: union,
      selectionMode: "i_know_who",
      selectedNames: namesRef.current,
    });
  }, [open, enabled, cartKey, ids]);
}
