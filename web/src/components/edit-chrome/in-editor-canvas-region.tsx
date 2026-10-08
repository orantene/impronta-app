"use client";

/**
 * InEditorCanvasRegion — mounts a `<ClientBuilderCanvas>` IN the editor chrome
 * for the NON-homepage builder surfaces (cms_page / talent_page /
 * platform_lab).
 *
 * Why this exists: the homepage paints its freeform tree because the storefront
 * page body mounts `<ClientBuilderCanvas>` underneath the editor chrome. The
 * other surfaces mount `BuilderEditorMount` → `EditShell`, which renders ONLY
 * chrome — there is no storefront body beneath them, so the saved tree (which
 * DOES save and DOES appear in Layers) never rendered on canvas. This region
 * supplies that missing body.
 *
 * Live repaint: `ClientBuilderCanvas` reads the LIVE tree from the canvas bridge
 * (`subscribeBuilderCanvasTree`), which `EditProvider` now publishes for these
 * surfaces regardless of the env flag (see edit-context publish effect). So an
 * edit / insert repaints here instantly even when the server-built render data
 * was empty (e.g. an ephemeral Lab page or a not-yet-loaded tree).
 *
 * `includeRendererStyles` is TRUE here: unlike the homepage, no server head
 * emits `<BuilderNodeRendererStyles>` for these surfaces, so the canvas must.
 *
 * Selection / inline-edit / presence overlays attach automatically: they query
 * `[data-builder-node-id]` from the document, and this region renders in normal
 * flow under the overlay portal — the painted nodes carry those attributes.
 */

import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import type { ReactNode } from "react";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

import { ClientBuilderCanvas } from "./client-builder-canvas";
import { useEditContext } from "./edit-context";
import { PrintArtboard } from "./print-artboard";
import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import { EmptyCanvasStarter } from "./empty-canvas-starter";
import { CHROME, EDIT_TOPBAR_H } from "./kit/tokens";
import { useBuilderTree } from "./builder-tree-bridge";
import { useEditorLocale } from "./use-editor-locale";
import { useActiveContentLocale } from "./active-content-locale-bridge";
import { resolveCanvasLabelLocale } from "./editing-locale";
import {
  isStorefrontBodyPresent,
  subscribeStorefrontBodyCanvas,
} from "./client-builder-canvas-bridge";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import { applyTalentLiveText, type TalentLiveText } from "@/lib/talent-site/live-text";
import { applyTalentTickerServices } from "@/lib/talent-site/ticker-services";
import { hydratePlaceholders } from "@/lib/talent-site/theme-template/hydrate-placeholders";

export interface InEditorCanvasRegionProps {
  /**
   * Server-assembled render data (data sources + pre-rendered section_embed
   * islands + component-style defaults + path prefix). May be null when the
   * hosting surface has no resolved subject / tree yet (e.g. the Builder Lab
   * with no subject picked) — then the canvas renders against empty inputs and
   * the bridge paints live inserts.
   */
  canvasRenderData: InEditorCanvasRenderData | null;
}

