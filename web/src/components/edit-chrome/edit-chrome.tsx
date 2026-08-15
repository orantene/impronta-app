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

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  buildHomepageBuilderConfig,
  buildCmsPageBuilderConfig,
  buildSiteShellBuilderConfig,
} from "@/lib/site-admin/builder-core/config";
import { homepageAdapter } from "@/lib/site-admin/builder-core/adapters/homepage-adapter";
import { createBoundCmsPageAdapter } from "@/lib/site-admin/builder-core/adapters/cms-page-adapter";
import { createBoundSiteShellAdapter } from "@/lib/site-admin/builder-core/adapters/site-shell-adapter";
import { EditPill } from "./edit-pill";
import { EditShellLoading } from "./edit-shell-loading";
import { IframeChild } from "./iframe-child";
import { PreviewPill } from "./preview-pill";
import { EDIT_TOPBAR_H } from "./kit";

/** Deferred until edit mode engages — keeps idle storefront bundle lean. */
const EditShell = dynamic(
  () => import("./edit-shell").then((m) => ({ default: m.EditShell })),
  { ssr: false, loading: () => <EditShellLoading /> },
);

interface EditChromeProps {
  tenantId: string;
  editActive: boolean;
  workspacePlan?: string | null;
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
  /** Tenant default storefront locale for LocaleSwitcher path shaping. */
  defaultLocale?: string;
  /**
   * T1-2 — server-prefetched composition snapshot. EditChromeMount loads
   * this when editActive is true so EditProvider seeds its state from real
   * data on first paint. Eliminates the "0 sections" flash that hits all
   * three surfaces (navigator, canvas insert points, publish drawer) while
   * the client-side action round-trips.
   */
  initialComposition?: import("@/lib/site-admin/edit-mode/composition-actions").CompositionData | null;
  /** Storefront public name — top bar shows Tulala Builder vs this tenant site. */
  tenantSiteLabel?: string | null;
  /**
   * `agencies.slug` / workspace URL segment for `/{slug}/admin/*`.
   * Null on hub storefronts (no host-level slug); edit chrome falls back to legacy `/admin/site-settings/*` redirects.
   */
  workspaceMembershipSlug?: string | null;
  /** True only for platform owners (super_admin) — gates raw-HTML `code` insertion. */
  canInsertRawHtmlElements?: boolean;
  /**
   * Wave 4.1 — when true, this cms_page is FREEFORM (`is_freeform=true`): build
   * the freeform cms_page config + adapter (writes `cms_pages.blocks`) instead of
   * the legacy homepage/slot config. Resolved server-side in EditChromeMount.
   * The homepage + system + existing slot pages are never freeform, so they keep
   * the byte-identical homepage path.
   */
  freeformPageMode?: boolean;
  /**
   * WS-A A2 — when true, the editor is mounted on the `site_shell` SURFACE: build
   * the freeform site_shell config + adapter (writes the shell `cms_pages.blocks`
   * draft, publishes via site-shell-publish). Resolved server-side in
   * EditChromeMount behind `shouldRouteSiteShellSurface` (OFF by default). Takes
   * precedence over `freeformPageMode` (the shell is never a freeform cms_page).
   * With the routing flag off this is always false → the homepage/cms_page path
   * is byte-identical.
   */
  siteShellMode?: boolean;
}

