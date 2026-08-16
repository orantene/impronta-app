import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BuilderImageMediaAsset,
  MediaAssetKind,
  MediaAssetRow,
  MediaFolderRow,
  MediaLibraryFolder,
  MediaLibraryItem,
} from "./types";
import {
  MEDIA_LIBRARY_MAX_ITEMS,
  MEDIA_PUBLIC_BUCKET,
  SVG_SANITIZED_METADATA_KEY,
  isSafeMediaUrl,
  normalizeAltText,
} from "./validation";
import { workspaceOwnedStamp } from "@/lib/media/ownership";

// MEDIA-1 — `asset_kind` ships in migration 20261102000000 and may be absent on
// a pre-migration read (PostgREST errors the whole select on a missing column),
// so it lives OUTSIDE the base list. Every query selects the extended list and
// falls back to the base list on error (mirrors the STYLE-1 cms_pages adapter
// degrade path). `tags` already exists in production; it is in the base list and
// the mapper tolerates a null/absent value, so a fake/partial row stays safe.
const MEDIA_ASSET_BASE_COLUMNS = [
  "id",
  "tenant_id",
  "owner_talent_profile_id",
  "variant_kind",
  "storage_path",
  "bucket_id",
  "public_url",
  "width",
  "height",
  "file_size",
  "file_size_bytes",
  "byte_size",
  "mime",
  "mime_type",
  "alt",
  "tags",
  "created_at",
  "metadata",
].join(", ");

const MEDIA_ASSET_COLUMNS = `${MEDIA_ASSET_BASE_COLUMNS}, asset_kind`;

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
]);

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi", "mkv", "m4v"]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
]);

function inferSourceHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.source === "string") return m.source;
  if (typeof m.seeded_by === "string") return m.seeded_by;
  return null;
}

function resolvePublicUrl(
  supabase: SupabaseClient,
  row: Pick<MediaAssetRow, "bucket_id" | "storage_path" | "public_url">,
): string {
  if (isSafeMediaUrl(row.public_url)) return row.public_url;
  const { data } = supabase.storage
    .from(row.bucket_id)
    .getPublicUrl(row.storage_path);
  return isSafeMediaUrl(data?.publicUrl) ? data.publicUrl : "";
}

/** True only when the register lane stamped the row after the strict
 *  brand-mark sanitizer accepted the bytes it wrote to storage. */
export function isSanitizedSvgRow(row: Pick<MediaAssetRow, "metadata">): boolean {
  const meta = row.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (meta as Record<string, unknown>)[SVG_SANITIZED_METADATA_KEY] === true;
}

/**
 * MEDIA-1 — resolve the library kind for a row. Prefers the persisted
 * `asset_kind` discriminant (migration 20261102000000); when that column is
 * absent (pre-migration) or NULL (legacy row), infers from MIME, then from the
 * storage-path extension. Anything that resolves to none of image/video/document
 * returns `null` and is dropped from the library.
 *
 * SVG is the one MIME that does NOT follow the persisted-first rule. An SVG in
 * the public bucket is stored XSS the moment its public URL is opened, so it
 * only counts as an image when this row carries the `svg_sanitized` stamp that
 * /api/admin/media/upload/svg writes after `sanitizeSvgLogoBuffer` accepted the
 * exact bytes now in storage. The check runs BEFORE the `asset_kind` branch on
 * purpose: a future writer that sets asset_kind='image' on an unsanitized SVG
 * must not be able to re-open this hole.
 *
 * EXPORTED (2026-08-16, library unification) so `lib/media/library-query.ts`
 * resolves kind through this exact function rather than re-deriving the SVG
 * rule as a PostgREST predicate. A second implementation of an XSS gate is a
 * second thing that can be wrong; there is one.
 */
export function resolveAssetKind(row: MediaAssetRow): MediaAssetKind | null {
  const rawMime = (row.mime ?? row.mime_type ?? "").toLowerCase();
  const isSvg =
    rawMime === "image/svg+xml" ||
    (!rawMime && row.storage_path.toLowerCase().endsWith(".svg"));
  if (isSvg) return isSanitizedSvgRow(row) ? "image" : null;

  const persisted = row.asset_kind;
  if (persisted === "image" || persisted === "video" || persisted === "document") {
    return persisted;
  }

  const mime = rawMime;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (
    mime === "application/pdf" ||
    mime.startsWith("application/vnd.") ||
    mime === "application/msword" ||
    mime === "text/plain" ||
    mime === "text/csv"
  ) {
    return "document";
  }

  const ext = row.storage_path.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  return null;
}

