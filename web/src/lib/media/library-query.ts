/**
 * library-query.ts — SEAM 1 of the media library unification (2026-08-16).
 *
 * THE ONE READ PATH for tenant media. Before this module there were two, and
 * they disagreed:
 *
 *   listTenantMediaLibrary()          → 60 rows, newest first, no search,
 *   (lib/site-admin/media/assets.ts)    no pagination, no ownership columns.
 *                                       Every builder picker read this, so on
 *                                       a 1,900-asset tenant ~97% of the
 *                                       library was simply unreachable — and
 *                                       the album/kind chips filtered *inside*
 *                                       the truncated 60, which is why a real
 *                                       album rendered "No images in this
 *                                       album".
 *
 *   loadWorkspaceMediaBridge()        → 5000 rows with ownership, watermark
 *   (_data-bridge-media.ts)             override, notes and provenance. The
 *                                       workspace Media page read this.
 *
 * Both now call in here. `WorkspaceMediaPhoto` (lib/media/library-item.ts) is
 * the one item shape; `MEDIA_LIBRARY_MAX_ITEMS` survives only as a default
 * PAGE SIZE, never as a ceiling.
 *
 * DESIGN NOTES
 * ────────────
 * • Keyset pagination on `(created_at, id)` desc. Offset paging over a table
 *   that is actively being written to skips and repeats rows; keyset does not.
 *
 * • Kind resolution runs IN MEMORY through `resolveAssetKind`, the same
 *   function the old path used, because that function holds a security rule
 *   that cannot be expressed as a PostgREST filter: an SVG is only an image
 *   once `/api/admin/media/upload/svg` stamped `svg_sanitized` on the exact
 *   bytes in storage (#1165). Re-deriving that predicate in SQL would be a
 *   second implementation of an XSS gate — the exact shape of the
 *   `REVOKE ... FROM anon` no-op incident. So the SQL filter is a deliberate
 *   SUPERSET and a fill-loop tops the page up until it is full or the table
 *   is exhausted; a page is never short just because a row was dropped.
 *
 * • `approvalState` defaults to `'approved'`, matching the old picker read.
 *   Pending rows are NOT silently absent: `pendingCount` comes back on every
 *   result so a surface can say "3 awaiting approval" instead of leaving an
 *   operator to wonder where their upload went.
 *
 * • PRIVATE FOLDERS. `media_folders.is_private` has been stored and ignored
 *   since it shipped. The reading chosen here — and it is a choice, so it is
 *   written down: a private folder is visible to WORKSPACE STAFF only. The
 *   talent-scoped lane never lists it and never resolves `folderId` to it.
 *   Assets are not themselves hidden by folder membership (an asset in a
 *   private folder that a talent owns is still their asset); the folder is the
 *   organising surface being kept staff-side, which is the conservative
 *   reading of a flag whose UI never explained itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decodeMediaCursor,
  encodeMediaCursor,
  sanitizeMediaSearch,
  MEDIA_LIBRARY_MAX_PAGE_SIZE,
  MEDIA_LIBRARY_PAGE_SIZE,
  type MediaLibraryApprovalFilter,
  type MediaLibraryKindFilter,
  type MediaLibraryOwnerLane,
  type MediaLibraryOwnershipFilter,
  type MediaLibraryScope,
  type MediaLibraryTalentOption,
  type WorkspaceMediaFolder,
  type WorkspaceMediaPhoto,
} from "./library-item";
import { normalizeOwnershipKind } from "./ownership";
import { resolveAssetKind } from "@/lib/site-admin/media/assets";
import { isSafeMediaUrl } from "@/lib/site-admin/media/validation";

export type MediaLibraryQueryInput = {
  supabase: SupabaseClient;
  /** The workspace whose library this is. Scopes EVERY query — the talent lane
   *  runs on a service-role client, so the app layer is the only tenant gate. */
  tenantId: string;
  scope?: MediaLibraryScope;
  /** Required when `scope === "talent"`. */
  talentProfileId?: string | null;
  search?: string | null;
  folderId?: string | null;
  kind?: MediaLibraryKindFilter;
  ownership?: MediaLibraryOwnershipFilter;
  /**
   * "Filter by talent" — WHICH talents own the assets, not the ownership KIND.
   * `ownership: "talent"` says "anything a talent owns"; this says "Ana's".
   * Empty array and null both mean "no talent filter"; an entry that is not a
   * uuid is the caller's problem (the route validates).
   *
   * NULL SEMANTICS, because this is exactly where #1169's brand-asset bug came
   * from: `owner_talent_profile_id IN (…)` is NULL — i.e. NOT TRUE — for a
   * workspace-owned brand asset, so those rows drop out. That is CORRECT here
   * (you asked for one talent's photos, the logo is not one) and it is the
   * inverse of the exclusion filter below, where the same NULL had to be
   * rescued with an explicit `is.null` branch. Positive membership: NULL out.
   * Negative membership: NULL must be spelled back in.
   */
  talentProfileIds?: ReadonlyArray<string> | null;
  approvalState?: MediaLibraryApprovalFilter;
  /** `media_assets.purpose` allow-list (e.g. `["branding", "cms"]`). */
  purpose?: ReadonlyArray<string> | null;
  /** `media_assets.variant_kind` allow-list (e.g. `["card","gallery","hero"]`). */
  variantKinds?: ReadonlyArray<string> | null;
  /**
   * Resolve specific asset ids only. Used by the `?id=` lookup on the admin
   * route (BrandTab resolving a stored logo asset id to a URL) so a by-id
   * read returns the SAME item shape a listing does, instead of a second
   * near-identical type that drifts.
   */
  assetIds?: ReadonlyArray<string> | null;
  /** Which half of the tenant library — see {@link MediaLibraryOwnerLane}. */
  ownerLane?: MediaLibraryOwnerLane;
  cursor?: string | null;
  limit?: number;
  /** Staff surfaces only. See the private-folder note in the module doc. */
  includePrivateFolders?: boolean;
  /**
   * Load the roster options for the "filter by talent" select. OFF by default:
   * the workspace Media page composes two `queryTenantMediaLibrary` calls per
   * render and neither one needs a talent select, so making this opt-in keeps
   * a UI affordance from costing every server read an extra roster query.
   */
  includeTalentOptions?: boolean;
  /** `created_at` (default, the only cursor-safe order) or the Media page's
   *  legacy `sort_order`. `sort_order` disables cursor pagination. */
  orderBy?: "created_at" | "sort_order";
};

