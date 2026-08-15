// ============================================================================
// reap-orphaned-media-scan.ts — the storage reaper's I/O layer.
//
// Gathers the three inputs the pure predicate in `reap-orphaned-media.ts`
// needs (storage objects, `media_assets` rows, external references), then
// optionally executes the deletion.
//
// ─── ABORT, DO NOT GUESS ────────────────────────────────────────────────────
// Every gather step returns a discriminated result. The FIRST failure aborts
// the whole run and nothing is deleted. This is the point of the module: an
// object is deletable only if we positively proved nothing references it, and
// a source that failed to answer has proved nothing. Partial input must never
// reach `classifyStorageObjects`.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_MAX_DELETIONS_PER_RUN,
  MANAGED_BUCKETS,
  classifyStorageObjects,
  collectStorageRefsFromJson,
  type ExternalReference,
  type MediaAssetRow,
  type ReapPlan,
  type StorageObject,
} from "@/lib/media/reap-orphaned-media";

const PAGE_SIZE = 1000;
/** Guard against an unbounded walk if storage ever returns a cycle of prefixes. */
const MAX_PREFIXES = 5000;

export type ScanFailure = { ok: false; stage: string; error: string };
type Ok<T> = { ok: true; value: T };
type Result<T> = Ok<T> | ScanFailure;

function fail(stage: string, error: unknown): ScanFailure {
  return {
    ok: false,
    stage,
    error: error instanceof Error ? error.message : String(error),
  };
}

// ---------------------------------------------------------------------------
// 1. Storage objects — recursive walk of the managed buckets.
//
// `storage.objects` is not exposed through PostgREST, so this uses the Storage
// API. `list()` is per-prefix and non-recursive: entries with a null `id` are
// folders and get queued as further prefixes.
// ---------------------------------------------------------------------------
type StorageEntry = {
  id: string | null;
  name: string;
  created_at?: string | null;
  metadata?: { size?: number } | null;
};

async function listBucketObjects(
  admin: SupabaseClient,
  bucketId: string,
): Promise<Result<StorageObject[]>> {
  const objects: StorageObject[] = [];
  const queue: string[] = [""];
  let visited = 0;

  while (queue.length > 0) {
    const prefix = queue.shift() as string;
    if (++visited > MAX_PREFIXES) {
      return fail(`storage.list:${bucketId}`, `prefix walk exceeded ${MAX_PREFIXES}`);
    }

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.storage
        .from(bucketId)
        .list(prefix, { limit: PAGE_SIZE, offset });
      if (error) return fail(`storage.list:${bucketId}:${prefix}`, error);

      const entries = (data ?? []) as StorageEntry[];
      for (const entry of entries) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          queue.push(full);
          continue;
        }
        objects.push({
          bucketId,
          name: full,
          sizeBytes: entry.metadata?.size ?? 0,
          createdAt: entry.created_at ?? new Date(0).toISOString(),
        });
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }

  return { ok: true, value: objects };
}

// ---------------------------------------------------------------------------
// 2. `media_assets` — the largest referencing source. Soft-deleted rows are
//    included deliberately: a soft-deleted row still OWNS its object until the
//    grace period expires, and its lineage links are needed to protect
//    parents/derivatives.
// ---------------------------------------------------------------------------
async function loadMediaAssets(admin: SupabaseClient): Promise<Result<MediaAssetRow[]>> {
  const rows: MediaAssetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("media_assets")
      .select("id, bucket_id, storage_path, deleted_at, source_media_asset_id, variant_kind")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return fail("media_assets", error);

    const page = (data ?? []) as Array<{
      id: string;
      bucket_id: string | null;
      storage_path: string | null;
      deleted_at: string | null;
      source_media_asset_id: string | null;
      variant_kind: string | null;
    }>;
    for (const r of page) {
      if (!r.storage_path) continue;
      rows.push({
        id: r.id,
        // Historic rows predate `bucket_id`; they all live in media-public.
        bucketId: r.bucket_id ?? "media-public",
        storagePath: r.storage_path,
        deletedAt: r.deleted_at,
        sourceMediaAssetId: r.source_media_asset_id,
        variantKind: r.variant_kind,
      });
    }
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, value: rows };
}