export function EditChrome({
  tenantId,
  editActive,
  workspacePlan,
  locale,
  pageSlug,
  availableLocales,
  defaultLocale,
  initialComposition,
  tenantSiteLabel = null,
  workspaceMembershipSlug = null,
  canInsertRawHtmlElements = false,
  freeformPageMode = false,
  siteShellMode = false,
}: EditChromeProps) {
  // Always call useSearchParams unconditionally to keep hook order
  // stable; the EditPill branch ignores the subscription.
  const searchParams = useSearchParams();
  const previewMode = searchParams?.get("preview") === "1";
  const editIntent = searchParams?.get("edit") === "1";
  const iframeMode = searchParams?.get("iframe") === "1";

  // WS1 core-adapter seam — the homepage builder config. The storefront editor
  // is the homepage surface: build its config here (in the client boundary so
  // the adapter's server-action-backed functions stay client-callable, not
  // serialized across RSC) and thread it through EditShell → EditProvider. The
  // homepage adapter is a pure pass-through over the existing four homepage
  // actions, so this is byte-identical to the prior behaviour — EditProvider's
  // own default is this very same config; passing it explicitly makes the
  // storefront surface contract visible and threads the resolved raw-HTML gate.
  const surfaceConfig = useMemo(
    () =>
      siteShellMode
        ? // WS-A A2 — the site_shell SURFACE: edit the shared header/footer as a
          // freeform tree persisted to the shell row's cms_pages.blocks (never
          // cms_page_sections), published via site-shell-publish. The adapter is
          // keyed by locale. Only reachable when EditChromeMount green-lit the
          // surface (routing flag ON) — otherwise siteShellMode is false.
          buildSiteShellBuilderConfig(
            createBoundSiteShellAdapter(locale ?? "en"),
            { canInsertRawHtmlElements },
          )
        : freeformPageMode
          ? // Wave 4.1 — freeform cms_page: write the BuilderNode[] tree to
            // cms_pages.blocks via the cms_page adapter (never cms_page_sections).
            buildCmsPageBuilderConfig(createBoundCmsPageAdapter(), {
              canInsertRawHtmlElements,
            })
          : // Homepage + system + slot pages: byte-identical homepage path.
            buildHomepageBuilderConfig(homepageAdapter, { canInsertRawHtmlElements }),
    [canInsertRawHtmlElements, freeformPageMode, siteShellMode, locale],
  );

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
        workspacePlan={workspacePlan}
        locale={locale}
        pageSlug={pageSlug}
        availableLocales={availableLocales}
        defaultLocale={defaultLocale}
        initialComposition={initialComposition}
        tenantSiteLabel={tenantSiteLabel}
        workspaceMembershipSlug={workspaceMembershipSlug}
        canInsertRawHtmlElements={canInsertRawHtmlElements}
        surfaceConfig={surfaceConfig}
      />
    );
  }

  // Idle storefront: just the Edit pill.
  //
  // WAVE 6.1 — the admin quick bar used to render here too. It now has its own
  // server mount (`AdminQuickBarMount`, rendered from the root layout) so it can
  // reach the tenant's public pages the editor does not own: /directory, and any
  // other public route. Rendering it from BOTH places would stack two bars on
  // the surfaces they overlap, so this branch deliberately renders only the pill
  // and the mount is the single owner.
  if (!editActive) {
    return <EditPill autoEnter={editIntent} />;
  }

  // The pill's "Generate link" mints a share token; without the page identity
  // it would mint one for the HOMEPAGE no matter which page is on screen.
  // Preview mode has no EditContext, so the identity comes from the same props
  // EditChromeMount parsed out of the URL.
  if (previewMode) return <PreviewPill pageSlug={pageSlug} locale={locale} />;

  return (
    <>
      <style>{`
        body { padding-top: ${EDIT_TOPBAR_H}px !important; background: #F9F9FB !important; }
        /* Lateral body padding is managed by BodyPaddingController in EditShell
           when workspaceCanvasMode is reserveGutters; fullBleed (default) uses none. */
        /* Keep the storefront header visible below the edit topbar so
           operators can see their nav while editing. The header is sticky
           top-0 by default; offset it to sit below the topbar. */
        header[data-public-header] { top: ${EDIT_TOPBAR_H}px !important; }
      `}</style>
      <EditShell
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        pageSlug={pageSlug}
        availableLocales={availableLocales}
        defaultLocale={defaultLocale}
        initialComposition={initialComposition}
        tenantSiteLabel={tenantSiteLabel}
        workspaceMembershipSlug={workspaceMembershipSlug}
        canInsertRawHtmlElements={canInsertRawHtmlElements}
        surfaceConfig={surfaceConfig}
      />
    </>
  );
}