/** Normalize the `tags` column (text[]; may be null/absent pre-migration). */
function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * MEDIA-1 — try the extended select (with `asset_kind`); on a PostgREST error
 * (column absent pre-migration) re-run with the base columns so the picker keeps
 * working. Both selects share the same row shape; the mapper degrades `asset_kind`
 * to MIME/extension inference when the column is missing.
 */
async function selectMediaRows(
  build: (columns: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<MediaAssetRow[]> {
  const primary = await build(MEDIA_ASSET_COLUMNS);
  if (!primary.error && primary.data) return primary.data as MediaAssetRow[];
  const fallback = await build(MEDIA_ASSET_BASE_COLUMNS);
  if (fallback.error || !fallback.data) return [];
  return fallback.data as MediaAssetRow[];
}

function buildFolderIdMap(folders: ReadonlyArray<MediaLibraryFolder>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const folder of folders) {
    for (const assetId of folder.assetIds) {
      const existing = map.get(assetId) ?? [];
      existing.push(folder.id);
      map.set(assetId, existing);
    }
  }
  return map;
}

export function rowToMediaLibraryItem(
  supabase: SupabaseClient,
  row: MediaAssetRow,
  folderIds: string[] = [],
): MediaLibraryItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerTalentProfileId: row.owner_talent_profile_id,
    variantKind: row.variant_kind,
    // MEDIA-1 — unknown kinds are filtered out before mapping, so default to
    // "image" defensively for any row that slips through.
    assetKind: resolveAssetKind(row) ?? "image",
    storagePath: row.storage_path,
    publicUrl: resolvePublicUrl(supabase, row),
    width: row.width,
    height: row.height,
    fileSize: row.byte_size ?? row.file_size_bytes ?? row.file_size,
    mime: row.mime ?? row.mime_type,
    alt: normalizeAltText(row.alt),
    tags: normalizeTags(row.tags),
    createdAt: row.created_at,
    sourceHint: inferSourceHint(row.metadata),
    folderIds,
  };
}

export function toBuilderImageMediaAsset(
  item: MediaLibraryItem,
): BuilderImageMediaAsset {
  return {
    id: item.id,
    publicUrl: item.publicUrl,
    alt: item.alt,
    width: item.width,
    height: item.height,
  };
}

export async function listTenantMediaLibrary(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryItem[]> {
  const [rows, folders] = await Promise.all([
    selectMediaRows((columns) =>
      supabase
        .from("media_assets")
        .select(columns)
        .eq("tenant_id", tenantId)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MEDIA_LIBRARY_MAX_ITEMS),
    ),
    listTenantMediaFolders(supabase, tenantId),
  ]);

  const folderIdsByAsset = buildFolderIdMap(folders);
  // MEDIA-1 — surface every supported kind (image/video/document); only drop
  // rows whose kind can't be resolved (e.g. SVG, XSS-excluded).
  return rows
    .filter((row) => resolveAssetKind(row) !== null)
    .map((row) =>
      rowToMediaLibraryItem(supabase, row, folderIdsByAsset.get(row.id) ?? []),
    )
    .filter((item) => isSafeMediaUrl(item.publicUrl));
}

/**
 * Talent-scoped media library for the Max-tier page builder picker. Returns the
 * talent's OWN media (`owner_talent_profile_id = talentProfileId`) PLUS the
 * photos on their profile (the `agency_talent_media` portfolio links, which may
 * point at agency-owned originals). Each portfolio asset id is returned in
 * `portfolioAssetIds` so the picker can label "My portfolio" vs "My uploads".
 *
 * Unlike `listTenantMediaLibrary` this does NOT expose the whole agency library
 * — a talent only sees their own imagery (privacy + the staff-only library API
 * doesn't authorize talents anyway). Caller MUST have already authorized the
 * talent-self / managing-staff boundary (see the /api/talent/media/library route).
 *
 * SECURITY: the caller passes a SERVICE-ROLE client (bypasses RLS), so this
 * function MUST scope EVERY query to `tenantId` at the application layer — a
 * talent can sit on multiple agencies' rosters (`agency_talent_media` rows in
 * several tenants), and without the tenant filter a managing-staff caller could
 * pull another tenant's media for that shared talent. `tenantId` is the managing
 * tenant verified by the route's auth gate.
 */
