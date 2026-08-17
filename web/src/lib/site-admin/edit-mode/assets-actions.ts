"use server";

/**
 * Edit-chrome assets actions — the editor's asset USAGE scanner.
 *
 * WHAT CHANGED (2026-08-16, legacy assets-drawer retirement)
 * ─────────────────────────────────────────────────────────
 * This module used to export two actions:
 *
 *   • `loadAssetsLibraryAction()` — the whole tenant library in one shot, via
 *     `listTenantMediaLibrary`, which is `.limit(60)`. It was the AssetsDrawer's
 *     data source and it is DELETED: the drawer now mounts `<MediaLibrary>`,
 *     which reads the paged, server-filtered `/api/admin/media/library` and can
 *     reach the whole library instead of the newest 60 rows.
 *   • `scanAssetUsageAction()` — no arguments, scanned the WHOLE library against
 *     the WHOLE section set: O(sections × assets). That was survivable only
 *     because the caller was capped at 60 assets. Over an unbounded library
 *     (the largest tenant has ~1,900 assets) the same shape is a 950,000
 *     substring-scan request, which is exactly why deleting the drawer was
 *     deferred instead of done.
 *
 * THE BOUND, stated plainly: the scan is now driven by the caller's CURRENTLY
 * VISIBLE page. `scanAssetUsageAction(targets)` takes at most
 * {@link MAX_SCAN_TARGETS} assets, so the cost is O(sections × page) with both
 * factors capped, and the response is one integer per asset asked about. The
 * client asks again as it pages; it never asks about the same asset twice.
 *
 * A server-side `WHERE` on usage was considered first and rejected: usage lives
 * inside `cms_sections.props_jsonb`, a free-form jsonb blob with no reference
 * table and no index over asset ids, so there is no cheap indexed query to
 * write. Per-page scanning is the honest second choice.
 *
 * Staff-gated (`requireSession`) and tenant-scoped
 * (`requireEditSurfaceTenantScope`), matching the disciplines used by the design
 * + revisions edit-mode wrappers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";

// ── types ─────────────────────────────────────────────────────────────────

/**
 * One asset to ask about. The storage path is NOT redundant with the id: an
 * upload names its object with a fresh `randomUUID()`, so the public URL a
 * section stores contains the OBJECT id and never the media_assets row id.
 * Scanning by id alone missed every URL-shaped reference.
 */
export interface AssetUsageTarget {
  id: string;
  storagePath: string;
}

export type ScanAssetUsageResult =
  /** assetId → number of non-archived sections referencing it. */
  | { ok: true; usage: Record<string, number> }
  | { ok: false; error: string };

const MAX_SECTIONS_PER_TENANT = 500;
/** One page of the media library is 60; a few pages in flight still fits. */
const MAX_SCAN_TARGETS = 300;

// ── actions ───────────────────────────────────────────────────────────────

export async function scanAssetUsageAction(
  targets: ReadonlyArray<AssetUsageTarget>,
): Promise<ScanAssetUsageResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before scanning asset usage.",
    };
  }

  const capped = targets.slice(0, MAX_SCAN_TARGETS).filter((t) => !!t?.id);
  if (capped.length === 0) return { ok: true, usage: {} };

  try {
    const usage = await computeAssetUsage(auth.supabase, scope.tenantId, capped);
    return { ok: true, usage };
  } catch (error) {
    logServerError("assets-actions:scanAssetUsageAction", error);
    return { ok: false, error: "Could not scan asset usage." };
  }
}

// ── internals ─────────────────────────────────────────────────────────────

/**
 * Pull every non-archived section for the tenant in one round-trip, stringify
 * each props_jsonb, and count substring matches for the ASKED-ABOUT assets.
 *
 * The substring strategy matches both `media_asset_id` references and inline
 * `publicUrl` strings — both shapes appear in section schemas (e.g.
 * hero.backgroundMediaAssetId vs gallery.images[].url). Storage path is the
 * more stable signal and rarely repeats by accident, so we lead with that and
 * fall back to id.
 */
async function computeAssetUsage(
  supabase: SupabaseClient,
  tenantId: string,
  targets: ReadonlyArray<AssetUsageTarget>,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("cms_sections")
    .select("id, props_jsonb")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .limit(MAX_SECTIONS_PER_TENANT);

  // A failed scan must not paint every asset "Unused" — that reads as a fact
  // and would send an operator deleting live imagery. Report nothing instead;
  // the caller renders no badge for an asset it has no answer for.
  if (error || !data) return {};

  // Pre-stringify each section once — serializing per-asset would be
  // O(N*M) JSON encodes. The stringified form is what we substring-scan.
  const haystacks = data.map((row) =>
    JSON.stringify((row as { props_jsonb: unknown }).props_jsonb),
  );

  const out: Record<string, number> = {};
  for (const target of targets) {
    let count = 0;
    for (const haystack of haystacks) {
      if (
        (target.storagePath && haystack.includes(target.storagePath)) ||
        haystack.includes(target.id)
      ) {
        count += 1;
      }
    }
    out[target.id] = count;
  }
  return out;
}
