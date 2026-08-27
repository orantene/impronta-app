import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { talentPlanToTier, type TalentPlanTier } from "@/lib/access/talent-membership";
import {
  emptyTalentPageAnalytics,
  groupTalentPageAnalytics,
  type TalentInquiryRow,
  type TalentPageAnalyticsData,
  type TalentViewRow,
} from "@/lib/analytics/talent-analytics-group";

/**
 * loadTalentPageAnalytics — the READ PATH behind the Pro/Portfolio "page
 * analytics" entitlement.
 *
 * Collection already worked: every public talent surface (`/t/[profileCode]`,
 * its freeform sub-pages, the platform-host Max site, and the directory quick-
 * open modal) mounts `SitePageViewAnalytics`, which emits `view_talent_profile`
 * with `talent_id` — and the ingest route promotes that into the indexed
 * `analytics_events.talent_id` COLUMN. Nothing read it back for the talent.
 * This is that reader.
 *
 * It deliberately follows `loadWebsiteAnalytics` / `loadWebsiteConversionMetrics`
 * (lib/analytics/website-analytics.ts): one bounded 30-day fetch per source, the
 * 7d and prior-7d buckets sliced in memory, a hard row cap, pure grouping in a
 * sibling `*-group` module, and best-effort failure (zeros, never a throw).
 * There is exactly ONE analytics stack in this codebase and this joins it.
 *
 * ── AUTHORIZATION ───────────────────────────────────────────────────────────
 * The talent id is NEVER the only scope. Callers must pass the session user id,
 * and the loader re-derives the talent profile from `talent_profiles.user_id`
 * itself, then refuses if the caller-supplied id is not that profile. A caller
 * who guesses another talent's uuid gets `null`, not their numbers. (A
 * caller-id-only scope is precisely the bug class that has shipped here before
 * — see the tenant_id predicate incident.)
 *
 * ── ENTITLEMENT ─────────────────────────────────────────────────────────────
 * Analytics are a Pro ($9) / Portfolio benefit. A Free talent gets `null` from
 * the loader — the surface then renders the upsell, NOT a grid of zeros that
 * reads as "nobody looked at you".
 */

/** Sources that could not be computed — surfaced so the UI can say so. */
export type TalentPageAnalyticsResult = {
  data: TalentPageAnalyticsData;
  /**
   * Marks that the events table returned nothing at all for this talent. Not
   * an error: a profile published yesterday genuinely has no history. The UI
   * uses it to say "no views yet" instead of implying a measured zero trend.
   */
  hasAnyViews: boolean;
};

/** Cap each scan so a high-traffic profile cannot blow the egress budget. */
const TALENT_SCAN_LIMIT = 5000;

/** Inquiry participant rows in these states never represented a real lead. */
const NON_COUNTABLE_INQUIRY_STATUSES = [
  "draft",
  "rejected",
  "expired",
  "closed_lost",
] as const;

/** Trailing-window start, snapped to the start of the UTC day. */
function windowStartIso(days: number): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

/** Tiers entitled to page analytics: Pro and Portfolio (Max), never Free. */
export function talentTierHasPageAnalytics(tier: TalentPlanTier): boolean {
  return tier === "pro" || tier === "max";
}

type OwnedProfile = { id: string; tier: TalentPlanTier };

/**
 * Resolve the signed-in user's OWN talent profile and confirm it is the one the
 * caller asked about. Returns null when the user has no talent profile, or when
 * `expectedTalentProfileId` is somebody else's.
 */
async function resolveOwnedProfile(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  expectedTalentProfileId: string | null,
): Promise<OwnedProfile | null> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, talent_plan_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { id: string; talent_plan_key: string | null };
  if (expectedTalentProfileId && expectedTalentProfileId !== row.id) return null;

  return { id: row.id, tier: talentPlanToTier(row.talent_plan_key) };
}

/**
 * Load the signed-in talent's own page analytics.
 *
 * @param userId  The SESSION user id — the real scope. Required.
 * @param talentProfileId  Optional cross-check: when supplied it must be the
 *   session user's own profile, otherwise the call returns null. It narrows,
 *   it never widens.
 *
 * Returns `null` when the user has no talent profile, when the id does not
 * belong to them, or when their tier does not include analytics.
 */
export async function loadTalentPageAnalytics(
  userId: string,
  talentProfileId?: string | null,
): Promise<TalentPageAnalyticsResult | null> {
  if (!userId) return null;

  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  try {
    const owned = await resolveOwnedProfile(supabase, userId, talentProfileId ?? null);
    if (!owned) return null;
    if (!talentTierHasPageAnalytics(owned.tier)) return null;

    const start30Iso = windowStartIso(30);
    const start14Iso = windowStartIso(14);
    const start7Iso = windowStartIso(7);

    const [viewsRes, inquiriesRes] = await Promise.all([
      // `talent_id` is an indexed column (idx_analytics_events_talent), so this
      // is an index scan, not a jsonb payload filter.
      supabase
        .from("analytics_events")
        .select("created_at, session_id")
        .eq("talent_id", owned.id)
        .eq("name", PRODUCT_ANALYTICS_EVENTS.view_talent_profile)
        .gte("created_at", start30Iso)
        .order("created_at", { ascending: false })
        .limit(TALENT_SCAN_LIMIT)
        .returns<TalentViewRow[]>(),
      // Attribution: the talent is a named participant on the inquiry. Same
      // join the unified inbox uses (`inquiry_participants.talent_profile_id`
      // + role='talent'), so the tile and the inbox can never disagree.
      supabase
        .from("inquiry_participants")
        .select("inquiries!inner(created_at, status)")
        .eq("talent_profile_id", owned.id)
        .eq("role", "talent")
        .neq("status", "removed")
        .gte("inquiries.created_at", start30Iso)
        .limit(TALENT_SCAN_LIMIT),
    ]);

    const views30 = viewsRes.error ? [] : viewsRes.data ?? [];

    type ParticipantRow = {
      inquiries: { created_at: string; status: string | null } | null;
    };
    const inquiries30: TalentInquiryRow[] = inquiriesRes.error
      ? []
      : ((inquiriesRes.data ?? []) as unknown as ParticipantRow[])
          .map((r) => r.inquiries)
          .filter(
            (i): i is { created_at: string; status: string | null } =>
              i != null &&
              !(NON_COUNTABLE_INQUIRY_STATUSES as readonly string[]).includes(
                i.status ?? "",
              ),
          )
          .map((i) => ({ created_at: i.created_at }));

    return {
      data: groupTalentPageAnalytics({
        start7Iso,
        start14Iso,
        start30Iso,
        views30,
        inquiries30,
      }),
      hasAnyViews: views30.length > 0,
    };
  } catch {
    // Best-effort, exactly like the workspace loader: a failed analytics read
    // must never break the talent dashboard layout.
    return { data: emptyTalentPageAnalytics(), hasAnyViews: false };
  }
}