// ---------------------------------------------------------------------------
// 3. External references — every source that can pin a storage object WITHOUT
//    a `media_assets` row.
//
//    3a. Talent documents. Contracts/comp cards are PUT to `media-originals`
//        under `${talentProfileId}/documents/…` and referenced from field-value
//        JSON — `talent_profile_field_values.value` for the `documents` field
//        definition, entries carrying `storagePath` + `bucketId`. There is no
//        `media_assets` row. This is the source whose omission would delete
//        every talent document in the system.
//
//        NOTE (verified against production 2026-08-15): this query currently
//        returns ZERO rows even though document objects exist in storage. The
//        reference source is effectively unavailable, which is exactly why the
//        `${talentProfileId}/documents/` prefix is ALSO protected structurally
//        by PROTECTED_RULES. Belt and braces — the prefix rule is what actually
//        keeps those objects alive today.
//
//    3b. Workspace branding. Logo/favicon/theme colors live in the
//        `agencies.settings` jsonb (the theme_json bridge) as full public URLs.
// ---------------------------------------------------------------------------
async function loadTalentDocumentRefs(
  admin: SupabaseClient,
): Promise<Result<ExternalReference[]>> {
  const refs: ExternalReference[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("talent_profile_field_values")
      .select("value, profile_field_definitions!inner(field_key)")
      .eq("profile_field_definitions.field_key", "documents")
      // A9 — .range() without ORDER BY is an UNSTABLE window: Postgres may
      // return page 2 in a different order than it "would have", so a row can
      // be skipped entirely between pages. A skipped REFERENCE here is a live
      // object this run believes nothing points at, i.e. a real file deleted.
      // Every source fits one page today; this detonates the first time one
      // does not, with MEDIA_REAPER_ENABLED=true.
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return fail("talent_documents", error);

    const page = (data ?? []) as Array<{ value: unknown }>;
    for (const row of page) {
      collectStorageRefsFromJson(row.value, "talent_documents", refs);
    }
    if (page.length < PAGE_SIZE) break;
  }
  // Default the bucket for document entries that stored only a path.
  return {
    ok: true,
    value: refs.map((r) =>
      /^[^/]+\/documents\//.test(r.storagePath)
        ? { ...r, bucketId: "media-originals" }
        : r,
    ),
  };
}

