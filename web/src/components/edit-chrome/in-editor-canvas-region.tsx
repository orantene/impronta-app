"use client";

/**
 * InEditorCanvasRegion — mounts a `<ClientBuilderCanvas>` IN the editor chrome
 * for the NON-homepage builder surfaces (workspace_page / talent_page /
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

import { ClientBuilderCanvas } from "./client-builder-canvas";
import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import { InEditorEmptyCanvas } from "./in-editor-empty-canvas";
import { useBuilderTree } from "./builder-tree-bridge";
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

  return (
    <div data-in-editor-canvas-region>
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
