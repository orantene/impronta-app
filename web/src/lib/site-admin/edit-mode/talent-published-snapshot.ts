import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type { LoadPublishedSnapshotResult } from "./publish-diff-action";

/**
 * F95 - map a `talent_pages` row to the publish drawer's published-snapshot
 * result. A talent page with no live body is a normal FIRST publish
 * (`hasPublishedSnapshot: false`), never a load failure.
 */
export function talentPublishedSnapshotResult(tp: {
  blocks_published: unknown;
  published_at: string | null;
}): LoadPublishedSnapshotResult {
  const live = Array.isArray(tp.blocks_published) && tp.blocks_published.length > 0;
  return {
    ok: true,
    rows: [],
    publishedAt: tp.published_at ?? null,
    publishedBuilderTree: live ? (tp.blocks_published as BuilderNodeTree) : null,
    hasPublishedSnapshot: live,
  };
}
