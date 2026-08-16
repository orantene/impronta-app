/**
 * library-item.ts — the ONE item shape the media library speaks, everywhere.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Before the unification (2026-08-16) the product had two media libraries that
 * disagreed about what a media asset even *is*:
 *
 *   • the workspace Media page read `_data-bridge-media.ts` → `WorkspaceMediaPhoto`
 *     (ownership, watermark override, notes, provenance, 5000-row page), and
 *   • every builder picker read `listTenantMediaLibrary` → `MediaLibraryItem`
 *     (a hard 60-row cap, no search, no pagination, no ownership).
 *
 * With ~1,939 assets on the largest tenant that meant ~97% of the library was
 * unreachable from the builder, and the album/kind chips filtered *within* the
 * truncated 60 — so a real album routinely rendered "No images in this album".
 *
 * `WorkspaceMediaPhoto` won: it is the richer of the two and it is what the
 * page an operator already trusts is showing. This module holds it (plus the
 * folder shape and the query's filter vocabulary) as PURE types with no
 * `server-only` import and no Supabase import, so a client picker and a server
 * route can both name the same thing. `_data-bridge-media.ts` re-exports both
 * types so its existing importers keep working unchanged.
 */

import type { MediaOwnershipKind } from "./ownership";

/** MEDIA-1 discriminant, carried through the library unchanged. */
export type MediaLibraryAssetKind = "image" | "video" | "document";

export type WorkspaceMediaPhoto = {
  id: string;
  talentProfileId: string;
  talentName: string;
  /** Public URL resolved from bucket + storage_path. */
  url: string;
  thumbUrl: string;
  variantKind: string;
  approvalState: "approved" | "pending" | "rejected";
  /** True when a per-image override exists (distinct from workspace-default WM). */
  hasOverride: boolean;
  watermarkOverride: unknown | null;
  tags: string[];
  /** IDs of folders this asset belongs to. */
  folderIds: string[];
  /** Pixel dimensions when available. */
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  /** Free-text note stored in metadata.note. */
  note: string | null;
  metadata: Record<string, unknown>;
  /** When this photo is a derivative (crop, baked watermark), the parent
   *  asset's id. Used to enable "Revert to original" in the lightbox. */
  sourceMediaAssetId: string | null;
  createdAt: string;
  /** True for workspace-owned (non-talent) assets — brand & site imagery
   *  (purpose 'branding' / 'cms'). These have no talent linkage:
   *  talentProfileId is "" and talent-specific actions don't apply. */
  isWorkspaceAsset?: boolean;
  /** media_assets.purpose for workspace assets ('branding' | 'cms'). */
  purpose?: string;
  /**
   * Ownership truth (plan §5a/§6). Who controls this asset: the talent, a
   * workspace, or the platform. Drives the ownership chip on every tile.
   */
  ownershipKind: MediaOwnershipKind;
  /**
   * True when `ownership_kind='agency'` AND `owner_tenant_id` is the tenant
   * this page is loaded for. Resolved here so the client never needs a
   * tenant id to render "yours" vs "another workspace".
   */
  ownedByThisWorkspace: boolean;
  /** Provenance: the user who physically uploaded the bytes, when known. */
  uploadedByUserId: string | null;

  // ── Added by the library unification (2026-08-16) ────────────────────────
  // The three fields the pickers needed that the Media page never carried.
  // Adding them here rather than keeping a second item type is the whole
  // point of this module.
  /**
   * MEDIA-1 kind. Resolved by `resolveAssetKind` in
   * `lib/site-admin/media/assets.ts` — the ONE place that decides an SVG is
   * only an image once the sanitizer stamped it.
   */
  assetKind: MediaLibraryAssetKind;
  /** Bucket-relative object path. Document tiles read the extension off it. */
  storagePath: string;
  /** Alt text. Editable from the picker (staff scope only). */
  alt: string | null;
};

export type WorkspaceMediaFolder = {
  id: string;
  name: string;
  color: string | null;
  isPrivate: boolean;
  shareToken: string | null;
  shareExpiresAt: string | null;
  shareViewCount: number;
  assetIds: string[];
  createdAt: string;
  /** Phase 4 collections sugar — a folder that is also a per-shoot collection. */
  isCollection: boolean;
  /** ISO day the shoot happened, or null. Only meaningful when isCollection. */
  shootDate: string | null;
};

/**
 * One row of the "filter by talent" select (2026-08-16).
 *
 * This is the WORKSPACE's roster, not "every talent whose media is in the
 * library". The two are almost the same set and deliberately not identical: a
 * talent the workspace removed from its roster has their media excluded from
 * the library entirely (see `loadExcludedTalentIds`), and a profile the agency
 * created but never rostered can still own an asset whose tile shows their
 * name while they are absent from this list. Listing the roster is the version
 * an operator can reason about — "the people I represent" — and it is one
 * cheap query instead of a per-tenant DISTINCT over `media_assets`.
 */
export type MediaLibraryTalentOption = {
  id: string;
  /** Already resolved for display: display_name, else first+last, else "Unnamed". */
  name: string;
  /** Secondary line in the option row. Null when the profile has no code. */
  profileCode: string | null;
};

// ── Filter vocabulary ───────────────────────────────────────────────────────

/** Which library a caller is asking for. */
export type MediaLibraryScope = "tenant" | "talent";

export type MediaLibraryKindFilter = "all" | MediaLibraryAssetKind;

export type MediaLibraryOwnershipFilter =
  | "all"
  | "workspace"
  | "talent"
  | "platform";

export type MediaLibraryApprovalFilter = "approved" | "pending" | "any";

/**
 * Which rows the tenant lane is asking about. The workspace Media page reads
 * the two lanes separately (roster photos ordered by `sort_order`, brand & site
 * imagery ordered by recency) and this preserves that split without forking
 * the query.
 */
export type MediaLibraryOwnerLane = "all" | "talent-owned" | "workspace-owned";

/** Default page size. Was the hard ceiling; now it is only a page. */
export const MEDIA_LIBRARY_PAGE_SIZE = 60;

/** Hard ceiling on one page, so no caller can ask for the whole table by accident. */
export const MEDIA_LIBRARY_MAX_PAGE_SIZE = 5000;

// ── Keyset cursor ───────────────────────────────────────────────────────────
//
// `(created_at, id)` descending. `id` breaks ties so a page boundary that
// lands inside a batch of rows written in the same millisecond (bulk imports
// do exactly this) can neither skip nor repeat a row — which an offset/`range`
// pager silently does.

// The encoding is deliberately plain (no Buffer / atob) so the same module
// loads unchanged in a server route, a client hook, and a node test runner.

const CURSOR_SEPARATOR = "~";

export function encodeMediaCursor(input: {
  createdAt: string;
  id: string;
}): string {
  return encodeURIComponent(
    `${input.createdAt}${CURSOR_SEPARATOR}${input.id}`,
  );
}

export function decodeMediaCursor(
  cursor: string | null | undefined,
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(cursor);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(CURSOR_SEPARATOR);
  if (separator <= 0) return null;
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!createdAt || !id) return null;
  // A cursor arrives over the wire; treat it as untrusted input. Both halves
  // go straight into a PostgREST filter string, so anything that could break
  // out of one (comma, paren, quote) is rejected rather than escaped.
  if (/[,()"']/.test(createdAt) || /[,()"']/.test(id)) return null;
  return { createdAt, id };
}

/**
 * Strip the characters that would break out of a PostgREST filter expression.
 * Search text is user input and lands inside an `or(...)` list, where a comma
 * or a paren would be read as syntax rather than as data.
 */
export function sanitizeMediaSearch(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/[,()*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