export function InEditorCanvasRegion({
  canvasRenderData,
}: InEditorCanvasRegionProps): ReactNode {
  // The live tree the provider publishes (insert/edit/reorder repaint here).
  const tree = useBuilderTree();
  // Piece B slice 1c — a print design renders on a fixed physical artboard with
  // a persistent trim/safe guide, not a fluid page. Null for every other surface.
  const {
    printArtboard,
    compositionLoaded,
    compositionError,
    refreshComposition,
  } = useEditContext();

  // Wave-2 cms-page canvas — when the STOREFRONT BODY paints the tree at all
  // (the live `<StorefrontBodyCanvas>` in edit mode, OR — stale-body fix
  // 2026-08-15 — a SERVER-rendered body announced by
  // `<StorefrontBodyServerMarker>` when the client-canvas flag/capability gate
  // kept the body canvas out), this region must not paint the same tree a
  // second time below the footer. The server-render case matters doubly: this
  // region's own ClientBuilderCanvas used to count as "a canvas repaints this
  // page", which suppressed the per-edit router.refresh() safety net and left
  // the visible server body stale on every tree edit. Subscribed (not read
  // once) so the region reacts when either signal arrives after the shell
  // (auto-enter engage → RSC refresh re-renders the body). Chrome-only hosts
  // (Builder Lab / talent pages / ephemeral cms drafts whose body 404s) never
  // set either signal, so this region keeps painting for them.
  const bodyCanvasMounted = useSyncExternalStore(
    subscribeStorefrontBodyCanvas,
    isStorefrontBodyPresent,
    () => false,
  );

  // ONB-1 — empty page → the SHARED, surface-parameterized EmptyCanvasStarter
  // (the same picker the homepage uses), replacing the old passive
  // InEditorEmptyCanvas stub so no non-homepage surface falls off a blank-page
  // cliff. It derives its starter set from the EditContext `surfaceKind`, and
  // applies through the shared `applyPageDesignWithUndo` chokepoint → the
  // active SurfaceAdapter (undo + autosave inherited). The canvas still mounts
  // below so the first insert / applied design paints in place.
  const isEmpty = tree.length === 0;
  // An empty tree is only an EMPTY PAGE once the composition has loaded. While
  // the load is in flight, or after it failed, the tree is empty because
  // nothing arrived, and offering "Describe your page / Start from scratch"
  // there told a talent with a full live site that their page was blank (and
  // invited them to overwrite it). A failed load now says so, with a retry.
  const loadFailed = isEmpty && !!compositionError;
  // F113: the builder-tree bridge is empty in the server HTML and until the
  // provider publishes the seeded tree after hydration, so "empty" before mount
  // is "not known yet", never "empty page". Until then paint a skeleton, and
  // offer the starter only when the tree is truly empty on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t } = useEditorLocale();
  const showStarter = mounted && isEmpty && compositionLoaded && !compositionError;
  const showSkeleton = isEmpty && !showStarter && !loadFailed;

  // talent_page: seeded labels follow the SITE locale + booking mode on the
  // canvas, exactly as the live render localises them (render-time only).
  const labelLocale = canvasRenderData?.labelLocale ?? null;
  // Template Factory editor: the design keeps `{{placeholders}}`; the canvas fills them from the demo talent.
  const placeholders = canvasRenderData?.placeholders ?? null;
  // TUL-70 round 3: follow the builder's editing locale (the same store the
  // inspector tabs and the top-bar pill use), not the fixed server site locale.
  const editingLocale = useActiveContentLocale().locale;
  const labelLoc = labelLocale ? resolveCanvasLabelLocale(labelLocale.locale, editingLocale) : null;
  const labelLocaleCode = labelLoc?.locale;
  const labelFollowsSite = labelLoc?.followsSite ?? true;
  const transformTree = useCallback(
    (t: BuilderNodeTree): BuilderNodeTree => {
      let out = t;
      if (labelLocale) {
        out = localiseSeededDesignLabels(
          out as Parameters<typeof localiseSeededDesignLabels>[0],
          labelLocaleCode,
          labelLocale.ctaMode,
          labelFollowsSite ? labelLocale.swaps : {},
        ) as BuilderNodeTree;
        // Lines that follow her profile show their live value, as on the live page.
        // Resolved server-side for the site locale only, so skipped in other locales.
        if (labelLocale.live && labelFollowsSite) {
          out = applyTalentLiveText(
            out as Parameters<typeof applyTalentLiveText>[0],
            labelLocale.live as TalentLiveText,
          ) as BuilderNodeTree;
        }
      }
      if (labelLocale?.tickerWords?.length && labelFollowsSite) {
        out = applyTalentTickerServices(
          out as Parameters<typeof applyTalentTickerServices>[0],
          labelLocale.tickerWords,
        ) as BuilderNodeTree;
      }
      if (placeholders) {
        out = hydratePlaceholders(
          out as Parameters<typeof hydratePlaceholders>[0],
          placeholders,
          labelLocaleCode ?? labelLocale?.locale,
        ) as BuilderNodeTree;
      }
      return out;
    },
    [labelLocale, placeholders, labelLocaleCode, labelFollowsSite],
  );

  // Body-hosted page (freeform cms_page on the storefront): the visible canvas
  // lives in the page body — render NOTHING here so the page never paints
  // twice. The empty-page starter still needs this region (it reads EditContext,
  // which the body subtree cannot), so an empty tree keeps the starter (the
  // body canvas paints nothing for an empty tree — no duplicate either way).
  if (bodyCanvasMounted && !isEmpty) return null;

  // Surface-scoped LIVE design tokens (talent_page → the talent's published
  // theme) painted on the canvas root at first paint. Same projection as the
  // public render + storefront. The drawer's preview bridge overlays the DRAFT
  // on top of these vars via ThemePreviewProjector → the canvas recolours live.
  const designTokens = canvasRenderData?.designTokens;
  const hasTokens = !!designTokens && Object.keys(designTokens).length > 0;
  const tokenCssVars = hasTokens ? designTokensToCssVars(designTokens) : {};
  const headingFamily = designTokens?.["typography.heading-font-family"]?.trim();
  const bodyFamily = designTokens?.["typography.body-font-family"]?.trim();
  if (headingFamily) tokenCssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) tokenCssVars["--site-body-font"] = bodyFamily;
  const tokenDataAttrs = hasTokens ? designTokensToDataAttrs(designTokens) : {};
  // Paint the canvas background from the surface's `color.background` token,
  // defaulting WHITE so a brand-new / default / light theme shows a white canvas
  // instead of the dark builder chrome behind this region. The CSS rule on
  // `[data-theme-canvas-root]` (token-presets.css) consumes the same var; this
  // inline value guarantees the paint even before the projector runs and
  // regardless of the editor host's <html> --token-color-background. The Theme
  // drawer's live preview overwrites --token-color-background on this root, so
  // changing color.background still repaints live.
  const canvasBackground: CSSProperties = {
    backgroundColor: "var(--token-color-background, #ffffff)",
    // Fill the editor canvas viewport so a short page still paints the theme
    // background all the way down (otherwise the dark editor chrome shows below
    // the content). Matches the public talent/workspace page shell.
    minHeight: "100vh",
  };

  const canvas = (
    <ClientBuilderCanvas
      initialTree={tree}
      dataSources={canvasRenderData?.dataSources ?? {}}
      sectionEmbedIslands={canvasRenderData?.sectionEmbedIslands ?? {}}
      publicPathPrefix={canvasRenderData?.publicPathPrefix ?? ""}
      components={{}}
      componentStyleDefaults={canvasRenderData?.componentStyleDefaults}
      includeRendererStyles
      transformTree={labelLocale || placeholders ? transformTree : undefined}
      visitorLocale={labelLocaleCode ?? labelLocale?.locale}
    />
  );

  // talent_page: the site header / footer the live site wraps the page in.
  // Read-only here (edited in the shell builder), so `inert` keeps their
  // links and controls from navigating away or stealing canvas selection.
  const shellHeader = canvasRenderData?.shellHeader ?? null;
  const shellFooter = canvasRenderData?.shellFooter ?? null;
  const shellSocket = canvasRenderData?.shellSocket ?? null;

  return (
    // `data-theme-canvas-root` makes this the projection target for the Theme
    // drawer's live preview (ThemePreviewProjector → CSS-var channel). The
    // homepage paints into its storefront body (which carries the same marker);
    // the non-homepage surfaces (cms_page / talent_page / platform_lab)
    // paint here, so the marker must live on this region too — otherwise a token
    // edit has no canvas-root to recolour and GAP A silently no-ops.
    <div
      data-in-editor-canvas-region
      data-theme-canvas-root=""
      data-talent-design={canvasRenderData?.designSlug ?? undefined}
      {...tokenDataAttrs}
      style={{
        ...canvasBackground,
        ...(tokenCssVars as CSSProperties),
        // The builder top bar is fixed over the top of the page; when the site
        // header is shown, start the canvas below the bar (and pin the sticky
        // header there) so it is never hidden underneath it.
        ...(shellHeader ? { paddingTop: EDIT_TOPBAR_H } : null),
      }}
    >
      <TypeSystemStyle />
      {canvasRenderData?.headNodes ?? null}
      {shellHeader ? (
        <div
          data-talent-builder-shell="header"
          data-talent-max-site-header=""
          {...(canvasRenderData?.shellHeaderOverHero ? { "data-over-hero": "true" } : {})}
          style={{ top: EDIT_TOPBAR_H }}
          inert
        >
          {shellHeader}
        </div>
      ) : null}
      {showStarter ? <EmptyCanvasStarter /> : null}
      {showSkeleton ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("Loading your page…")}
          data-in-editor-canvas-skeleton=""
          className="animate-pulse"
          style={{ margin: "72px auto", maxWidth: 960, padding: "0 24px", display: "grid", gap: 20 }}
        >
          {[220, 120, 160].map((h) => (
            <div key={h} style={{ height: h, borderRadius: 14, background: CHROME.paper2 }} />
          ))}
        </div>
      ) : null}
      {loadFailed ? (
        <div
          role="alert"
          data-in-editor-load-error=""
          style={{
            margin: "48px auto",
            maxWidth: 440,
            padding: "20px 24px",
            borderRadius: 12,
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
            color: CHROME.text,
            fontSize: 14,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            We could not open this page. Your site is safe and nothing was changed.
          </p>
          <button
            type="button"
            onClick={() => void refreshComposition({ undoResetReason: "reload" })}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${CHROME.controlBorder}`,
              background: CHROME.controlFill,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      <BuilderProfilerBoundary id="builder-canvas">
        {printArtboard ? (
          <PrintArtboard
            widthMm={printArtboard.widthMm}
            heightMm={printArtboard.heightMm}
            bleedMm={printArtboard.bleedMm}
          >
            {canvas}
          </PrintArtboard>
        ) : (
          canvas
        )}
      </BuilderProfilerBoundary>
      {shellFooter ? (
        <footer data-talent-builder-shell="footer" data-talent-max-site-footer="" inert>
          {shellFooter}
        </footer>
      ) : null}
      {shellSocket ? (
        <div data-talent-builder-shell="socket" inert>
          {shellSocket}
        </div>
      ) : null}
    </div>
  );
}
