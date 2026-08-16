"use client";

/**
 * StorefrontBodyServerMarker — announces that the storefront page body is
 * SERVER-rendered while edit mode is active (client-canvas flag off, or the
 * body-canvas capability gate failed on `/p/[[...slug]]`).
 *
 * Registered on the same bridge listener set as the body CANVAS signal, so
 * `<InEditorCanvasRegion>` suppresses its duplicate paint for BOTH hostings.
 * Without it, the region painted the tree a second time below the footer AND
 * (worse) its `<ClientBuilderCanvas>` counted as "a canvas repaints this
 * page", which suppressed the per-edit `router.refresh()` safety net — so the
 * server body the operator was actually looking at went stale on every tree
 * edit. See the 2026-08-15 note in client-builder-canvas-bridge.ts.
 *
 * Renders nothing; only edit-mode server callers mount it (anonymous visitors
 * never load this chunk).
 */

import { useEffect } from "react";

import { registerServerRenderedStorefrontBody } from "./client-builder-canvas-bridge";

export function StorefrontBodyServerMarker(): null {
  useEffect(() => registerServerRenderedStorefrontBody(), []);
  return null;
}
