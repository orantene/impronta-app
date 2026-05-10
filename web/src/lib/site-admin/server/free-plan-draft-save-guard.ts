import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { isAdvancedElementLibraryEnabledForPlan } from "@/lib/site-admin/builder-node/element-library-policy";
import { assertFreePlanAllowsNestedBuilderMutation } from "@/lib/site-admin/builder-node/free-plan-builder-tree-guard";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { loadResolvedDraftBuilderTreeForPageVersion } from "./draft-revision-builder-tree";

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

  let previousTree = await loadResolvedDraftBuilderTreeForPageVersion(
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
