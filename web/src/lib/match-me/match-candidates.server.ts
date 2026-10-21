import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CATALOG_PROFILE_COLUMNS } from "@/lib/offerings/business-catalog";

import { shapeCandidates, type CandidateOfferRow, type CandidateProfileRow, type CandidateReviewRow } from "./candidates";
import type { MatchCandidate } from "./rules";

const ROSTER_LIMIT = 500;

/** Candidates for one workspace: its ACTIVE roster only. A failed read yields no candidates (nobody is offered a job by accident). */
export async function loadMatchCandidates(tenantId: string): Promise<MatchCandidate[]> {
  const admin = createServiceRoleClient();
  if (!admin || !tenantId) return [];
  const roster = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(ROSTER_LIMIT);
  if (roster.error) {
    logServerError("matchMe.candidates.roster", roster.error);
    return [];
  }
  const ids = (roster.data ?? []).map((r) => (r as { talent_profile_id: string }).talent_profile_id);
  if (ids.length === 0) return [];
  const [profiles, reviews, offers] = await Promise.all([
    admin.from("talent_profiles").select(`${CATALOG_PROFILE_COLUMNS}, user_id, home_city_text`).in("id", ids),
    admin.from("talent_reviews").select("talent_profile_id, rating, status").in("talent_profile_id", ids).eq("status", "published").limit(5000),
    admin.from("match_request_recipients").select("talent_profile_id, offered_at").in("talent_profile_id", ids).order("offered_at", { ascending: false }).limit(5000),
  ]);
  if (profiles.error) logServerError("matchMe.candidates.profiles", profiles.error);
  if (reviews.error) logServerError("matchMe.candidates.reviews", reviews.error);
  if (offers.error) logServerError("matchMe.candidates.offers", offers.error);
  if (profiles.error) return [];
  return shapeCandidates({
    profiles: (profiles.data ?? []) as unknown as CandidateProfileRow[],
    reviews: reviews.error ? [] : ((reviews.data ?? []) as unknown as CandidateReviewRow[]),
    offers: offers.error ? [] : ((offers.data ?? []) as unknown as CandidateOfferRow[]),
  });
}
