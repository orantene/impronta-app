import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { queryTenantMediaLibrary } from "@/lib/media/library-query";
import type {
  WorkspaceMediaFolder,
  WorkspaceMediaPhoto,
} from "@/lib/media/library-item";

/**
 * _data-bridge-media.ts — server-side loader for the workspace Media page.
 *
 * Returns media_assets rows (card + gallery + hero) owned by roster talents for
 * this tenant, plus the workspace's own brand & site imagery. Includes tags,
 * folder membership, ownership and file metadata for the v2 Media manager.
 *
 * 2026-08-16 (library unification, seam 1) — the SQL moved out. This file is
 * now a thin composer over `queryTenantMediaLibrary`, the one read path it
 * shares with `/api/admin/media/library` and `/api/talent/media/library`. The
 * page's output is deliberately unchanged: two lanes, in the same order they
 * were always concatenated —
 *
 *   lane A  roster talent photos   variant_kind in (card, gallery, hero),
 *                                  ordered by sort_order, cap 5000
 *   lane B  brand & site imagery   purpose in (branding, cms), images only,
 *                                  newest first, cap 1000
 *
 * Keeping the lanes (rather than collapsing to one ordered query) preserves
 * the Media page's visible ordering exactly while still removing the second
 * copy of the query. The ONE behavioural change is that a row whose kind can't
 * be resolved — an unsanitized SVG, an unknown extension — is now dropped from
 * lane A too, because both lanes run the same `resolveAssetKind` gate. Lane B
 * already did that.
 *
 * The item and folder types now live in `lib/media/library-item.ts` (a pure
 * module a client picker can import); they are re-exported here so every
 * existing importer of this file keeps working unchanged.
 */

export type { WorkspaceMediaPhoto, WorkspaceMediaFolder };

/** Talent photo lane cap. Was the `.limit(5000)` inline in the old query. */
const TALENT_LANE_LIMIT = 5000;
/** Brand & site lane cap. Was the `.limit(1000)` inline in the old query. */
const WORKSPACE_LANE_LIMIT = 1000;

export type WorkspaceMediaBridge = {
  photos: WorkspaceMediaPhoto[];
  folders: WorkspaceMediaFolder[];
  /** True if the underlying query failed. UI can distinguish "empty" from "broken". */
  errored: boolean;
  /** Total matching rows in the DB. May exceed `photos.length` when capped. */
  totalCount: number | null;
};

export async function loadWorkspaceMediaPhotos(
  tenantId: string,
): Promise<WorkspaceMediaPhoto[]> {
  const bridge = await loadWorkspaceMediaBridge(tenantId);
  return bridge.photos;
}

export async function loadWorkspaceMediaBridge(
  tenantId: string,
): Promise<WorkspaceMediaBridge> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { photos: [], folders: [], errored: true, totalCount: null };

    const [talentLane, workspaceLane] = await Promise.all([
      queryTenantMediaLibrary({
        supabase,
        tenantId,
        ownerLane: "talent-owned",
        variantKinds: ["card", "gallery", "hero"],
        // The Media page owns the pending/rejected lanes, so it reads every
        // approval state — unlike the pickers, which only ever offer approved.
        approvalState: "any",
        orderBy: "sort_order",
        limit: TALENT_LANE_LIMIT,
        includePrivateFolders: true,
      }),
      queryTenantMediaLibrary({
        supabase,
        tenantId,
        ownerLane: "workspace-owned",
        purpose: ["branding", "cms"],
        // The grid renders <img>; documents and videos in the CMS library have
        // their own surfaces.
        kind: "image",
        approvalState: "any",
        limit: WORKSPACE_LANE_LIMIT,
        includePrivateFolders: true,
      }),
    ]);

    if (talentLane.errored) {
      logServerError("data-bridge.media.list", new Error("media library query failed"));
      return { photos: [], folders: [], errored: true, totalCount: null };
    }

    return {
      photos: [...talentLane.items, ...workspaceLane.items],
      folders: talentLane.folders,
      errored: false,
      totalCount: talentLane.totalCount + workspaceLane.items.length,
    };
  } catch (err) {
    logServerError("data-bridge.media.unknown", err);
    return { photos: [], folders: [], errored: true, totalCount: null };
  }
}
