"use client";

import { useCallback, type MutableRefObject } from "react";

import type { BuilderSurfaceAdapter } from "@/lib/site-admin/builder-core/surface-adapter";

import type { EditContextValue } from "./edit-context-types";

/**
 * Reset the draft to the surface's live body through the SURFACE adapter, then
 * reload the composition so the canvas shows it. Returns `undefined` when the
 * surface has no `discardDraft` (the topbar then keeps the homepage action).
 * A version conflict reloads authoritative state like every other write.
 */
export function useDiscardDraftToLive({
  surfaceAdapter,
  locale,
  pageSlug,
  pageId,
  pageVersionRef,
  refreshComposition,
  reportMutationError,
}: {
  surfaceAdapter: BuilderSurfaceAdapter;
  locale: string;
  pageSlug: string | null | undefined;
  pageId: string | null | undefined;
  pageVersionRef: MutableRefObject<number | null>;
  refreshComposition: EditContextValue["refreshComposition"];
  reportMutationError: EditContextValue["reportMutationError"];
}): EditContextValue["discardDraftToLive"] {
  const supported = Boolean(surfaceAdapter.discardDraft);
  const run = useCallback(async () => {
    if (!surfaceAdapter.discardDraft) {
      return { ok: false, error: "This page can't go back to the live version." };
    }
    const res = await surfaceAdapter.discardDraft(
      { locale, pageSlug, pageId },
      { expectedVersion: pageVersionRef.current ?? 0 },
    );
    if (!res.ok) {
      if (res.code === "VERSION_CONFLICT") await refreshComposition({ undoResetReason: "conflict" });
      reportMutationError(res.error);
      return { ok: false, error: res.error };
    }
    await refreshComposition();
    return { ok: true };
  }, [surfaceAdapter, locale, pageSlug, pageId, pageVersionRef, refreshComposition, reportMutationError]);
  return supported ? run : undefined;
}
