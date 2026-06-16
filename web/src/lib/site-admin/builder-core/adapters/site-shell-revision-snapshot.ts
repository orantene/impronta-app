/**
 * A2 follow-up — PURE helpers for the shell's `cms_page_revisions` snapshot.
 *
 * Kept OUT of `site-shell-actions.ts` (a `"use server"` file, where every export
 * must be an async Server Action) so the node test runner can import + assert the
 * snapshot/restore logic without bootstrapping Next.js or Supabase. Mirrors
 * `edit-mode/composition-revision-snapshot.ts`.
 *
 * The shell is a FREEFORM surface, so its revision snapshot carries the freeform
 * `blocks` tree under the `builderTree` key — the same key the existing
 * revisions-drawer / diff / `parseBuilderTreeFromSnapshot` machinery reads.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export interface ShellRevisionSnapshot {
  title: string;
  builderTree: BuilderNodeTree;
}

/**
 * Build the JSONB snapshot persisted in `cms_page_revisions` for a shell
 * revision. A non-array `blocks` normalises to `[]` so the snapshot is always a
 * valid (restorable) tree shape.
 */
export function buildShellRevisionSnapshot(input: {
  title: string;
  blocks: unknown;
}): ShellRevisionSnapshot {
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
export function nextRevisionVersion(currentMaxVersion: number | null | undefined): number {
  return (currentMaxVersion ?? 0) + 1;
}