export type MediaLibraryQueryResult = {
  items: WorkspaceMediaPhoto[];
  /** Folders visible to this scope, with their membership. */
  folders: WorkspaceMediaFolder[];
  /**
   * Options for the "filter by talent" select. Tenant scope only — a talent
   * browsing their own library has nobody to filter by, and shipping them a
   * roster listing would be a cross-talent disclosure they never asked for.
   */
  talents: MediaLibraryTalentOption[];
  /** Pass back as `cursor` for the next page. `null` = end of the library. */
  nextCursor: string | null;
  /**
   * Rows matching this query's SQL filters. In-memory kind resolution can drop
   * a small number of unclassifiable rows (an unsanitized SVG, an unknown
   * extension), so the sum of every page's `items` may be slightly below this.
   * It is a count for "of about N", never a pagination signal — `nextCursor` is.
   */
  totalCount: number;
  /**
   * Rows in scope awaiting approval. They are NOT in `items` (they are not
   * pickable) but their existence is surfaced so an operator whose upload is
   * queued is told so rather than left staring at a library that lost it.
   */
  pendingCount: number;
  /** Talent scope only: the subset of `items` that is on the talent's profile. */
  portfolioAssetIds: string[];
  /** True when the underlying query failed — lets a UI tell "empty" from "broken". */
  errored: boolean;
};

/**
 * MEDIA-1 — `asset_kind` shipped in migration 20261102000000 and PostgREST
 * errors the WHOLE select on a missing column, so it lives outside the base
 * list and every read degrades to the base list on error.
 */
const BASE_COLUMNS = [
  "id",
  "tenant_id",
  "owner_talent_profile_id",
  "bucket_id",
  "storage_path",
  "public_url",
  "variant_kind",
  "approval_state",
  "purpose",
  "watermark_override_json",
  "sort_order",
  "width",
  "height",
  "file_size",
  "file_size_bytes",
  "byte_size",
  "mime",
  "mime_type",
  "original_filename",
  "alt",
  "tags",
  "metadata",
  "source_media_asset_id",
  "created_at",
  "ownership_kind",
  "owner_tenant_id",
  "uploaded_by_user_id",
].join(", ");

