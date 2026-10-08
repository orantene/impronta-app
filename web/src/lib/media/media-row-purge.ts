// ============================================================================
// media-row-purge.ts — decides which SOFT-DELETED `media_assets` ROWS may be
// hard-deleted (pure; no I/O). TUL-227.
//
// The storage reaper (`reap-orphaned-media*.ts`) removes the FILES of
// soft-deleted media after the grace period but never the ROWS, so names, alt
// text and paths survive forever and the account-purge job keeps every talent
// that still owns a row. This module is the missing second half.
//
// ─── THE RULE ───────────────────────────────────────────────────────────────
// A row is purgeable only when ALL hold; anything uncertain is KEPT:
//   1. `deleted_at` parses and is older than the grace period (the reaper's
//      own DEFAULT_GRACE_DAYS, passed in by the caller, never re-declared).
//   2. STORAGE CONFIRMED GONE. The reaper leaves no marker on the row (it
//      never clears `storage_path` or stamps a "removed" column), so the
//      marker is DERIVED from the same complete bucket listing the reaper
//      walks: the row's bucket is one the reaper manages, and after this
//      pass NO object with that path remains in ANY managed bucket (listing
//      minus the objects whose removal just succeeded). Objects the reaper
//      keeps (protected prefixes, external references, cross-bucket pins)
//      are still listed, so their rows are kept. A failed removal aborts
//      the reaper run before this step, so it can never reach here.
//   3. Every other row on the same path is also soft-deleted and expired.
//   4. No external reference (builder trees, branding, documents...) names
//      the path.
//   5. No table outside the row's pure children references its id
//      (`blockedIds`, produced by the I/O layer from the FK list).
//   6. No derivative (`source_media_asset_id`) of it survives the purge.
// ============================================================================

import {
  MANAGED_BUCKETS,
  type ExternalReference,
  type MediaAssetRow,
  type StorageObject,
} from "@/lib/media/reap-orphaned-media";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RowKeepReason =
  | "within_grace_period"
  | "invalid_deleted_at"
  | "bucket_not_managed"
  | "storage_not_confirmed_gone"
  | "shared_path_not_purgeable"
  | "external_reference"
  | "referenced_by_non_child"
  | "has_surviving_derivative"
  | "over_purge_cap";

export type RowPurgeInput = {
  /** Every `media_assets` row that has a storage path. */
  rows: MediaAssetRow[];
  /** The COMPLETE listing of the managed buckets (a failed listing aborts the run upstream). */
  objects: StorageObject[];
  /** `${bucket} ${path}` keys whose removal succeeded in this pass. */
  removedKeys?: ReadonlySet<string>;
  externalReferences: ExternalReference[];
  now: Date;
  graceDays: number;
  /** Row ids referenced by a non-child table (see media-row-purge-io.ts). */
  blockedIds?: ReadonlySet<string>;
  maxRows: number;
};

export type RowPurgePlan = {
  /** Ids to delete, capped. */
  purgeable: string[];
  eligibleCount: number;
  cappedByLimit: boolean;
  /** Soft-deleted rows examined (live rows are not counted). */
  softDeletedCount: number;
  keptByReason: Record<string, number>;
};

export function removalKey(bucketId: string, path: string): string {
  return `${bucketId} ${path}`;
}

function isManagedBucket(bucketId: string): boolean {
  return (MANAGED_BUCKETS as readonly string[]).includes(bucketId);
}

function rowIsExpired(row: MediaAssetRow, cutoffMs: number): boolean {
  if (!row.deletedAt) return false;
  const t = Date.parse(row.deletedAt);
  return Number.isFinite(t) && t < cutoffMs;
}

