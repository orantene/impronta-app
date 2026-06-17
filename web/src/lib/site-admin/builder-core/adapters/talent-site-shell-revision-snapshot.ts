/**
 * REV-1 — PURE helpers for the TALENT site shell's `talent_site_revisions`
 * snapshot.
 *
 * Kept OUT of `talent-site-shell-actions.ts` (a `"use server"` file, where every
 * export must be an async Server Action) so the node test runner can import +
 * assert the snapshot/restore logic without bootstrapping Next.js or Supabase.
 * Mirrors `site-shell-revision-snapshot.ts` (the agency shell) and
 * `edit-mode/composition-revision-snapshot.ts`.
 *
 * The talent site SHELL is a FREEFORM surface — its revision snapshot carries
 * the freeform `shell_tree` under the `builderTree` key (the same key the
 * shared revisions-drawer / diff / `parseBuilderTreeFromSnapshot` machinery
 * reads). A `surface: "talent_site_shell"` marker namespaces these rows so they
 * are never confused with the full-site `TalentSiteSnapshot` revisions written
 * by `talent-site/server/actions.ts` (which carry slot composition, not a shell
 * tree). `restore` reads ONLY rows that carry a `builderTree`.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** Marker stamped onto shell revisions so they're distinguishable from the
 *  full-site `TalentSiteSnapshot` rows in the same `talent_site_revisions`
 *  table. */
export const TALENT_SITE_SHELL_REVISION_SURFACE = "talent_site_shell" as const;

export interface TalentSiteShellRevisionSnapshot {
  surface: typeof TALENT_SITE_SHELL_REVISION_SURFACE;
  title: string;
  builderTree: BuilderNodeTree;
}

/**
 * Build the JSONB snapshot persisted in `talent_site_revisions` for a talent
 * shell revision. A non-array `shellTree` normalises to `[]` so the snapshot is
 * always a valid (restorable) tree shape.
 */
export function buildTalentSiteShellRevisionSnapshot(input: {
  title: string;
  shellTree: unknown;
}): TalentSiteShellRevisionSnapshot {
  return {
    surface: TALENT_SITE_SHELL_REVISION_SURFACE,
    title: input.title,
    builderTree: Array.isArray(input.shellTree)
      ? (input.shellTree as BuilderNodeTree)
      : [],
  };
}

/**
 * True when a `talent_site_revisions.snapshot` row is a SHELL revision (carries
 * the freeform `builderTree` under our marker). The full-site composition rows
 * have no `builderTree`, so a restore that filters on this never picks one up.
 */
export function isTalentSiteShellRevisionSnapshot(
  snapshot: unknown,
): snapshot is TalentSiteShellRevisionSnapshot {
  return (
    Boolean(snapshot) &&
    typeof snapshot === "object" &&
    (snapshot as { surface?: unknown }).surface ===
      TALENT_SITE_SHELL_REVISION_SURFACE &&
    Array.isArray((snapshot as { builderTree?: unknown }).builderTree)
  );
}

/**
 * Resolve the next `talent_site_revisions.version` from the current max version
 * (defaults to 1 for the first revision). Pure — the DB read happens in the
 * action; this just applies the +1 rule against the read result.
 */
export function nextTalentSiteShellRevisionVersion(
  currentMaxVersion: number | null | undefined,
): number {
  return (currentMaxVersion ?? 0) + 1;
}