const TALENT_EMBED =
  "talent_profiles!owner_talent_profile_id ( id, display_name, first_name, last_name )";

const EXTENDED_COLUMNS = `${BASE_COLUMNS}, asset_kind, ${TALENT_EMBED}`;
const DEGRADED_COLUMNS = `${BASE_COLUMNS}, ${TALENT_EMBED}`;

type LibraryRow = {
  id: string;
  tenant_id: string;
  owner_talent_profile_id: string | null;
  bucket_id: string;
  storage_path: string;
  public_url: string | null;
  variant_kind: string;
  approval_state: string;
  purpose: string | null;
  asset_kind?: string | null;
  watermark_override_json: unknown | null;
  sort_order: number | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  file_size_bytes: number | null;
  byte_size: number | null;
  mime: string | null;
  mime_type: string | null;
  original_filename: string | null;
  alt: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  source_media_asset_id: string | null;
  created_at: string;
  ownership_kind: string | null;
  owner_tenant_id: string | null;
  uploaded_by_user_id: string | null;
  talent_profiles?: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

/** A PostgREST builder, narrowed to the bits this module chains. */
type Filterable = {
  eq: (column: string, value: unknown) => Filterable;
  neq: (column: string, value: unknown) => Filterable;
  is: (column: string, value: unknown) => Filterable;
  in: (column: string, values: ReadonlyArray<unknown>) => Filterable;
  not: (column: string, operator: string, value: unknown) => Filterable;
  or: (filter: string) => Filterable;
};

function talentDisplayName(row: LibraryRow): string {
  const profile = row.talent_profiles;
  if (!profile) return row.owner_talent_profile_id ? "Unnamed" : "Brand & site";
  return (
    profile.display_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "Unnamed"
  );
}

function resolvePublicUrl(supabase: SupabaseClient, row: LibraryRow): string {
  if (isSafeMediaUrl(row.public_url)) return row.public_url;
  const { data } = supabase.storage
    .from(row.bucket_id)
    .getPublicUrl(row.storage_path);
  return isSafeMediaUrl(data?.publicUrl) ? data.publicUrl : "";
}

function rowToPhoto(
  supabase: SupabaseClient,
  row: LibraryRow,
  context: { tenantId: string; folderIds: string[]; assetKind: "image" | "video" | "document" },
): WorkspaceMediaPhoto {
  const url = resolvePublicUrl(supabase, row);
  const metadata = row.metadata ?? {};
  const isWorkspaceAsset = !row.owner_talent_profile_id;
  return {
    id: row.id,
    talentProfileId: row.owner_talent_profile_id ?? "",
    talentName: talentDisplayName(row),
    url,
    thumbUrl: url,
    variantKind: row.variant_kind,
    approvalState: row.approval_state as WorkspaceMediaPhoto["approvalState"],
    hasOverride: row.watermark_override_json !== null,
    watermarkOverride: row.watermark_override_json,
    tags: Array.isArray(row.tags) ? row.tags : [],
    folderIds: context.folderIds,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.byte_size ?? row.file_size_bytes ?? row.file_size,
    mimeType: row.mime_type ?? row.mime,
    originalFilename: row.original_filename,
    note: (metadata.note as string | null) ?? null,
    metadata,
    sourceMediaAssetId: row.source_media_asset_id,
    createdAt: row.created_at,
    ...(isWorkspaceAsset ? { isWorkspaceAsset: true } : {}),
    ...(row.purpose ? { purpose: row.purpose } : {}),
    ownershipKind: normalizeOwnershipKind(row.ownership_kind),
    ownedByThisWorkspace:
      row.ownership_kind === "agency" && row.owner_tenant_id === context.tenantId,
    uploadedByUserId: row.uploaded_by_user_id,
    assetKind: context.assetKind,
    storagePath: row.storage_path,
    alt: row.alt,
  };
}

/**
 * The SQL kind predicate. A deliberate SUPERSET of what `resolveAssetKind`
 * will accept — see the module doc for why the exact rule cannot live in SQL.
 *
 * The superset is kept TIGHT rather than lazy, because `totalCount` is
 * computed from this same predicate and a loose one turns the UI's count into
 * a lie. The first cut said "or asset_kind is null" and made a library with
 * zero videos report "Showing 0 of 259".
 *
 * `mime_type` is the column to test: production has 1,123 rows where `mime` is
 * NULL and `mime_type` is set, and ZERO the other way round. Only rows with
 * NEITHER a persisted kind nor a MIME fall through to extension inference —
 * 55 rows platform-wide — and that is the one escape hatch left open.
 */
function kindFilterExpression(kind: MediaLibraryKindFilter): string | null {
  if (kind === "all") return null;
  const clauses = [
    `asset_kind.eq.${kind}`,
    // No persisted kind, no MIME ⇒ only the storage-path extension can decide,
    // which SQL cannot do here. The in-memory pass narrows these.
    "and(asset_kind.is.null,mime_type.is.null)",
  ];
  if (kind === "image") clauses.push("mime_type.ilike.image/*");
  else if (kind === "video") clauses.push("mime_type.ilike.video/*");
  else {
    // Documents have no single prefix; these two cover every MIME
    // `resolveAssetKind` accepts (application/pdf, application/vnd.*,
    // application/msword, text/plain, text/csv).
    clauses.push("mime_type.ilike.application/*", "mime_type.ilike.text/*");
  }
  return `or(${clauses.join(",")})`;
}

function searchFilterExpression(search: string): string | null {
  if (!search) return null;
  const like = `*${search}*`;
  return `or(original_filename.ilike.${like},alt.ilike.${like},storage_path.ilike.${like},metadata->>note.ilike.${like})`;
}

function ownershipFilter(builder: Filterable, ownership: MediaLibraryOwnershipFilter) {
  if (ownership === "all") return builder;
  if (ownership === "workspace") return builder.eq("ownership_kind", "agency");
  if (ownership === "platform") return builder.eq("ownership_kind", "platform");
  // 'talent' is the DB default, so legacy rows carry NULL rather than 'talent'.
  return builder.or("ownership_kind.eq.talent,ownership_kind.is.null");
}

/** Apply every filter that is shared by the page read and the count read. */
function applyFilters(
  builder: Filterable,
  input: {
    tenantId: string;
    approvalState: MediaLibraryApprovalFilter;
    kind: MediaLibraryKindFilter;
    ownership: MediaLibraryOwnershipFilter;
    search: string;
    purpose: ReadonlyArray<string> | null;
    variantKinds: ReadonlyArray<string> | null;
    ownerLane: MediaLibraryOwnerLane;
    assetIds: ReadonlyArray<string> | null;
    talentProfileIds: ReadonlyArray<string> | null;
    folderAssetIds: string[] | null;
    excludedTalentIds: string[];
    talentScopeIds: string[] | null;
    talentProfileId: string | null;
  },
): Filterable {
  let q = builder.eq("tenant_id", input.tenantId).is("deleted_at", null);

  if (input.approvalState !== "any") {
    q = q.eq("approval_state", input.approvalState);
  }

  const kindExpression = kindFilterExpression(input.kind);
  if (kindExpression) q = q.or(kindExpression);

  q = ownershipFilter(q, input.ownership);

  const searchExpression = searchFilterExpression(input.search);
  if (searchExpression) q = q.or(searchExpression);

  if (input.purpose && input.purpose.length > 0) q = q.in("purpose", input.purpose);
  if (input.variantKinds && input.variantKinds.length > 0) {
    q = q.in("variant_kind", input.variantKinds);
  }

  if (input.ownerLane === "talent-owned") {
    q = q.not("owner_talent_profile_id", "is", null);
  } else if (input.ownerLane === "workspace-owned") {
    q = q.is("owner_talent_profile_id", null);
  }

  if (input.assetIds) q = q.in("id", input.assetIds);
  if (input.folderAssetIds) q = q.in("id", input.folderAssetIds);

  // "Filter by talent". POSITIVE membership, so the NULL rows (workspace-owned
  // brand & site imagery) fall out on their own and MUST NOT be rescued — see
  // the `talentProfileIds` doc on the input type. This is ANDed with every
  // other filter, including `ownership`: talent=Ana + ownership=workspace is a
  // legitimate, and usually empty, question.
  if (input.talentProfileIds && input.talentProfileIds.length > 0) {
    q = q.in("owner_talent_profile_id", input.talentProfileIds);
  }

  // Media belonging to a talent this workspace removed from its roster stays
  // out of the library — the Media page has excluded it since it shipped, and
  // the picker used to include it. One truth, and it is the stricter one.
  //
  // The NULL branch is load-bearing, not defensive: in SQL `x NOT IN (…)` is
  // NULL — i.e. NOT TRUE — when x is NULL, so a bare `not.in` would delete
  // every workspace-owned brand & site asset from the library the moment one
  // talent was removed from the roster. Those rows have no owner talent at all.
  if (input.excludedTalentIds.length > 0) {
    q = q.or(
      `owner_talent_profile_id.is.null,owner_talent_profile_id.not.in.(${input.excludedTalentIds.join(",")})`,
    );
  }

  // Talent scope: the talent's OWN uploads plus whatever is on their profile
  // (portfolio links may point at agency-owned originals).
  if (input.talentScopeIds !== null && input.talentProfileId) {
    const clauses = [`owner_talent_profile_id.eq.${input.talentProfileId}`];
    if (input.talentScopeIds.length > 0) {
      clauses.push(`id.in.(${input.talentScopeIds.join(",")})`);
    }
    q = q.or(clauses.join(","));
  }

  return q;
}

async function loadFolders(
  supabase: SupabaseClient,
  tenantId: string,
  includePrivate: boolean,
): Promise<WorkspaceMediaFolder[]> {
  const { data, error } = await supabase
    .from("media_folders")
    .select(
      "id, name, color, is_private, share_token, share_expires_at, share_view_count, created_at, is_collection, shoot_date, media_folder_items ( asset_id )",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  type FolderRow = {
    id: string;
    name: string;
    color: string | null;
    is_private: boolean | null;
    share_token: string | null;
    share_expires_at: string | null;
    share_view_count: number | null;
    created_at: string;
    is_collection: boolean | null;
    shoot_date: string | null;
    media_folder_items: Array<{ asset_id: string }> | null;
  };

  return (data as unknown as FolderRow[])
    .filter((folder) => includePrivate || folder.is_private !== true)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      isPrivate: folder.is_private === true,
      shareToken: folder.share_token,
      shareExpiresAt: folder.share_expires_at,
      shareViewCount: folder.share_view_count ?? 0,
      assetIds: (folder.media_folder_items ?? []).map((item) => item.asset_id),
      createdAt: folder.created_at,
      isCollection: folder.is_collection === true,
      shootDate: folder.shoot_date,
    }));
}