export async function listTalentScopedMediaLibrary(
  supabase: SupabaseClient,
  talentProfileId: string,
  tenantId: string,
): Promise<{ items: MediaLibraryItem[]; portfolioAssetIds: string[] }> {
  // 1) The talent's portfolio links (the photos shown on their public profile),
  //    scoped to the managing tenant.
  const portfolioLinks = await supabase
    .from("agency_talent_media")
    .select("agency_media_id, master_media_id, display_order")
    .eq("talent_profile_id", talentProfileId)
    .eq("tenant_id", tenantId)
    .order("display_order", { ascending: true });

  const portfolioIds: string[] = [];
  for (const link of (portfolioLinks.data ?? []) as Array<{
    agency_media_id: string | null;
    master_media_id: string | null;
  }>) {
    if (link.agency_media_id) portfolioIds.push(link.agency_media_id);
    if (link.master_media_id) portfolioIds.push(link.master_media_id);
  }
  const uniquePortfolioIds = [...new Set(portfolioIds)];

  // 2) The talent's own uploads + 3) the portfolio asset rows (may be agency-
  //    owned, so a plain owner filter would miss them) — both tenant-scoped.
  const [ownedRows, portfolioRows] = await Promise.all([
    selectMediaRows((columns) =>
      supabase
        .from("media_assets")
        .select(columns)
        .eq("owner_talent_profile_id", talentProfileId)
        .eq("tenant_id", tenantId)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MEDIA_LIBRARY_MAX_ITEMS),
    ),
    uniquePortfolioIds.length > 0
      ? selectMediaRows((columns) =>
          supabase
            .from("media_assets")
            .select(columns)
            .in("id", uniquePortfolioIds)
            .eq("tenant_id", tenantId)
            .eq("approval_state", "approved")
            .is("deleted_at", null),
        )
      : Promise.resolve([] as MediaAssetRow[]),
  ]);

  const byId = new Map<string, MediaLibraryItem>();
  const ingest = (rows: MediaAssetRow[]) => {
    for (const row of rows) {
      if (resolveAssetKind(row) === null) continue;
      const item = rowToMediaLibraryItem(supabase, row, []);
      if (!isSafeMediaUrl(item.publicUrl)) continue;
      byId.set(item.id, item);
    }
  };
  ingest(ownedRows);
  ingest(portfolioRows);

  // Only the portfolio ids that resolved to a usable image asset.
  const resolvedPortfolioIds = uniquePortfolioIds.filter((id) => byId.has(id));
  return {
    items: [...byId.values()],
    portfolioAssetIds: resolvedPortfolioIds,
  };
}

export async function listTenantMediaFolders(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryFolder[]> {
  const { data, error } = await supabase
    .from("media_folders")
    .select("id, name, color, media_folder_items ( asset_id )")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as MediaFolderRow[]).map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    assetIds: (folder.media_folder_items ?? []).map((item) => item.asset_id),
  }));
}

