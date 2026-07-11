"use client";

/**
 * use-starter-sync — the `impronta:starter-*` window CustomEvent bridge,
 * peeled out of edit-context.tsx (W4-F2 god-file decomposition).
 *
 * DELIBERATELY still a window-event bus, NOT a context callback: the
 * empty-canvas starter card is rendered in the STOREFRONT tree (outside
 * `EditProvider`), so it cannot reach this provider through context. The
 * events are the only channel that crosses that React-tree boundary —
 * edit-shell.tsx also listens to `impronta:starter-applied` for its own
 * chrome. Replacing the bus would change cross-tree timing; left as-is.
 */

import { useEffect } from "react";

/** Dispatched from storefront surfaces outside `EditProvider` (empty canvas) to open the template gallery overlay. */
export const IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT = "impronta:open-template-gallery";

export function useStarterSyncBridge(input: {
  refreshComposition: (opts?: {
    undoResetReason?: "conflict" | "reload";
  }) => Promise<void>;
  queueRouterRefresh: () => Promise<void>;
  openStarterTemplateGallery: (highlightedSlug?: string | null) => void;
}) {
  const { refreshComposition, queueRouterRefresh, openStarterTemplateGallery } =
    input;

  // Empty-canvas starter bridge:
  // the starter card is rendered in the storefront tree (not inside
  // EditProvider), so after it applies a starter we listen for its window
  // event and refresh both composition state and server-rendered canvas here.
  // Saved workspace templates cannot mount on that card (no context); CTAs
  // dispatch IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT so we open the shell modal here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // QA 2026-05-13 — unmount guard. The IIFE could resolve AFTER the
    // EditProvider unmounted (operator navigated away mid-starter-apply),
    // firing `queueRouterRefresh` against a detached router and
    // dispatching `impronta:starter-sync-complete` into a dead tree.
    let unmounted = false;
    const onStarterApplied = () => {
      void (async () => {
        await refreshComposition();
        if (unmounted) return;
        void queueRouterRefresh();
        window.dispatchEvent(new CustomEvent("impronta:starter-sync-complete"));
      })();
    };
    const onOpenTemplateGallery = () => {
      openStarterTemplateGallery(null);
    };
    window.addEventListener("impronta:starter-applied", onStarterApplied);
    window.addEventListener(IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT, onOpenTemplateGallery);
    return () => {
      unmounted = true;
      window.removeEventListener("impronta:starter-applied", onStarterApplied);
      window.removeEventListener(IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT, onOpenTemplateGallery);
    };
  }, [openStarterTemplateGallery, refreshComposition, queueRouterRefresh]);}
