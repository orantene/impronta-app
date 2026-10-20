/**
 * Server loader for the services widget's presentation on a TALENT site
 * (TUL-1272 #3). Returns undefined while SERVICE_PRESENTATION_RESOLVER_ENABLED
 * is off, so the widget keeps today's links (and no extra query runs).
 *
 * Every read degrades: a failed trade read means "no trade default", a failed
 * FAQ or reviews read means the quick view simply omits that section.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { servicePresentationResolverEnabled } from "./flag";
import { presentationEntitlementsForTalentPlan } from "./talent-entitlements";
import type { ServicePresentationSource } from "./catalog-presentation";
import { SERVICE_REVIEWS_MAX, shownServiceReviews } from "@/lib/talent-site/service-page-reviews";

type Db = Pick<SupabaseClient, "from">;

type TaxonomyRow = { taxonomy_terms?: { slug?: unknown; kind?: unknown } | Array<{ slug?: unknown; kind?: unknown }> | null };

/** The primary talent-type slug among a profile's primary taxonomy rows. */
export function primaryTalentTypeSlug(rows: readonly TaxonomyRow[] | null | undefined): string | null {
  for (const row of rows ?? []) {
    const terms = Array.isArray(row.taxonomy_terms) ? row.taxonomy_terms : row.taxonomy_terms ? [row.taxonomy_terms] : [];
    for (const t of terms) {
      if (t.kind === "talent_type" && typeof t.slug === "string" && t.slug.trim()) return t.slug.trim().toLowerCase();
    }
  }
  return null;
}

export type TalentPresentationDeps = {
  db: Db | null;
  enabled?: boolean;
  loadFaq: (talentProfileId: string, locale: string) => Promise<Array<{ question: string; answer: string }>>;
  loadReviews: (talentProfileId: string) => Promise<{ talentReviews: NonNullable<ServicePresentationSource["reviews"]>["reviews"] }>;
  loadRating: (talentProfileId: string) => Promise<{ average: number; count: number }>;
};

/**
 * Call ONLY for a published talent site (the caller skips drafts, previews and the
 * builder), so those renders run none of these reads.
 */
export async function loadTalentServicePresentation(
  talentProfileId: string,
  locale: string,
  deps: TalentPresentationDeps,
): Promise<ServicePresentationSource | undefined> {
  if (!(deps.enabled ?? servicePresentationResolverEnabled())) return undefined;
  const planRead = async (): Promise<string | null> => {
    if (!deps.db) return null;
    try {
      const { data, error } = await deps.db.from("talent_profiles").select("talent_plan_key").eq("id", talentProfileId).maybeSingle();
      if (error) {
        logServerError("services-presentation/plan", error);
        return null;
      }
      return (data as { talent_plan_key?: string | null } | null)?.talent_plan_key ?? null;
    } catch (error) {
      logServerError("services-presentation/plan", error);
      return null;
    }
  };
  const tradeRead = async (): Promise<string | null> => {
    if (!deps.db) return null;
    try {
      const { data, error } = await deps.db
        .from("talent_profile_taxonomy")
        .select("taxonomy_terms(slug, kind)")
        .eq("talent_profile_id", talentProfileId)
        .eq("is_primary", true);
      if (error) {
        logServerError("services-presentation/tradeSlug", error);
        return null;
      }
      return primaryTalentTypeSlug(data as TaxonomyRow[] | null);
    } catch (error) {
      logServerError("services-presentation/tradeSlug", error);
      return null;
    }
  };
  const [planKey, tradeSlug, talentFaq, reviewRows, rating] = await Promise.all([
    planRead(),
    tradeRead(),
    deps.loadFaq(talentProfileId, locale).catch(() => []),
    deps.loadReviews(talentProfileId).catch(() => ({ talentReviews: [] })),
    deps.loadRating(talentProfileId).catch(() => ({ average: 0, count: 0 })),
  ]);
  return {
    tradeSlug,
    allowedModes: presentationEntitlementsForTalentPlan(planKey).allowedModes,
    talentFaq,
    reviews: shownServiceReviews({ ...rating, reviews: reviewRows.talentReviews.slice(0, SERVICE_REVIEWS_MAX + 2) }),
  };
}
