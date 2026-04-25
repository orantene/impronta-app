"use client";

/**
 * EditChrome — client entry that decides between idle pill, full editor
 * shell, and the staff `?preview=1` floating-pill chrome.
 *
 * The server mount (EditChromeMount) passes `editActive` based on the
 * tenant-scoped edit cookie. If false, render the idle EditPill — a
 * single "Edit" CTA that engages edit mode. If true, the URL's
 * `?preview` parameter decides which engaged surface mounts:
 *
 *   - `preview=1`  → PreviewPill: clean visitor-style view of the live
 *                    storefront with a floating bottom-right pill
 *                    (device switcher + Share + Back to edit). Public
 *                    header / footer / search bar render normally; the
 *                    full editor shell stays unmounted. Use case: a
 *                    designer wants to sanity-check the visitor view
 *                    without leaving the staff session.
 *   - default      → EditShell: the full editor chrome (top bar,
 *                    inspector, navigator, drawers, palette overlays).
 *
 * In shell mode an SSR-inlined `<style>` applies the body padding for
 * the top bar and the right-side inspector gutter — SSR so it applies
 * immediately without waiting for hydration. In preview mode the
 * PreviewPill component injects its own inverse `<style>` to undo the
 * shell's body-padding + header-hide rules; the storefront DOM
 * continues to render underneath in either case (we are always on the
 * real page).
 *
 * Hook ordering: `useSearchParams` runs before any conditional return
 * so the hook order is stable across the three render branches. The
 * search-params subscription means flipping `?preview=1` on/off
 * smoothly remounts the right surface without a hard reload.
 */

import { useSearchParams } from "next/navigation";

import { EditPill } from "./edit-pill";
import { EditShell } from "./edit-shell";
import { PreviewPill } from "./preview-pill";

interface EditChromeProps {
  tenantId: string;
  editActive: boolean;
}

export function EditChrome({ tenantId, editActive }: EditChromeProps) {
  // Always call useSearchParams unconditionally to keep hook order
  // stable; the EditPill branch ignores the subscription.
  const searchParams = useSearchParams();
  const previewMode = searchParams?.get("preview") === "1";

  if (!editActive) return <EditPill />;

  if (previewMode) return <PreviewPill />;

  return (
    <>
      <style>{`
        body { padding-top: 54px !important; }
        /* padding-right on lg is managed client-side by BodyPaddingController
           in EditShell so it can animate in/out with the inspector dock. */
        header[data-public-header] { display: none !important; }
      `}</style>
      <EditShell tenantId={tenantId} />
    </>
  );
}
