import type { SupabaseClient } from "@supabase/supabase-js";

import { improntaLog } from "@/lib/server/structured-log";

function builderTreeNodeCount(tree: unknown): number {
  return Array.isArray(tree) ? tree.length : 0;
}

/**
 * Self-heal guard (homepage draft empty-load incident, 2026-06-11).
 *
 * The homepage editor and the publish path both load the `cms_page_revisions`
 * row whose `version` matches `cms_pages.version`, and use its `builderTree`.
 * If that pointer drifts past the last good draft — e.g. an editor stuck on the
 * empty "Start with a design" view autosaves an empty tree, or a publish bumps
 * the page version without a matching draft revision — the version-matched row
 * has an empty / near-empty builderTree.
 *
 * Rendering that empty state in the editor is dangerous (the editor can autosave
 * the emptiness back over the good draft), and freezing it at publish would wipe
 * the live homepage. So when the version-matched tree is empty AND the
 * composition has no slots, fall back to the most recent revision that actually
 * has content. Every draft save already snapshots a revision, so the good draft
 * is always still here to recover from.
 *
 * This is a READ-ONLY recovery: it returns the better tree for the caller to
 * render/publish, and self-heals on the next save (which writes the recovered
 * tree forward at the current version). When there is genuinely no content yet
 * (a brand-new page), no recovery candidate exists and the original (empty) tree
 * is returned unchanged.
 */
export async function recoverBuilderTreeIfEmpty(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    pageId: string;
    pageVersion: number;
    hasSlots: boolean;
  },
  versionMatchedTree: unknown,
): Promise<unknown> {
  if (builderTreeNodeCount(versionMatchedTree) > 1 || params.hasSlots) {
    return versionMatchedTree;
  }

  const { data } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", params.tenantId)
    .eq("page_id", params.pageId)
    .order("version", { ascending: false })
    .limit(25);

  for (const rev of (data ?? []) as Array<{
    snapshot: { builderTree?: unknown } | null;
  }>) {
    const tree =
      rev.snapshot && typeof rev.snapshot === "object"
        ? rev.snapshot.builderTree
        : undefined;
    if (builderTreeNodeCount(tree) > 1) {
      void improntaLog("site_admin_homepage.warn", {
        message:
          "[site-admin] version-matched homepage draft was empty — recovered builderTree from a recent non-empty revision",
        tenantId: params.tenantId,
        pageId: params.pageId,
        pageVersion: params.pageVersion,
        recoveredNodeCount: builderTreeNodeCount(tree),
      });
      return tree;
    }
  }

  return versionMatchedTree;
}