/**
 * The roster this workspace can filter by. Non-removed statuses only, because
 * a removed talent's media is already excluded from every read below — an
 * option that can only ever return zero assets is a trap, not a filter.
 */
async function loadTalentOptions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryTalentOption[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select(
      "talent_profile_id, talent_profiles!talent_profile_id ( id, display_name, first_name, last_name, profile_code )",
    )
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error || !data) return [];

  type RosterRow = {
    talent_profile_id: string | null;
    talent_profiles?: {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      profile_code: string | null;
    } | null;
  };

  const byId = new Map<string, MediaLibraryTalentOption>();
  for (const row of data as unknown as RosterRow[]) {
    const id = row.talent_profile_id;
    if (!id) continue;
    const profile = row.talent_profiles ?? null;
    const name =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      "Unnamed";
    // A talent can hold more than one roster row for the same tenant (rejoins
    // are additive in places); the select must not show them twice.
    if (!byId.has(id)) {
      byId.set(id, { id, name, profileCode: profile?.profile_code ?? null });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Talents this workspace removed from its roster. Their media leaves with them. */
async function loadExcludedTalentIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "removed");
  if (error || !data) return [];
  return (data as Array<{ talent_profile_id: string | null }>)
    .map((row) => row.talent_profile_id)
    .filter((id): id is string => !!id);
}

