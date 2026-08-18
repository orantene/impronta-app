/**
 * Surfaces that run CMS publish preflight (headings / alt / contrast).
 *
 * Lives next to — not inside — `publish-preflight-action.ts` so the
 * Publish drawer (a client module) can call it. `"use server"` files
 * cannot export sync helpers to the client.
 *
 * `platform_lab` is excluded: lab never publishes a live page.
 */

import type { BuilderSurfaceKind } from "@/lib/site-admin/builder-core/surface-kind";

const PREFLIGHT_SURFACES: ReadonlySet<BuilderSurfaceKind> = new Set([
  "homepage",
  "cms_page",
  "site_shell",
  "talent_page",
]);

export function isPublishPreflightSurface(
  kind: string | null | undefined,
): boolean {
  return kind != null && PREFLIGHT_SURFACES.has(kind as BuilderSurfaceKind);
}
