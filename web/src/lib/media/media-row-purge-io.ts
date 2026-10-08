// ============================================================================
// media-row-purge-io.ts — I/O half of the soft-deleted media ROW purge
// (TUL-227). The decision lives in `media-row-purge.ts`; this file gathers the
// FK blockers, runs the (flag-gated) delete, and builds the report.
//
// Default is DRY RUN: nothing is deleted unless `enforce` is true, which the
// caller derives from `MEDIA_ROW_PURGE_ENFORCE === "true"`.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type {
  ExternalReference,
  MediaAssetRow,
  StorageObject,
} from "@/lib/media/reap-orphaned-media";
import {
  findRowPurgeCandidates,
  planMediaRowPurge,
  removalKey,
} from "@/lib/media/media-row-purge";

/**
 * Every reference to `media_assets.id` that is NOT a pure child of the asset.
 * A row referenced from any of these is KEPT:
 *  - NO ACTION / RESTRICT FKs would make the delete fail, and
 *  - ON DELETE SET NULL FKs would silently blank a live pointer
 *    (branding logos, template thumbnails, SEO share images...), and
 *  - the two uuid columns without an FK would dangle.
 *
 * Pure children (CASCADE; removed with the row, deliberately NOT listed):
 * media_folder_items.asset_id, media_asset_activity.asset_id,
 * media_grants.asset_id, media_release_bake_failures.asset_id,
 * talent_offering_media.media_asset_id.
 * `media_assets.source_media_asset_id` (SET NULL) is handled by the planner.
 */
export const MEDIA_ROW_BLOCKER_REFERENCES = [
  { table: "talent_profile_trust_badges", column: "evidence_media_id" },
  { table: "agency_talent_media", column: "master_media_id" },
  { table: "agency_talent_media", column: "agency_media_id" },
  { table: "platform_stock_images", column: "asset_id" },
  { table: "cms_pages", column: "og_image_media_asset_id" },
  { table: "agency_talent_overlays", column: "cover_media_asset_id" },
  { table: "agency_branding", column: "logo_media_asset_id" },
  { table: "agency_branding", column: "logo_dark_media_asset_id" },
  { table: "agency_branding", column: "favicon_media_asset_id" },
  { table: "agency_branding", column: "og_image_media_asset_id" },
  { table: "builder_templates", column: "thumbnail_asset_id" },
  { table: "builder_templates", column: "hero_asset_id" },
  { table: "agency_business_identity", column: "seo_default_share_image_media_asset_id" },
  // No FK, but a live pointer by id:
  { table: "booking_fulfillment", column: "digital_asset_id" },
  { table: "talent_offering_addons", column: "media_asset_id" },
] as const;

const LOOKUP_CHUNK = 100;

export type RowPurgeReport = {
  enforce: boolean;
  /** false = a step failed; nothing was deleted. */
  ok: boolean;
  stage?: string;
  error?: string;
  softDeletedRows: number;
  eligibleCount: number;
  /** Rows that would be (dry run) or were selected to be deleted this run, after the cap. */
  wouldPurgeCount: number;
  cappedByLimit: boolean;
  purgedCount: number;
  errorCount: number;
  keptByReason: Record<string, number>;
  /** First 25 row ids, so the log is legible. */
  sampleIds: string[];
  /** First 5 per-row error messages. */
  sampleErrors: string[];
};

export type RowPurgeRunInput = {
  admin: SupabaseClient;
  rows: MediaAssetRow[];
  objects: StorageObject[];
  /** Objects whose storage removal succeeded in this reaper pass. */
  removed: Array<{ bucketId: string; storagePath: string }>;
  externalReferences: ExternalReference[];
  now: Date;
  graceDays: number;
  maxRows: number;
  enforce: boolean;
};

function emptyReport(enforce: boolean): RowPurgeReport {
  return {
    enforce,
    ok: true,
    softDeletedRows: 0,
    eligibleCount: 0,
    wouldPurgeCount: 0,
    cappedByLimit: false,
    purgedCount: 0,
    errorCount: 0,
    keptByReason: {},
    sampleIds: [],
    sampleErrors: [],
  };
}

type BlockerResult = { ok: true; blocked: Set<string> } | { ok: false; stage: string; error: string };

/** Ids (from `ids`) that any non-child table points at. A failed lookup fails the whole step. */
export async function loadBlockedAssetIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<BlockerResult> {
  const blocked = new Set<string>();
  for (const { table, column } of MEDIA_ROW_BLOCKER_REFERENCES) {
    for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
      const chunk = ids.slice(i, i + LOOKUP_CHUNK);
      const { data, error } = await admin.from(table).select(column).in(column, chunk);
      if (error) {
        return { ok: false, stage: `media_row_blockers:${table}.${column}`, error: error.message };
      }
      const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const row of page) {
        const v = row[column];
        if (typeof v === "string") blocked.add(v);
      }
    }
  }
  return { ok: true, blocked };
}

/**
 * Plan and (only when `enforce`) execute the row purge. Never throws and never
 * deletes on a failed lookup. One failing row is recorded and the batch goes on.
 */
export async function runMediaRowPurge(input: RowPurgeRunInput): Promise<RowPurgeReport> {
  const report = emptyReport(input.enforce);
  try {
    const removedKeys = new Set(input.removed.map((r) => removalKey(r.bucketId, r.storagePath)));
    const base = {
      rows: input.rows,
      objects: input.objects,
      removedKeys,
      externalReferences: input.externalReferences,
      now: input.now,
      graceDays: input.graceDays,
    };

    const stage1 = findRowPurgeCandidates(base);
    const blockers = await loadBlockedAssetIds(input.admin, stage1.candidateIds);
    if (!blockers.ok) {
      logServerError(`media-row-purge.${blockers.stage}`, blockers.error);
      return { ...report, ok: false, stage: blockers.stage, error: blockers.error };
    }

    const plan = planMediaRowPurge({ ...base, blockedIds: blockers.blocked, maxRows: input.maxRows });
    report.softDeletedRows = plan.softDeletedCount;
    report.eligibleCount = plan.eligibleCount;
    report.wouldPurgeCount = plan.purgeable.length;
    report.cappedByLimit = plan.cappedByLimit;
    report.keptByReason = plan.keptByReason;
    report.sampleIds = plan.purgeable.slice(0, 25);

    if (!input.enforce) return report; // DRY RUN: no delete call is ever made.

    const cutoffIso = new Date(input.now.getTime() - input.graceDays * 24 * 60 * 60 * 1000).toISOString();
    const errors: string[] = [];
    for (const id of plan.purgeable) {
      try {
        // Re-assert "still soft-deleted and old enough" inside the DELETE
        // itself, so a row restored since the scan is never removed.
        const { data, error } = await input.admin
          .from("media_assets")
          .delete()
          .eq("id", id)
          .not("deleted_at", "is", null)
          .lt("deleted_at", cutoffIso)
          .select("id");
        if (error) {
          errors.push(`${id}: ${error.message}`);
          continue;
        }
        report.purgedCount += (data ?? []).length;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    report.errorCount = errors.length;
    report.sampleErrors = errors.slice(0, 5);
    if (errors.length > 0) logServerError("media-row-purge.delete", errors.slice(0, 5).join(" | "));
    return report;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logServerError("media-row-purge", message);
    return { ...report, ok: false, stage: "media_row_purge", error: message };
  }
}
