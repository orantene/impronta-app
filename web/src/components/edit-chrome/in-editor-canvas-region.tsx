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

import type { ReactNode } from "react";

import type { CSSProperties } from "react";

import { ClientBuilderCanvas } from "./client-builder-canvas";
import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import { InEditorEmptyCanvas } from "./in-editor-empty-canvas";
import { useBuilderTree } from "./builder-tree-bridge";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";

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

  // Empty page → adapter-neutral starter affordance (opens Add Gallery). The
  // canvas still mounts below so the first insert paints in place.
  const isEmpty = tree.length === 0;

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
      {...tokenDataAttrs}
      style={{ ...canvasBackground, ...(tokenCssVars as CSSProperties) }}
    >
      {isEmpty ? <InEditorEmptyCanvas /> : null}
      <BuilderProfilerBoundary id="builder-canvas">
        <ClientBuilderCanvas
          initialTree={tree}
          dataSources={canvasRenderData?.dataSources ?? {}}
          sectionEmbedIslands={canvasRenderData?.sectionEmbedIslands ?? {}}
          publicPathPrefix={canvasRenderData?.publicPathPrefix ?? ""}
          components={{}}
          componentStyleDefaults={canvasRenderData?.componentStyleDefaults}
          includeRendererStyles
        />
      </BuilderProfilerBoundary>
    </div>
  );
}
