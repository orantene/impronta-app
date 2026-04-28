"use client";

/**
 * EditChrome — client entry that decides between idle pill, full editor
 * shell, the staff `?preview=1` floating-pill chrome, and (Sprint 3)
 * the iframe-child mode used by the device-preview iframe.
 *
 * The server mount (EditChromeMount) passes `editActive` based on the
 * tenant-scoped edit cookie. If false, render the idle EditPill — a
 * single "Edit" CTA that engages edit mode. If true, the URL's query
 * parameters decide which engaged surface mounts:
 *
 *   - `preview=1`  → PreviewPill: clean visitor-style view of the live
 *                    storefront with a floating bottom-right pill
 *                    (device switcher + Share + Back to edit). Public
 *                    header / footer / search bar render normally; the
 *                    full editor shell stays unmounted. Use case: a
 *                    designer wants to sanity-check the visitor view
 *                    without leaving the staff session.
 *   - `iframe=1`   → IframeChild: Sprint 3 device-preview mode. The
 *                    parent editor renders an `<iframe>` at the chosen
 *                    device width (390 / 834 px) pointing at the same
 *                    storefront URL with `?iframe=1` appended. Inside
 *                    the iframe we render JUST the storefront content
 *                    + a minimal SelectionLayer + a postMessage bridge
 *                    that propagates section selection to the parent.
 *                    No topbar, no inspector, no drawers — those live
 *                    in the parent. Replaces the body-width-clip
 *                    DeviceFrameStyle with a real iframe so CSS
 *                    @media queries fire on the iframe's viewport
 *                    (the device width), not the host viewport.
 *   - default      → EditShell: the full editor chrome (top bar,
 *                    inspector, navigator, drawers, palette overlays).
 *
 * Deep-link engage: when the URL has `?edit=1` and edit mode isn't
 * active yet, render EditPill in `autoEnter` mode so it submits the
 * enter-edit-mode action immediately on hydrate. Used by admin shell
 * "Open editor" CTAs that hand off across origins (admin host →
 * storefront host) — the operator doesn't need a second click.
 *
 * In shell mode an SSR-inlined `<style>` applies the body padding for
 * the top bar and the right-side inspector gutter — SSR so it applies
 * immediately without waiting for hydration. In preview mode the
 * PreviewPill component injects its own inverse `<style>` to undo the
 * shell's body-padding + header-hide rules; the storefront DOM
 * continues to render underneath in either case (we are always on the
 * real page). Iframe-child mode injects yet another inverse style to
 * make the storefront render at full bleed inside the iframe (no
 * topbar gap, no inspector gutter — there's no chrome here).
 *
 * Hook ordering: `useSearchParams` runs before any conditional return
 * so the hook order is stable across the four render branches. The
 * search-params subscription means flipping params on/off smoothly
 * remounts the right surface without a hard reload.
 */

import { useSearchParams } from "next/navigation";

import { EditPill } from "./edit-pill";
import { EditShell } from "./edit-shell";
import { IframeChild } from "./iframe-child";
import { PreviewPill } from "./preview-pill";

interface EditChromeProps {
  tenantId: string;
  editActive: boolean;
  /** Effective storefront locale for the current request. Threaded into
   *  EditShell → EditProvider so the editor loads the matching homepage row.
   *  Optional: the EditPill / PreviewPill branches don't need it. */
  locale?: string;
  /** Slug of the current page being edited, or null for the homepage.
   *  Parsed from the URL pathname in EditChromeMount and threaded down so
   *  the editor loads the correct page's composition. */
  pageSlug?: string | null;
  /** Locales the active tenant publishes. Threaded down so the topbar
   *  locale switcher renders on first paint without waiting for the
   *  composition load round-trip. Empty array → no switcher. */
  availableLocales?: ReadonlyArray<string>;
  /**
   * T1-2 — server-prefetched composition snapshot. EditChromeMount loads
   * this when editActive is true so EditProvider seeds its state from real
   * data on first paint. Eliminates the "0 sections" flash that hits all
   * three surfaces (navigator, canvas insert points, publish drawer) while
   * the client-side action round-trips.
   */
  initialComposition?: import("@/lib/site-admin/edit-mode/composition-actions").CompositionData | null;
}

export function EditChrome({
  tenantId,
  editActive,
  locale,
  pageSlug,
  availableLocales,
  initialComposition,
}: EditChromeProps) {
  // Always call useSearchParams unconditionally to keep hook order
  // stable; the EditPill branch ignores the subscription.
  const searchParams = useSearchParams();
  const previewMode = searchParams?.get("preview") === "1";
  const editIntent = searchParams?.get("edit") === "1";
  const iframeMode = searchParams?.get("iframe") === "1";

  // Sprint 3 — iframe-child mode. The parent editor mounts an <iframe>
  // pointing at the same URL with `?iframe=1`. Here in the iframe we
  // render a minimal selection-layer + postMessage bridge over the
  // storefront DOM. The host page (Vercel runtime) sees this branch
  // and skips the chrome (topbar, inspector, drawers, navigator) so
  // the iframe's viewport matches the device frame exactly. CSS @media
  // queries fire on the iframe's viewport, fixed-position storefront
  // elements anchor to it correctly — the things the body-width clip
  // got wrong.
  //
  // This branch runs BEFORE the !editActive check so the iframe never
  // shows an EditPill (the iframe is purely a preview surface; the
  // parent already engaged edit mode). When editActive is false the
  // iframe still renders a usable read-only storefront preview at the
  // right device width — useful even before edit mode is engaged.
  if (iframeMode) {
    return (
      <IframeChild
        tenantId={tenantId}
        locale={locale}
        pageSlug={pageSlug}
        availableLocales={availableLocales}
        initialComposition={initialComposition}
      />
    );
  }

  if (!editActive) return <EditPill autoEnter={editIntent} />;

  if (previewMode) return <PreviewPill />;

  return (
    <>
      <style>{`
        body { padding-top: 54px !important; }
        /* padding-right on lg is managed client-side by BodyPaddingController
           in EditShell so it can animate in/out with the inspector dock. */
        header[data-public-header] { display: none !important; }
      `}</style>
      <EditShell
        tenantId={tenantId}
        locale={locale}
        pageSlug={pageSlug}
        availableLocales={availableLocales}
        initialComposition={initialComposition}
      />
    </>
  );
}
