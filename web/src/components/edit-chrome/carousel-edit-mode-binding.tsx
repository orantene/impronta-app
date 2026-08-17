"use client";

/**
 * CarouselEditModeBinding — the editor's ONE hold on every rotating thing.
 *
 * WHAT THIS FIXES (2026-08-17)
 * ────────────────────────────
 * #1203 shipped the pause and it works — but only on a code path that is off
 * by default. `registerCarouselEditMode()` was called from
 * `ClientBuilderCanvas` and `ClientSectionChildren`, and both of those mount
 * only when `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` is enabled
 * (`client-canvas-flag.ts`: "DEFAULT OFF. When unset ... the storefront body
 * renders EXACTLY as it does today (server-rendered canvas)"). With the flag
 * unset the operator edits a server-rendered body: no client canvas mounts, so
 * nothing registers, so `editing` stays false, so the hero carousel and every
 * container background slideshow keep rotating under the pointer. The pin from
 * the inspector's slide list still worked (the carousel is a client component
 * either way, and it subscribes on hydration) — which makes the failure worse,
 * not better: the operator clicks slide 3, sees slide 3, and then autoplay
 * moves on a beat later.
 *
 * This component is mounted by `EditShell`, which exists whenever the operator
 * is editing, on both paths. The registration is refcounted, so on the
 * flag-on path this simply sits alongside the canvas's own registration.
 *
 * It also carries the slide-follow (`useCarouselSlideFollow`) for the same
 * reason: that hook lived in `ClientBuilderCanvas` too, so with the flag off,
 * selecting a node inside slide 3 did not bring slide 3 into view. It reads
 * the live tree from `builder-tree-bridge`, which EditProvider publishes on
 * every mutation — the same tree the canvas holds.
 *
 * PREVIEW. When the operator presses Preview, every interaction layer in
 * EditShell unmounts so the page reads as a real visitor's. A slider that
 * stays frozen there is the editor lying about the page, so preview is
 * pushed into the bridge as a suppression: `editing` goes false, pins clear,
 * autoplay runs. Handled in the bridge rather than by skipping the
 * registration here, because the canvas's registration is still live on the
 * flag-on path and two sites deciding separately is how these disagree.
 *
 * Renders nothing.
 */

import { useEffect } from "react";

import {
  registerCarouselEditMode,
  setCarouselEditPreviewing,
} from "@/lib/site-admin/builder-node/carousel-edit-bridge";
import { useBuilderTree } from "./builder-tree-bridge";
import { useCarouselSlideFollow } from "./carousel-slide-follow";

export function CarouselEditModeBinding({
  previewing = false,
}: {
  /** True while the topbar Preview pill is engaged. */
  previewing?: boolean;
}) {
  const tree = useBuilderTree();

  useEffect(() => registerCarouselEditMode(), []);

  useEffect(() => {
    setCarouselEditPreviewing(previewing);
    // Leaving preview engaged in the store after this unmounts would suppress
    // edit mode for the next session in the same process.
    return () => setCarouselEditPreviewing(false);
  }, [previewing]);

  useCarouselSlideFollow(tree);

  return null;
}