export async function getTenantMediaAsset(
  supabase: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<MediaLibraryItem | null> {
  const rows = await selectMediaRows((columns) =>
    supabase
      .from("media_assets")
      .select(columns)
      .eq("tenant_id", tenantId)
      .eq("id", assetId)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  if (resolveAssetKind(row) === null) return null;
  const folders = await listTenantMediaFolders(supabase, tenantId);
  const item = rowToMediaLibraryItem(
    supabase,
    row,
    buildFolderIdMap(folders).get(row.id) ?? [],
  );
  return isSafeMediaUrl(item.publicUrl) ? item : null;
}

export async function listBuilderImageMediaAssets(
  supabase: SupabaseClient,
  tenantId: string,
  assetIds: ReadonlyArray<string>,
): Promise<BuilderImageMediaAsset[]> {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const rows = await selectMediaRows((columns) =>
    supabase
      .from("media_assets")
      .select(columns)
      .eq("tenant_id", tenantId)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .in("id", ids),
  );

  // Image-binding resolver — node image props only render images, so keep this
  // strictly image-kind even though the library read surfaces video/doc.
  return rows
    .filter((row) => resolveAssetKind(row) === "image")
    .map((row) => rowToMediaLibraryItem(supabase, row))
    .filter((item) => isSafeMediaUrl(item.publicUrl))
    .map(toBuilderImageMediaAsset);
}

/**
 * Patch a media asset and return the refreshed library item. Shared by the
 * central alt + tag manager (MEDIA-1). The returning `.select()` degrades to the
 * base columns if `asset_kind` is absent pre-migration (mirrors `selectMediaRows`).
 */
async function patchTenantMediaAsset(
  supabase: SupabaseClient,
  tenantId: string,
  assetId: string,
  patch: Record<string, unknown>,
): Promise<MediaLibraryItem | null> {
  const runUpdate = (columns: string) =>
    supabase
      .from("media_assets")
      .update(patch)
      .eq("tenant_id", tenantId)
      .eq("id", assetId)
      .is("deleted_at", null)
      .select(columns)
      .maybeSingle();

  let { data, error } = await runUpdate(MEDIA_ASSET_COLUMNS);
  if (error) ({ data, error } = await runUpdate(MEDIA_ASSET_BASE_COLUMNS));
  if (error || !data) return null;
  return rowToMediaLibraryItem(supabase, data as unknown as MediaAssetRow);
}

export async function updateTenantMediaAssetAlt(input: {
  supabase: SupabaseClient;
  tenantId: string;
  assetId: string;
  alt: string | null;
}): Promise<MediaLibraryItem | null> {
  return patchTenantMediaAsset(input.supabase, input.tenantId, input.assetId, {
    alt: normalizeAltText(input.alt),
  });
}

/**
 * MEDIA-1 — set the free-text workspace tags on a library asset. Powers the
 * central tag manager in the shared media picker. Tags are trimmed, de-duped,
 * lowercased for stable filtering, and capped so a single row can't bloat.
 */
export function normalizeTagInput(tags: ReadonlyArray<string>): string[] {
  const cleaned = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24);
  return [...new Set(cleaned)];
}

export async function updateTenantMediaAssetTags(input: {
  supabase: SupabaseClient;
  tenantId: string;
  assetId: string;
  tags: ReadonlyArray<string>;
}): Promise<MediaLibraryItem | null> {
  return patchTenantMediaAsset(input.supabase, input.tenantId, input.assetId, {
    tags: normalizeTagInput(input.tags),
  });
}

export async function insertTenantImageAsset(input: {
  supabase: SupabaseClient;
  tenantId: string;
  createdByUserId: string;
  storagePath: string;
  mime: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  /**
   * The name the operator's file had on their disk.
   *
   * Found unpersisted in #1169's QA and fixed here. Every CMS upload lane
   * (signed register, legacy multipart, SVG) already carried the filename all
   * the way to this insert and then wrote it ONLY into
   * `metadata.original_file_name` — while `lib/media/library-query.ts` reads
   * (and searches) the top-level `original_filename` COLUMN. So a CMS-uploaded
   * asset showed no name in the library and could not be found by typing its
   * name into the search box. The metadata key stays for existing rows; the
   * column is now written too.
   */
  originalFilename?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ item: MediaLibraryItem | null; error: string | null }> {
  const publicUrl = resolvePublicUrl(input.supabase, {
    bucket_id: MEDIA_PUBLIC_BUCKET,
    storage_path: input.storagePath,
    public_url: null,
  });
  if (!isSafeMediaUrl(publicUrl)) {
    return { item: null, error: "Storage returned an unsafe public URL." };
  }

  // NOTE: `asset_kind` is intentionally NOT in the insert payload — including a
  // column absent pre-migration would error the INSERT. This row is always an
  // image (image-only upload path) and reads back as "image" via MIME inference;
  // the backfill in migration 20261102000000 sets the persisted value.
  const { data, error } = await input.supabase
    .from("media_assets")
    .insert([
      {
        tenant_id: input.tenantId,
        // Ownership truth (plan §5a) — every caller of this helper is a
        // workspace surface (CMS library, builder thumbnails, AI imagery),
        // so the row is workspace-owned with the uploader recorded.
        ...workspaceOwnedStamp(input.tenantId, input.createdByUserId),
        bucket_id: MEDIA_PUBLIC_BUCKET,
        storage_path: input.storagePath,
        public_url: publicUrl,
        variant_kind: "original",
        approval_state: "approved",
        purpose: "cms",
        sort_order: 0,
        width: input.width ?? null,
        height: input.height ?? null,
        file_size: input.byteSize,
        file_size_bytes: input.byteSize,
        byte_size: input.byteSize,
        mime: input.mime,
        mime_type: input.mime,
        alt: normalizeAltText(input.alt),
        original_filename: input.originalFilename ?? null,
        metadata: input.metadata ?? {},
      },
    ])
    // Base columns only — degrade-safe (no asset_kind in the returning select).
    .select(MEDIA_ASSET_BASE_COLUMNS)
    .single();

  if (error || !data) {
    return {
      item: null,
      error: error?.message ?? "Could not record the uploaded asset.",
    };
  }

  return {
    item: rowToMediaLibraryItem(input.supabase, data as unknown as MediaAssetRow),
    error: null,
  };
}