/**
 * The asset ids linked to this talent's public profile, scoped to the managing
 * tenant. A talent can sit on several rosters, so the tenant filter is the
 * security boundary, not a nicety (the caller passes a service-role client).
 */
async function loadPortfolioAssetIds(
  supabase: SupabaseClient,
  talentProfileId: string,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_media")
    .select("agency_media_id, master_media_id, display_order")
    .eq("talent_profile_id", talentProfileId)
    .eq("tenant_id", tenantId)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  const ids: string[] = [];
  for (const link of data as Array<{
    agency_media_id: string | null;
    master_media_id: string | null;
  }>) {
    if (link.agency_media_id) ids.push(link.agency_media_id);
    if (link.master_media_id) ids.push(link.master_media_id);
  }
  return [...new Set(ids)];
}

export async function queryTenantMediaLibrary(
  input: MediaLibraryQueryInput,
): Promise<MediaLibraryQueryResult> {
  const supabase = input.supabase;
  const tenantId = input.tenantId;
  const scope: MediaLibraryScope = input.scope ?? "tenant";
  const talentProfileId = scope === "talent" ? input.talentProfileId ?? null : null;
  const approvalState: MediaLibraryApprovalFilter = input.approvalState ?? "approved";
  const kind: MediaLibraryKindFilter = input.kind ?? "all";
  const ownership: MediaLibraryOwnershipFilter = input.ownership ?? "all";
  const ownerLane: MediaLibraryOwnerLane = input.ownerLane ?? "all";
  const orderBy = input.orderBy ?? "created_at";
  const search = sanitizeMediaSearch(input.search);
  const limit = Math.max(
    1,
    Math.min(input.limit ?? MEDIA_LIBRARY_PAGE_SIZE, MEDIA_LIBRARY_MAX_PAGE_SIZE),
  );
  // A talent never sees a private folder — see the module doc.
  const includePrivateFolders =
    scope === "tenant" && input.includePrivateFolders !== false;

  const empty: MediaLibraryQueryResult = {
    items: [],
    folders: [],
    talents: [],
    nextCursor: null,
    totalCount: 0,
    pendingCount: 0,
    portfolioAssetIds: [],
    errored: false,
  };

  if (scope === "talent" && !talentProfileId) return empty;

  try {
    const [folders, excludedTalentIds, portfolioAssetIds, talents] =
      await Promise.all([
        loadFolders(supabase, tenantId, includePrivateFolders),
        loadExcludedTalentIds(supabase, tenantId),
        scope === "talent" && talentProfileId
          ? loadPortfolioAssetIds(supabase, talentProfileId, tenantId)
          : Promise.resolve<string[]>([]),
        scope === "tenant" && input.includeTalentOptions === true
          ? loadTalentOptions(supabase, tenantId)
          : Promise.resolve<MediaLibraryTalentOption[]>([]),
      ]);

    const folderIdsByAsset = new Map<string, string[]>();
    for (const folder of folders) {
      for (const assetId of folder.assetIds) {
        const existing = folderIdsByAsset.get(assetId);
        if (existing) existing.push(folder.id);
        else folderIdsByAsset.set(assetId, [folder.id]);
      }
    }

    // A folder filter that names a folder this scope cannot see resolves to
    // "nothing", not to "everything" — a fail-open here would leak a private
    // folder's contents to the lane that isn't allowed to browse it.
    let folderAssetIds: string[] | null = null;
    if (input.folderId) {
      const folder = folders.find((candidate) => candidate.id === input.folderId);
      folderAssetIds = folder ? folder.assetIds : [];
      if (folderAssetIds.length === 0) {
        return { ...empty, folders, talents, portfolioAssetIds };
      }
    }

    const filterInput = {
      tenantId,
      approvalState,
      kind,
      ownership,
      search,
      purpose: input.purpose ?? null,
      variantKinds: input.variantKinds ?? null,
      ownerLane,
      assetIds: input.assetIds ?? null,
      // Talent scope owns `owner_talent_profile_id` through `talentScopeIds`
      // below; letting a second predicate at the same column in would be two
      // rules for one thing. Staff-only filter, staff-only lane.
      talentProfileIds: scope === "tenant" ? input.talentProfileIds ?? null : null,
      folderAssetIds,
      excludedTalentIds,
      talentScopeIds: scope === "talent" ? portfolioAssetIds : null,
      talentProfileId,
    };

    const [totalCount, pendingCount] = await Promise.all([
      countMatching(supabase, filterInput),
      approvalState === "pending"
        ? Promise.resolve(0)
        : countMatching(supabase, { ...filterInput, approvalState: "pending" }),
    ]);

    const page = await fetchPage({
      supabase,
      filterInput,
      cursor: orderBy === "created_at" ? input.cursor ?? null : null,
      limit,
      orderBy,
    });

    const items = page.rows.map((row) =>
      rowToPhoto(supabase, row.row, {
        tenantId,
        folderIds: folderIdsByAsset.get(row.row.id) ?? [],
        assetKind: row.kind,
      }),
    );

    return {
      items,
      folders,
      talents,
      nextCursor: page.nextCursor,
      totalCount,
      pendingCount,
      portfolioAssetIds:
        scope === "talent"
          ? portfolioAssetIds.filter((id) => items.some((item) => item.id === id))
          : [],
      errored: false,
    };
  } catch {
    return { ...empty, errored: true };
  }
}

