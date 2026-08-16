/**
 * library-wire.ts — the JSON shape `/api/admin/media/library` and
 * `/api/talent/media/library` put on the wire, and the one type the client
 * media library reads.
 *
 * It is a strict SUPERSET of the legacy `MediaLibraryItem` those routes used
 * to return. Every field the old pickers read is still there, spelled the same
 * way (`publicUrl`, not the bridge's `url`), so no existing consumer — the
 * inline editor's asset resolve, BrandTab's `?id=` logo lookup, the builder
 * template thumbnail cell — has to change. The additions are the columns the
 * workspace Media page always had and the pickers never did: approval state,
 * original filename, note, ownership and provenance.
 *
 * Keeping the wire shape stable while the SERVER's item type changed to
 * `WorkspaceMediaPhoto` is the whole reason this mapper exists in one place
 * rather than being inlined in two routes that would then drift.
 */

import type {
  MediaLibraryAssetKind,
  MediaLibraryTalentOption,
  WorkspaceMediaFolder,
  WorkspaceMediaPhoto,
} from "./library-item";
import type { MediaOwnershipKind } from "./ownership";

export type MediaLibraryWireItem = {
  id: string;
  tenantId: string;
  ownerTalentProfileId: string | null;
  variantKind: string;
  assetKind: MediaLibraryAssetKind;
  storagePath: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mime: string | null;
  alt: string | null;
  tags: string[];
  createdAt: string;
  sourceHint: string | null;
  folderIds: string[];

  // ── Added by the library unification (2026-08-16) ────────────────────────
  approvalState: "approved" | "pending" | "rejected";
  originalFilename: string | null;
  note: string | null;
  ownershipKind: MediaOwnershipKind;
  ownedByThisWorkspace: boolean;
  /** Talent display name, or "Brand & site" for workspace-owned imagery. */
  talentName: string;
  isWorkspaceAsset: boolean;
  purpose: string | null;
  uploadedByUserId: string | null;
  /** True when this asset carries a per-image watermark override. */
  hasWatermarkOverride: boolean;
};

export type MediaLibraryWireFolder = {
  id: string;
  name: string;
  color: string | null;
  assetIds: string[];
  isPrivate: boolean;
  isCollection: boolean;
  shootDate: string | null;
  /** Total assets in the folder, so a chip can show a count without the ids. */
  assetCount: number;
};

/**
 * A row of the "filter by talent" select. Already display-resolved server-side
 * (the client must never re-derive a name from first/last, or the picker and
 * the tile caption drift apart), so it goes on the wire as-is.
 */
export type MediaLibraryWireTalent = MediaLibraryTalentOption;

/** The full GET response both library routes return. */
export type MediaLibraryWireResponse = {
  ok: true;
  items: MediaLibraryWireItem[];
  folders: MediaLibraryWireFolder[];
  /** Staff lane only — see `MediaLibraryQueryResult.talents`. */
  talents?: MediaLibraryWireTalent[];
  nextCursor: string | null;
  totalCount: number;
  pendingCount: number;
  /** Talent scope only. */
  portfolioAssetIds?: string[];
  /** Talent scope only — assets the two-key rule will not let this talent use. */
  locked?: Array<{
    assetId: string;
    reason: "owned_by_workspace" | "master_profile_off" | null;
    ownerName: string | null;
  }>;
};

function sourceHintOf(metadata: Record<string, unknown>): string | null {
  if (typeof metadata.source === "string") return metadata.source;
  if (typeof metadata.seeded_by === "string") return metadata.seeded_by;
  return null;
}

export function toMediaLibraryWireItem(
  photo: WorkspaceMediaPhoto,
  tenantId: string,
): MediaLibraryWireItem {
  return {
    id: photo.id,
    tenantId,
    ownerTalentProfileId: photo.talentProfileId || null,
    variantKind: photo.variantKind,
    assetKind: photo.assetKind,
    storagePath: photo.storagePath,
    publicUrl: photo.url,
    width: photo.width,
    height: photo.height,
    fileSize: photo.fileSizeBytes,
    mime: photo.mimeType,
    alt: photo.alt,
    tags: photo.tags,
    createdAt: photo.createdAt,
    sourceHint: sourceHintOf(photo.metadata),
    folderIds: photo.folderIds,
    approvalState: photo.approvalState,
    originalFilename: photo.originalFilename,
    note: photo.note,
    ownershipKind: photo.ownershipKind,
    ownedByThisWorkspace: photo.ownedByThisWorkspace,
    talentName: photo.talentName,
    isWorkspaceAsset: photo.isWorkspaceAsset === true,
    purpose: photo.purpose ?? null,
    uploadedByUserId: photo.uploadedByUserId,
    hasWatermarkOverride: photo.hasOverride,
  };
}

export function toMediaLibraryWireFolder(
  folder: WorkspaceMediaFolder,
): MediaLibraryWireFolder {
  return {
    id: folder.id,
    name: folder.name,
    color: folder.color,
    assetIds: folder.assetIds,
    isPrivate: folder.isPrivate,
    isCollection: folder.isCollection,
    shootDate: folder.shootDate,
    assetCount: folder.assetIds.length,
  };
}
