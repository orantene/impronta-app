import type { SupabaseClient } from "@supabase/supabase-js";

import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/legacy-section-tree";
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
 * Resolved builder tree for the draft revision at `pageVersion` (matches `cms_pages.version`
 * **before** a successful save that bumps the version).
 */
export async function loadResolvedDraftBuilderTreeForPageVersion(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
  pageVersion: number,
): Promise<BuilderNodeTree> {
  const { data: revisionRow } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("version", pageVersion)
    .eq("kind", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: Record<string, unknown> | null }>();

  const snap = revisionRow?.snapshot;
  if (!snap || typeof snap !== "object") {
    return [];
  }

  const legacySlots = compositionRowsToLegacySlots(snap.composition);
  const resolved = resolveSnapshotBuilderTree({
    slots: legacySlots,
    builderTree:
      "builderTree" in snap ? snap.builderTree : undefined,
  });
  return resolved.tree;
}