async function loadBrandingRefs(admin: SupabaseClient): Promise<Result<ExternalReference[]>> {
  const refs: ExternalReference[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("agencies")
      .select("id, settings")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return fail("agency_branding", error);

    const page = (data ?? []) as Array<{ settings: unknown }>;
    for (const row of page) {
      collectStorageRefsFromJson(row.settings, "agency_branding", refs);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, value: refs };
}

// ---------------------------------------------------------------------------
//    3c. Page-builder / CMS bindings. Builder image nodes store `props.src` as
//        a RAW public URL inside a JSON tree, not as an asset id. So a page can
//        still render an image whose `media_assets` row was soft-deleted in the
//        media library — reaping on the row alone would blank a live page.
//        Every blob below is harvested for `/storage/v1/object/...` URLs.
//
//    3d. Non-media_assets tables that own their own storage paths.
// ---------------------------------------------------------------------------
type JsonSource = {
  table: string;
  columns: string[];
  /** Stable pagination key (A9). Defaults to "id"; PK-by-tenant tables differ. */
  orderBy?: string;
};

/** Blobs and URL columns that can pin a storage object. Adding a new builder
 *  surface that stores raw image URLs MUST add its table here — and must have
 *  a stable `orderBy` key, or its pages can skip rows (see A9 below). */
const JSON_REFERENCE_SOURCES: JsonSource[] = [
  { table: "cms_pages", columns: ["hero", "og_image_url", "published_page_snapshot", "published_homepage_snapshot"] },
  { table: "cms_sections", columns: ["props_jsonb"] },
  { table: "cms_builder_components", columns: ["subtree_jsonb"] },
  { table: "cms_navigation_menus", columns: ["tree_json"] },
  { table: "cms_workspace_templates", columns: ["snapshot_jsonb"] },
  { table: "cms_posts", columns: ["og_image_url"] },
  { table: "builder_templates", columns: ["builder_tree"] },
  { table: "talent_sites", columns: ["logo_url", "shell_tree", "draft_snapshot", "published_snapshot"] },
  { table: "talent_pages", columns: ["og_image_url"] },
  { table: "profiles", columns: ["avatar_url"] },
  // agency_branding is keyed by tenant_id — it has no `id` column at all, so
  // ordering by "id" would fail the whole query and abort every run.
  { table: "agency_branding", columns: ["theme_json"], orderBy: "tenant_id" },
];

async function loadJsonSourceRefs(
  admin: SupabaseClient,
  source: JsonSource,
): Promise<Result<ExternalReference[]>> {
  const refs: ExternalReference[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(source.table)
      .select(source.columns.join(", "))
      // A9 — stable pagination. Without it a >1-page table can drop a row
      // between windows, and a dropped reference means a referenced object is
      // classified as an orphan and deleted.
      .order(source.orderBy ?? "id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return fail(`json_refs:${source.table}`, error);

    // The column list is built at runtime, so supabase-js cannot infer a row
    // type here and falls back to its GenericStringError shape.
    const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const row of page) {
      for (const col of source.columns) {
        collectStorageRefsFromJson(row[col], source.table, refs);
      }
    }
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, value: refs };
}

/** `talent_review_media` owns review photo objects outright (bucket_id +
 *  storage_path), with no `media_assets` row. Soft-deleted rows still own
 *  their object, so every row counts as a reference. */
async function loadReviewMediaRefs(
  admin: SupabaseClient,
): Promise<Result<ExternalReference[]>> {
  const refs: ExternalReference[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("talent_review_media")
      .select("bucket_id, storage_path")
      // A9 — stable pagination; see loadJsonSourceRefs.
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return fail("talent_review_media", error);

    const page = (data ?? []) as Array<{ bucket_id: string | null; storage_path: string | null }>;
    for (const r of page) {
      if (!r.storage_path) continue;
      refs.push({
        bucketId: r.bucket_id ?? "media-public",
        storagePath: r.storage_path,
        source: "talent_review_media",
      });
    }
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, value: refs };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
export type ReapOptions = {
  graceDays?: number;
  maxDeletions?: number;
  /** false (default) = dry run: report only, delete nothing. */
  execute?: boolean;
  allowUnaccounted?: boolean;
  now?: Date;
};

export type ReapReport = {
  ok: true;
  dryRun: boolean;
  graceDays: number;
  maxDeletions: number;
  scanned: { objects: number; assetRows: number; externalRefs: number };
  wouldDelete: { count: number; bytes: number };
  eligibleBeforeCap: { count: number; bytes: number };
  cappedByLimit: boolean;
  keptByReason: Record<string, number>;
  /** First 25 paths, so the report is legible without dumping thousands. */
  samplePaths: string[];
  deleted: { count: number; bytes: number } | null;
  durationMs: number;
};

export type ReapOutcome = ReapReport | ScanFailure;

/**
 * Env-driven configuration. `MEDIA_REAPER_ENABLED` is the ONLY switch that can
 * turn deletion on, and it defaults to OFF (dry run).
 */
export function reapOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): ReapOptions {
  const graceDays = Number.parseInt(env.MEDIA_REAPER_GRACE_DAYS ?? "", 10);
  const maxDeletions = Number.parseInt(env.MEDIA_REAPER_MAX_DELETIONS ?? "", 10);
  return {
    execute: env.MEDIA_REAPER_ENABLED === "true",
    allowUnaccounted: env.MEDIA_REAPER_ALLOW_UNACCOUNTED === "true",
    graceDays: Number.isFinite(graceDays) && graceDays > 0 ? graceDays : DEFAULT_GRACE_DAYS,
    maxDeletions:
      Number.isFinite(maxDeletions) && maxDeletions > 0
        ? maxDeletions
        : DEFAULT_MAX_DELETIONS_PER_RUN,
  };
}

export async function runMediaReaper(
  admin: SupabaseClient,
  options: ReapOptions = {},
): Promise<ReapOutcome> {
  const startedAt = Date.now();
  const execute = options.execute === true;

  // --- gather: any failure aborts before a single delete is considered ------
  const objects: StorageObject[] = [];
  for (const bucketId of MANAGED_BUCKETS) {
    const listed = await listBucketObjects(admin, bucketId);
    if (!listed.ok) return listed;
    objects.push(...listed.value);
  }

  const assets = await loadMediaAssets(admin);
  if (!assets.ok) return assets;

  const documents = await loadTalentDocumentRefs(admin);
  if (!documents.ok) return documents;

  const branding = await loadBrandingRefs(admin);
  if (!branding.ok) return branding;

  const reviewMedia = await loadReviewMediaRefs(admin);
  if (!reviewMedia.ok) return reviewMedia;

  const externalReferences = [...documents.value, ...branding.value, ...reviewMedia.value];

  // Page-builder / CMS trees. A single table failing to answer aborts the run:
  // a page whose bindings we could not read is a page whose images we cannot
  // prove are unused.
  for (const source of JSON_REFERENCE_SOURCES) {
    const refs = await loadJsonSourceRefs(admin, source);
    if (!refs.ok) return refs;
    externalReferences.push(...refs.value);
  }

  // --- classify -------------------------------------------------------------
  const plan: ReapPlan = classifyStorageObjects({
    objects,
    assets: assets.value,
    externalReferences,
    now: options.now ?? new Date(),
    graceDays: options.graceDays,
    maxDeletions: options.maxDeletions,
    allowUnaccounted: options.allowUnaccounted,
  });

  // --- execute (only when explicitly enabled) -------------------------------
  let deleted: ReapReport["deleted"] = null;
  if (execute && plan.deletable.length > 0) {
    let count = 0;
    let bytes = 0;
    for (const bucketId of MANAGED_BUCKETS) {
      const paths = plan.deletable
        .filter((d) => d.bucketId === bucketId)
        .map((d) => d.storagePath);
      if (paths.length === 0) continue;
      // Chunked so one oversized request cannot fail the batch.
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await admin.storage.from(bucketId).remove(chunk);
        if (error) {
          logServerError("media-reaper.remove", error);
          return fail(`storage.remove:${bucketId}`, error);
        }
        count += chunk.length;
      }
      bytes += plan.deletable
        .filter((d) => d.bucketId === bucketId)
        .reduce((n, d) => n + d.sizeBytes, 0);
    }
    deleted = { count, bytes };
  }

  return {
    ok: true,
    dryRun: !execute,
    graceDays: plan.graceDays,
    maxDeletions: plan.maxDeletions,
    scanned: {
      objects: objects.length,
      assetRows: assets.value.length,
      externalRefs: externalReferences.length,
    },
    wouldDelete: { count: plan.deletable.length, bytes: plan.deletableBytes },
    eligibleBeforeCap: { count: plan.eligibleCount, bytes: plan.eligibleBytes },
    cappedByLimit: plan.cappedByLimit,
    keptByReason: plan.keptByReason,
    samplePaths: plan.deletable.slice(0, 25).map((d) => `${d.bucketId}/${d.storagePath}`),
    deleted,
    durationMs: Date.now() - startedAt,
  };
}
