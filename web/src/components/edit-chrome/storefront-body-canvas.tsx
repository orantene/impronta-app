"use client";

/**
 * StorefrontBodyCanvas — the cms-page storefront body's live editing canvas
 * (wave-2 of the page-builder 8/10 program).
 *
 * The freeform cms_page route (`/p/[[...slug]]`) used to server-render its tree
 * with NO client canvas: every mutation persisted but painted nothing until a
 * hard reload, while `EditShell`'s `<InEditorCanvasRegion>` painted a DUPLICATE
 * copy of the page below the storefront footer. This component gives the route
 * the exact hosting the homepage has had since W3 Sub-step B:
 *
 *   - renders `<ClientBuilderCanvas>` (the same live-tree bridge subscriber the
 *     homepage mounts), so edits repaint IN PLACE in the visible body;
 *   - registers the storefront-body signal on the canvas bridge, which
 *     `<InEditorCanvasRegion>` reads to suppress its duplicate paint.
 *
 * Server callers mount this ONLY in edit mode with the client-canvas flag on —
 * anonymous visitors keep the pure server render (and never load this chunk).
 */

import { useEffect } from "react";
import type { ReactNode } from "react";

import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import { ClientBuilderCanvas, type ClientBuilderCanvasProps } from "./client-builder-canvas";
import { registerStorefrontBodyCanvasMount } from "./client-builder-canvas-bridge";

export function StorefrontBodyCanvas(props: ClientBuilderCanvasProps): ReactNode {
  // Announce the body-hosted canvas so the shell's in-editor region (mounted
  // for every non-homepage surface) stops double-painting the page below the
  // footer. Cleanup on unmount keeps the region working for the chrome-only
  // hosts (Builder Lab / talent pages) where no body exists.
  useEffect(() => registerStorefrontBodyCanvasMount(), []);

  return (
    <BuilderProfilerBoundary id="builder-canvas">
      <ClientBuilderCanvas {...props} />
    </BuilderProfilerBoundary>
  );
}
