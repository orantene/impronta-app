/**
 * REV-1 — PURE helpers for a FREEFORM `cms_page_revisions` snapshot.
 *
 * Kept OUT of the `"use server"` action files (where every export must be an
 * async Server Action) so the node test runner can import + assert the
 * snapshot/version logic without bootstrapping Next.js or Supabase.
 *
 * A freeform cms_pages page persists its tree to `cms_pages.blocks` (not the
 * legacy slot composition). Its revision snapshot therefore carries that tree
 * under the `builderTree` key — the SAME key the shared revisions-drawer / diff
 * / `parseBuilderTreeFromSnapshot` machinery reads, identical to how the agency
 * `site_shell` shell snapshots its freeform `blocks`. This generalises
 * `site-shell-revision-snapshot.ts` so the freeform cms_page restore path reuses
 * one snapshot shape instead of forking a second.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export interface FreeformRevisionSnapshot {
  title: string;
  builderTree: BuilderNodeTree;
}

/**
 * Build the JSONB snapshot persisted in `cms_page_revisions` for a freeform
 * page revision. A non-array `blocks` normalises to `[]` so the snapshot is
 * always a valid (restorable) tree shape.
 */
export function buildFreeformRevisionSnapshot(input: {
  title: string;
  blocks: unknown;
}): FreeformRevisionSnapshot {
  return {
    title: input.title,
    builderTree: Array.isArray(input.blocks)
      ? (input.blocks as BuilderNodeTree)
      : [],
  };
}

/**
 * Resolve the next `cms_page_revisions.version` from the current max version for
 * a page (defaults to 1 for the first revision). Pure — the DB read happens in
 * the action; this just applies the +1 rule against the read result.
 */
export function nextFreeformRevisionVersion(
  currentMaxVersion: number | null | undefined,
): number {
  return (currentMaxVersion ?? 0) + 1;
}
