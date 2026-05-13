import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Trust badge loaded from `talent_profile_trust_badges`.
 *
 * DB badge_kind values: identity | background_check | license | insurance |
 * social_account | media_authentic | agency_approved.
 *
 * The UI uses a different vocabulary (`TalentBadge["kind"]`); the mapper
 * `mapDbBadgeKindToUi` below produces the closest equivalent so badges
 * render correctly once verification touchpoints start writing to the table.
 */
export type LoadedTrustBadge = {
  talentProfileId: string;
  /** Mapped to UI vocabulary. */
  kind: "id-verified" | "age-verified" | "union" | "top-rated" | "tulala-featured" | "agency-verified" | "background-check";
  /** Display label. */
  label: string;
  /** Hover hint. */
  hint: string;
  /** verified_at ISO. Falls back to created_at when verified_at is null. */
  earnedAt: string;
};

function mapDbBadgeKindToUi(
  dbKind: string,
  scope: "platform" | "agency",
): LoadedTrustBadge["kind"] | null {
  switch (dbKind) {
    case "identity":
      return "id-verified";
    case "background_check":
      return "background-check";
    case "agency_approved":
      return "agency-verified";
    case "social_account":
      // Treat verified social accounts as "tulala-featured" (platform) or
      // "agency-verified" (agency) — closest semantic match in UI vocab.
      return scope === "platform" ? "tulala-featured" : "agency-verified";
    case "media_authentic":
      return "top-rated";
    case "license":
    case "insurance":
      return "union";
    default:
      return null;
  }
}

function labelForUiKind(kind: LoadedTrustBadge["kind"]): { label: string; hint: string } {
  switch (kind) {
    case "id-verified":
      return { label: "ID verified", hint: "Government-issued ID has been verified." };
    case "age-verified":
      return { label: "Age verified", hint: "Date of birth confirmed." };
    case "union":
      return { label: "Union", hint: "Verified union/license credentials." };
    case "top-rated":
      return { label: "Top rated", hint: "Verified portfolio of past work." };
    case "tulala-featured":
      return { label: "Tulala featured", hint: "Verified by Tulala." };
    case "agency-verified":
      return { label: "Agency verified", hint: "Verified by the represented agency." };
    case "background-check":
      return { label: "Background check", hint: "Background check completed." };
  }
}

/**
 * Load active (status='verified', non-expired) trust badges for a list of
 * talent profile ids. Returns an empty array when none exist or on error.
 * Multi-tenant safe: badges are scoped either platform-wide or per-tenant;
 * the caller filters by tenant where appropriate.
 */
export async function loadTrustBadgesForTalents(
  talentProfileIds: string[],
  tenantId: string,
): Promise<LoadedTrustBadge[]> {
  if (talentProfileIds.length === 0) return [];

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("talent_profile_trust_badges")
      .select(
        "talent_profile_id, badge_kind, scope, scope_tenant_id, verified_at, created_at, expires_at, status",
      )
      .in("talent_profile_id", talentProfileIds)
      .eq("status", "verified")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

    if (error) {
      logServerError("talent-trust-badges.load", error);
      return [];
    }

    const rows = (data ?? []) as Array<{
      talent_profile_id: string;
      badge_kind: string;
      scope: "platform" | "agency";
      scope_tenant_id: string | null;
      verified_at: string | null;
      created_at: string;
      expires_at: string | null;
      status: string;
    }>;

    const badges: LoadedTrustBadge[] = [];
    for (const r of rows) {
      // Skip agency-scoped badges from other tenants.
      if (r.scope === "agency" && r.scope_tenant_id !== tenantId) continue;
      const uiKind = mapDbBadgeKindToUi(r.badge_kind, r.scope);
      if (!uiKind) continue;
      const labels = labelForUiKind(uiKind);
      badges.push({
        talentProfileId: r.talent_profile_id,
        kind: uiKind,
        label: labels.label,
        hint: labels.hint,
        earnedAt: r.verified_at ?? r.created_at,
      });
    }
    return badges;
  } catch (err) {
    logServerError("talent-trust-badges.load", err);
    return [];
  }
}

/**
 * Group loaded badges by talent_profile_id for O(1) lookup in roster
 * enrichment.
 */
export function groupTrustBadgesByTalent(
  badges: LoadedTrustBadge[],
): Map<string, LoadedTrustBadge[]> {
  const map = new Map<string, LoadedTrustBadge[]>();
  for (const b of badges) {
    if (!map.has(b.talentProfileId)) map.set(b.talentProfileId, []);
    map.get(b.talentProfileId)!.push(b);
  }
  return map;
}
