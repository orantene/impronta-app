import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { isAdvancedElementLibraryEnabledForPlan } from "@/lib/site-admin/builder-node/element-library-policy";
import { assertFreePlanAllowsNestedBuilderMutation } from "@/lib/site-admin/builder-node/free-plan-builder-tree-guard";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { loadResolvedBuilderTreeBaselineForPageVersion } from "./draft-revision-builder-tree";

export type FreePlanDraftSaveGuardResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Defense in depth for Free workspaces: nested builder-node ids must not expand vs the
 * prior draft revision (mirrors client insert/paste/duplicate gate). See
 * {@link assertFreePlanAllowsNestedBuilderMutation}.
 *
 * @param baselineLegacyTree — resolved tree for the **same** composition with no client
 *   `builderTree` payload (legacy-only). Used when no draft revision exists yet.
 */
export async function enforceFreePlanNestedBuilderDraftGuard(input: {
  supabase: SupabaseClient;
  tenantId: string;
  pageId: string;
  pageVersion: number;
  logTag: string;
  baselineLegacyTree: BuilderNodeTree;
  nextTree: BuilderNodeTree;
}): Promise<FreePlanDraftSaveGuardResult> {
  const workspacePlan = await loadBuilderWorkspacePlan(
    input.supabase,
    input.tenantId,
    { logTag: input.logTag },
  );
  if (isAdvancedElementLibraryEnabledForPlan(workspacePlan)) {
    return { ok: true };
  }

  // Baseline = whatever the page ALREADY has. It deliberately spans every
  // revision kind: after a publish the version-matched revision is
  // `kind='published'` (homepage) or missing entirely (cms pages), and a
  // draft-only baseline made the first post-publish edit look like a
  // from-scratch build of the seeded starter design.
  let previousTree = await loadResolvedBuilderTreeBaselineForPageVersion(
    input.supabase,
    input.tenantId,
    input.pageId,
    input.pageVersion,
  );
  if (previousTree.length === 0) {
    previousTree = input.baselineLegacyTree;
  }

  return assertFreePlanAllowsNestedBuilderMutation(previousTree, input.nextTree);
}
