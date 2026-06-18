"use server";

/**
 * ONB-1 — bake a full-page starter design into a self-contained, insert-ready
 * freeform BuilderNode tree and RETURN it (no write).
 *
 * The homepage has its own authoritative apply (`applyPageDesignToHomepage`)
 * that writes the empty-slot composition + seeds the Free-plan curated on-ramp.
 * Every OTHER editable surface (cms_page / talent_page / platform_lab /
 * site_shell) persists its freeform tree through its own SurfaceAdapter — so the
 * surface-parameterized `EmptyCanvasStarter` needs only the baked tree, then
 * hands it to the active adapter via the shared `persistBuilderTree` path.
 *
 * Why a server action (not a client import): the full PageDesign objects carry
 * the entire BuilderNode trees (~hundreds of nodes each). Baking server-side
 * keeps those trees out of the browser bundle — the client picker imports only
 * `PAGE_DESIGN_SUMMARIES` (id + display copy). `bakePageDesignTree` is the SAME
 * baker the homepage action and the Lab playground draft use, so every surface
 * gets a byte-identical tree from one source.
 *
 * This action writes NOTHING. The authoritative write happens in the active
 * adapter's `saveDraft`, which enforces the surface's own ownership/RLS. The
 * guard here is a plain session check; the design id is validated against the
 * fixed in-repo registry so an arbitrary tree can never be injected.
 */

import { requireSession } from "@/lib/server/action-guards";
import {
  getPageDesign,
  bakePageDesignTree,
} from "@/lib/site-admin/builder-node/page-designs";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export type BakePageDesignState =
  | { ok: true; designId: string; builderTree: BuilderNodeTree }
  | { ok: false; error: string };

export async function bakePageDesignTreeAction(
  designId: string,
): Promise<BakePageDesignState> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const design = getPageDesign(designId);
  if (!design) {
    return { ok: false, error: `Unknown design "${designId}".` };
  }

  // Bake the design into a self-contained, insert-ready freeform tree (repeaters
  // → static children, fresh ids). Same baker the homepage + Lab paths use.
  const builderTree = bakePageDesignTree(design.tree, design.dataSources);
  return { ok: true, designId, builderTree };
}