/** Stages 1-4: rows that pass everything decidable without the FK lookup. */
export function findRowPurgeCandidates(
  input: Omit<RowPurgeInput, "blockedIds" | "maxRows">,
): { candidateIds: string[]; keptByReason: Record<string, number>; softDeletedCount: number } {
  const cutoffMs = input.now.getTime() - input.graceDays * DAY_MS;
  const removed = input.removedKeys ?? new Set<string>();

  const remainingPaths = new Set<string>();
  for (const o of input.objects) {
    if (!removed.has(removalKey(o.bucketId, o.name))) remainingPaths.add(o.name);
  }
  const externalPaths = new Set(input.externalReferences.map((r) => r.storagePath));
  const rowsByPath = new Map<string, MediaAssetRow[]>();
  for (const r of input.rows) {
    const list = rowsByPath.get(r.storagePath);
    if (list) list.push(r);
    else rowsByPath.set(r.storagePath, [r]);
  }

  const keptByReason: Record<string, number> = {};
  const keep = (reason: RowKeepReason) => {
    keptByReason[reason] = (keptByReason[reason] ?? 0) + 1;
  };
  const candidateIds: string[] = [];
  let softDeletedCount = 0;

  for (const row of input.rows) {
    if (row.deletedAt === null) continue; // live rows are never candidates
    softDeletedCount += 1;
    if (!Number.isFinite(Date.parse(row.deletedAt))) {
      keep("invalid_deleted_at");
      continue;
    }
    if (!rowIsExpired(row, cutoffMs)) {
      keep("within_grace_period");
      continue;
    }
    if (!isManagedBucket(row.bucketId)) {
      keep("bucket_not_managed");
      continue;
    }
    if (remainingPaths.has(row.storagePath)) {
      keep("storage_not_confirmed_gone");
      continue;
    }
    const siblings = rowsByPath.get(row.storagePath) ?? [];
    if (siblings.some((s) => !rowIsExpired(s, cutoffMs))) {
      keep("shared_path_not_purgeable");
      continue;
    }
    if (externalPaths.has(row.storagePath)) {
      keep("external_reference");
      continue;
    }
    candidateIds.push(row.id);
  }
  return { candidateIds, keptByReason, softDeletedCount };
}

/** Full decision: candidates, minus FK-blocked ids, minus rows with a surviving derivative, capped. */
export function planMediaRowPurge(input: RowPurgeInput): RowPurgePlan {
  const { candidateIds, keptByReason, softDeletedCount } = findRowPurgeCandidates(input);
  const blocked = input.blockedIds ?? new Set<string>();
  const bump = (reason: RowKeepReason) => {
    keptByReason[reason] = (keptByReason[reason] ?? 0) + 1;
  };

  let eligible = new Set<string>();
  for (const id of candidateIds) {
    if (blocked.has(id)) bump("referenced_by_non_child");
    else eligible.add(id);
  }

  // A parent goes only if every derivative row of it goes too (fixpoint, so
  // chains resolve). `source_media_asset_id` is ON DELETE SET NULL, so
  // removing a parent under a surviving child would silently orphan it.
  const childrenByParent = new Map<string, string[]>();
  for (const r of input.rows) {
    if (!r.sourceMediaAssetId) continue;
    const list = childrenByParent.get(r.sourceMediaAssetId);
    if (list) list.push(r.id);
    else childrenByParent.set(r.sourceMediaAssetId, [r.id]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const next = new Set<string>();
    for (const id of eligible) {
      const kids = childrenByParent.get(id) ?? [];
      if (kids.every((k) => eligible.has(k))) {
        next.add(id);
      } else {
        bump("has_surviving_derivative");
        changed = true;
      }
    }
    eligible = next;
  }

  const sorted = [...eligible].sort();
  const purgeable = sorted.slice(0, input.maxRows);
  if (sorted.length > purgeable.length) {
    keptByReason.over_purge_cap = sorted.length - purgeable.length;
  }
  return {
    purgeable,
    eligibleCount: sorted.length,
    cappedByLimit: sorted.length > purgeable.length,
    softDeletedCount,
    keptByReason,
  };
}