type FilterInput = Parameters<typeof applyFilters>[1];

async function countMatching(
  supabase: SupabaseClient,
  filterInput: FilterInput,
): Promise<number> {
  const build = (columns: string) =>
    applyFilters(
      supabase
        .from("media_assets")
        .select(columns, { count: "exact", head: true }) as unknown as Filterable,
      filterInput,
    ) as unknown as PromiseLike<{ count: number | null; error: unknown }>;

  const primary = await build("id, asset_kind");
  if (!primary.error) return primary.count ?? 0;
  const fallback = await build("id");
  return fallback.error ? 0 : fallback.count ?? 0;
}

/**
 * Fetch one page, topping up until it is full. The in-memory kind pass can
 * drop rows the SQL superset let through, and a page that comes back short
 * would make an infinite-scroll list look finished when it is not.
 */
async function fetchPage(input: {
  supabase: SupabaseClient;
  filterInput: FilterInput;
  cursor: string | null;
  limit: number;
  orderBy: "created_at" | "sort_order";
}): Promise<{
  rows: Array<{ row: LibraryRow; kind: "image" | "video" | "document" }>;
  nextCursor: string | null;
}> {
  const kept: Array<{ row: LibraryRow; kind: "image" | "video" | "document" }> = [];
  let cursor = decodeMediaCursor(input.cursor);
  // Bounded so a library that is entirely unclassifiable cannot spin.
  const MAX_ROUNDS = 12;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const batchSize = Math.min(
      MEDIA_LIBRARY_MAX_PAGE_SIZE,
      // Ask for one more than needed so a full batch proves there is a next page.
      Math.max(input.limit + 1, (input.limit - kept.length) * 2),
    );

    const build = (columns: string) => {
      let q = applyFilters(
        input.supabase.from("media_assets").select(columns) as unknown as Filterable,
        input.filterInput,
      );
      if (cursor) {
        q = q.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }
      const ordered = q as unknown as {
        order: (
          column: string,
          options: { ascending: boolean; nullsFirst?: boolean },
        ) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> };
      };
      if (input.orderBy === "sort_order") {
        return ordered
          .order("sort_order", { ascending: true, nullsFirst: false })
          .limit(batchSize);
      }
      return (
        ordered.order("created_at", { ascending: false }) as unknown as {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> };
        }
      )
        .order("id", { ascending: false })
        .limit(batchSize);
    };

    let result = await build(EXTENDED_COLUMNS);
    if (result.error) result = await build(DEGRADED_COLUMNS);
    if (result.error || !result.data) break;

    const batch = result.data as unknown as LibraryRow[];
    if (batch.length === 0) break;

    for (const row of batch) {
      // ONE kind truth, including the sanitized-SVG rule. See the module doc.
      const resolved = resolveAssetKind(row);
      if (resolved === null) continue;
      if (input.filterInput.kind !== "all" && resolved !== input.filterInput.kind) {
        continue;
      }
      if (!isSafeMediaUrl(row.public_url) && !row.storage_path) continue;
      kept.push({ row, kind: resolved });
      if (kept.length > input.limit) break;
    }

    if (kept.length > input.limit) break;
    // A short batch means the table is exhausted; nothing left to top up with.
    if (batch.length < batchSize) break;
    if (input.orderBy !== "created_at") break;
    const tail = batch[batch.length - 1];
    cursor = { createdAt: tail.created_at, id: tail.id };
  }

  // `kept` holds at most limit+1: the extra row is the proof that a next page
  // exists, and it is dropped rather than shown.
  const hasMore = kept.length > input.limit;
  const rows = hasMore ? kept.slice(0, input.limit) : kept;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last && input.orderBy === "created_at"
      ? encodeMediaCursor({ createdAt: last.row.created_at, id: last.row.id })
      : null;

  return { rows, nextCursor };
}
