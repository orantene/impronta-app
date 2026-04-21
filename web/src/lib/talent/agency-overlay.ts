/**
 * Phase 5/6 M3 — agency talent overlay read + presentation helpers.
 *
 * `/t/[profileCode]` renders two logical views off the same route: the
 * canonical view on the app host (`freelancer` surface) and the agency-
 * overlay view on an agency storefront host (`agency` surface). This module
 * is the single place overlay data is loaded and the single place it is
 * composed onto the canonical presentation.
 *
 * Gate 3 invariant (§11.3, L7, L39): overlay fields must never appear on
 * non-agency surfaces. `composeTalentPresentation` enforces this by
 * ignoring the overlay argument whenever `surface !== "agency"` — a caller
 * can accidentally pass an overlay through and the pure helper still
 * returns the canonical values. RLS enforces the same rule on the read
 * path (`agency_talent_overlays_public_select` requires a site-visible
 * roster row in the overlay's own tenant), so any cross-tenant or
 * cross-surface leak has to defeat both layers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgencyOverlayFields,
  TalentSurface,
} from "./visibility";

/**
 * Minimal media-row shape used to build a cover URL. Matches the columns
 * already selected in `/t/[profileCode]/page.tsx`'s media query.
 */
export interface OverlayCoverMedia {
  id: string;
  bucket_id: string | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Raw overlay row for the caller to assemble. `cover_media_asset_id` is
 * returned so the page can fetch the cover media row if it isn't already
 * in the canonical media set.
 */
export interface AgencyTalentOverlayRow extends AgencyOverlayFields {
  cover_media_asset_id: string | null;
}

/**
 * Load the overlay row for the given (tenantId, talentProfileId). Returns
 * `null` when no overlay exists or when RLS rejects the read (which happens
 * whenever the roster row isn't site-visible/featured — by design).
 *
 * Always scope both `tenant_id` AND `talent_profile_id` in the predicate so
 * the query is single-row and the tenant boundary is explicit in code, not
 * only in the policy.
 */
export async function loadAgencyTalentOverlay(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<AgencyTalentOverlayRow | null> {
  const { data, error } = await supabase
    .from("agency_talent_overlays")
    .select(
      "display_headline, local_bio, local_tags, cover_media_asset_id",
    )
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    display_headline: data.display_headline ?? null,
    local_bio: data.local_bio ?? null,
    local_tags: Array.isArray(data.local_tags) ? data.local_tags : [],
    cover_media_asset_id: data.cover_media_asset_id ?? null,
  };
}

/**
 * Load one `media_assets` row for the overlay's cover. Returns `null` when
 * the row doesn't exist, isn't approved, or has been soft-deleted — the
 * caller keeps the canonical banner in that case.
 */
export async function loadOverlayCoverMedia(
  supabase: SupabaseClient,
  mediaAssetId: string,
): Promise<OverlayCoverMedia | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, bucket_id, storage_path, width, height")
    .eq("id", mediaAssetId)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as OverlayCoverMedia;
}

// ---------------------------------------------------------------------------
// Pure presentation composition (unit-testable, no DB access)
// ---------------------------------------------------------------------------

export interface CanonicalPresentation {
  name: string;
  bio: string;
  bannerUrl: string | null;
}

export interface PresentationResult extends CanonicalPresentation {
  /** True when an agency overlay substitution was applied to any field. */
  overlayApplied: boolean;
}

/**
 * Merge overlay fields onto canonical presentation, gated by surface.
 *
 * Rules:
 *   - `surface !== "agency"` → overlay is ignored wholesale. Canonical is
 *     returned verbatim. This is the Gate 3 enforcement point in the view
 *     layer; pair with the DB-layer RLS and the serializer in visibility.ts.
 *   - `surface === "agency"` with no overlay row → canonical is returned.
 *   - `surface === "agency"` with an overlay → each non-empty overlay field
 *     substitutes the canonical value:
 *       * `display_headline` replaces `name` only when a non-blank string.
 *       * `local_bio` replaces `bio` only when a non-blank string.
 *       * `overlayBannerUrl` replaces `bannerUrl` when provided (the caller
 *         has already resolved overlay.cover_media_asset_id → URL).
 *     A null/blank overlay field never blanks the canonical — the canonical
 *     is the fallback by design.
 */
export function composeTalentPresentation(args: {
  surface: TalentSurface;
  canonical: CanonicalPresentation;
  overlay: AgencyOverlayFields | null;
  overlayBannerUrl?: string | null;
}): PresentationResult {
  const { surface, canonical, overlay, overlayBannerUrl } = args;
  if (surface !== "agency" || !overlay) {
    return { ...canonical, overlayApplied: false };
  }
  const headline = overlay.display_headline?.trim();
  const localBio = overlay.local_bio?.trim();
  const overlayBanner = overlayBannerUrl?.trim();
  const resolvedName = headline && headline.length > 0 ? headline : canonical.name;
  const resolvedBio = localBio && localBio.length > 0 ? localBio : canonical.bio;
  const resolvedBanner =
    overlayBanner && overlayBanner.length > 0
      ? overlayBanner
      : canonical.bannerUrl;
  const overlayApplied =
    resolvedName !== canonical.name ||
    resolvedBio !== canonical.bio ||
    resolvedBanner !== canonical.bannerUrl;
  return {
    name: resolvedName,
    bio: resolvedBio,
    bannerUrl: resolvedBanner,
    overlayApplied,
  };
}
