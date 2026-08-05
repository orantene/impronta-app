import type { SupabaseClient } from "@supabase/supabase-js";

import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

function compositionRowsToLegacySlots(composition: unknown): LegacySnapshotSlot[] {
  if (!Array.isArray(composition)) return [];
  return composition.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      slotKey: String(e.slotKey ?? ""),
      sortOrder: Number(e.sortOrder ?? 0),
      sectionId: String(e.sectionId ?? ""),
      sectionTypeKey: String(e.sectionTypeKey ?? ""),
      name: String(e.name ?? ""),
      props: (e.props as Record<string, unknown>) ?? {},
    };
  });
}

/**
 * How many revision rows to consider per lookup. A page accumulates
 * draft/published/rollback rows at the same version; we want the newest one
 * that actually carries content, so we read a small window rather than a
 * single row.
 */
const REVISION_CANDIDATE_LIMIT = 8;

type RevisionRow = { snapshot: Record<string, unknown> | null };

function resolveRevisionTree(snapshot: unknown): BuilderNodeTree {
  if (!snapshot || typeof snapshot !== "object") return [];
  const snap = snapshot as Record<string, unknown>;
  const legacySlots = compositionRowsToLegacySlots(snap.composition);
  const resolved = resolveSnapshotBuilderTree({
    slots: legacySlots,
    builderTree: "builderTree" in snap ? snap.builderTree : undefined,
  });
  return resolved.tree;
}

function firstNonEmptyTree(rows: RevisionRow[] | null | undefined): BuilderNodeTree {
  for (const row of rows ?? []) {
    const tree = resolveRevisionTree(row?.snapshot);
    if (tree.length > 0) return tree;
  }
  return [];
}

/**
 * Newest revision tree that can serve as the "what already exists" baseline for
 * the page at `pageVersion` (which matches `cms_pages.version` **before** a
 * successful save bumps it).
 *
 * BUGFIX (2026-08-04) — this used to filter `kind = 'draft'` and read exactly
 * one row, which made the FIRST edit after a publish look like a from-scratch
 * build:
 *
 *   - homepage: publish writes the version-matched revision with
 *     `kind='published'`, so the draft-only filter matched nothing;
 *   - cms pages: publish leaves NO revision at the matched version at all.
 *
 * In both cases the baseline collapsed to the caller's legacy-slot derivation,
 * so every nested builder node in a Free workspace's seeded starter design
 * counted as newly inserted and the free-plan guard rejected the save with an
 * upgrade nag while the canvas visibly reverted. Free tenants are the seeded
 * on-ramp, so this taught brand-new workspaces that the builder is broken.
 *
 * The baseline is now reality-shaped: newest non-empty revision at this
 * version regardless of kind, else newest non-empty revision at or below this
 * version. A baseline can only ever make the guard MORE permissive, so
 * widening it cannot open a bypass that stricter data would have blocked — it
 * only stops the guard from inventing insertions that never happened.
 */
export async function loadResolvedBuilderTreeBaselineForPageVersion(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
  pageVersion: number,
): Promise<BuilderNodeTree> {
  // 1. Revisions recorded AT this version — any kind (draft / published /
  //    rollback). Newest first.
  const { data: versionMatched } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("version", pageVersion)
    .order("created_at", { ascending: false })
    .limit(REVISION_CANDIDATE_LIMIT)
    .returns<RevisionRow[]>();

  const matchedTree = firstNonEmptyTree(versionMatched);
  if (matchedTree.length > 0) return matchedTree;

  // 2. Nothing usable at this exact version (the cms-page publish case leaves
  //    no row there) — fall back to the newest revision at or below it. Bound
  //    by `version <= pageVersion` so a baseline can never come from a future
  //    version.
  const { data: prior } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .lte("version", pageVersion)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(REVISION_CANDIDATE_LIMIT)
    .returns<RevisionRow[]>();

  return firstNonEmptyTree(prior);
}
