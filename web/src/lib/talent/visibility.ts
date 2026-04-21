/**
 * Phase 5/6 M2 — canonical talent-visibility + serialization resolver.
 *
 * The public `/t/[profileCode]` surface renders on both the app host (canonical
 * global view) and agency hosts (agency-overlay view). Hub hosts 404 talent
 * pages entirely. This module is the single place that decides, given a
 * request surface + the loaded talent row(s), whether the talent is visible
 * and which overlays (if any) are in scope.
 *
 * The resolver is a PURE function. It consumes already-loaded data and
 * returns a decision. It does no database work — callers load the talent,
 * optional roster row, and optional overlay row from Supabase first. This
 * makes the visibility contract unit-testable without a live database and
 * makes cross-surface serialization rules explicit in code (Gate 3 partial,
 * charter §22.9).
 *
 * Ref: docs/saas/phase-5-6-org-network-extension.md §11 (visibility / exposure
 * resolver signature) + §16 M2 acceptance criteria.
 */

/**
 * Which surface is serving the request. Maps 1:1 to the host-context kinds:
 *   - `freelancer` → app host (canonical, no agency coupling)
 *   - `agency`     → agency storefront host (scoped to `orgId`)
 *   - `hub`        → hub host (cross-agency discovery)
 *   - `admin`      → authenticated admin surface (already authorised upstream)
 */
export type TalentSurface = "freelancer" | "agency" | "hub" | "admin";

/**
 * Minimal shape of a `talent_profiles` row the resolver needs. Callers pass
 * the subset they've loaded — the resolver does not reach into other columns.
 */
export interface TalentVisibilityProfile {
  workflow_status: string | null;
  visibility: string | null;
  deleted_at: string | null;
}

/**
 * Minimal shape of an `agency_talent_roster` row. Required for `agency` and
 * `hub` surfaces — omit for `freelancer`/`admin`.
 */
export interface TalentVisibilityRosterRow {
  tenant_id: string;
  status: string;
  agency_visibility: string;
  hub_visibility_status: string;
}

export interface TalentVisibilityInput {
  profile: TalentVisibilityProfile;
  roster?: TalentVisibilityRosterRow | null;
}

export type TalentVisibilityResult =
  | { visible: false; reason: string }
  | {
      visible: true;
      view: TalentSurface;
      /**
       * True when agency overlays should be read and rendered. Only set on the
       * agency surface. Never true on freelancer/hub to preserve Gate 3
       * cross-surface-leakage invariants (§11.3).
       */
      overlaysAllowed: boolean;
    };

/**
 * Baseline freelancer-surface rules: a talent is publicly visible on the app
 * host iff their profile itself is approved + public + not soft-deleted.
 * Agency and hub surfaces layer their own roster checks on top of this rule.
 */
function freelancerRulesPass(p: TalentVisibilityProfile): boolean {
  if (p.deleted_at !== null) return false;
  if (p.workflow_status !== "approved") return false;
  if (p.visibility !== "public") return false;
  return true;
}

/**
 * Decide whether a talent is visible on the requested surface.
 *
 * Contract summary (§11.2):
 *
 *   freelancer (app host /t/[code])
 *     visible iff workflow_status='approved' AND visibility='public' AND deleted_at IS NULL.
 *
 *   agency (storefront)
 *     freelancer rules AND roster row where
 *       tenant_id=orgId, status='active',
 *       agency_visibility IN ('site_visible','featured').
 *
 *   hub
 *     freelancer rules AND roster row where
 *       tenant_id=orgId, hub_visibility_status='approved'.
 *
 *   admin
 *     caller is responsible for authorising (is_staff_of_tenant / super_admin);
 *     this resolver does not second-guess. Always returns visible=true.
 */
export function resolveTalentVisibility(
  input: TalentVisibilityInput,
  surface: TalentSurface,
  orgId?: string,
): TalentVisibilityResult {
  if (surface === "admin") {
    return { visible: true, view: "admin", overlaysAllowed: true };
  }

  if (!freelancerRulesPass(input.profile)) {
    return { visible: false, reason: "profile-not-public" };
  }

  if (surface === "freelancer") {
    return { visible: true, view: "freelancer", overlaysAllowed: false };
  }

  if (surface === "agency") {
    if (!orgId) {
      return { visible: false, reason: "agency-surface-requires-orgid" };
    }
    const r = input.roster;
    if (!r) return { visible: false, reason: "no-roster-row" };
    if (r.tenant_id !== orgId) {
      return { visible: false, reason: "roster-tenant-mismatch" };
    }
    if (r.status !== "active") return { visible: false, reason: "roster-not-active" };
    if (
      r.agency_visibility !== "site_visible" &&
      r.agency_visibility !== "featured"
    ) {
      return { visible: false, reason: "roster-not-site-visible" };
    }
    return { visible: true, view: "agency", overlaysAllowed: true };
  }

  if (surface === "hub") {
    if (!orgId) {
      return { visible: false, reason: "hub-surface-requires-orgid" };
    }
    const r = input.roster;
    if (!r) return { visible: false, reason: "no-roster-row" };
    if (r.tenant_id !== orgId) {
      return { visible: false, reason: "roster-tenant-mismatch" };
    }
    if (r.hub_visibility_status !== "approved") {
      return { visible: false, reason: "hub-not-approved" };
    }
    return { visible: true, view: "hub", overlaysAllowed: false };
  }

  return { visible: false, reason: "unknown-surface" };
}

// ---------------------------------------------------------------------------
// Serialization boundary (Gate 3 — cross-surface leakage)
// ---------------------------------------------------------------------------

/**
 * Canonical talent fields present on every surface. Overlay columns are
 * DELIBERATELY not in this list — they are per-agency presentation only and
 * must never appear on freelancer or hub surfaces (§11.3, L7, L39).
 */
export interface CanonicalTalentFields {
  id: string;
  profile_code: string;
  display_name: string | null;
  short_bio: string | null;
  bio_en: string | null;
}

/**
 * Overlay fields from `agency_talent_overlays`. These are rendered only on
 * the agency surface, scoped to the requesting tenant's overlay row.
 */
export interface AgencyOverlayFields {
  display_headline: string | null;
  local_bio: string | null;
  local_tags: string[];
}

export interface SerializedTalent {
  surface: TalentSurface;
  canonical: CanonicalTalentFields;
  overlays: AgencyOverlayFields | null;
}

/**
 * Serialize a talent for the given surface. The overlay argument is
 * IGNORED on freelancer/hub/admin surfaces — only the agency surface
 * carries an overlay. This function is the enforcement point for Gate 3:
 * if a future refactor accidentally leaks overlay data into a non-agency
 * surface, the serializer returns `overlays: null` regardless.
 */
export function serializeTalentForSurface(args: {
  surface: TalentSurface;
  canonical: CanonicalTalentFields;
  overlay?: AgencyOverlayFields | null;
}): SerializedTalent {
  const { surface, canonical } = args;
  const overlaysAllowed = surface === "agency" || surface === "admin";
  return {
    surface,
    canonical,
    overlays: overlaysAllowed ? args.overlay ?? null : null,
  };
}
