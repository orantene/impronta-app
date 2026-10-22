/**
 * TUL-1464: shape the roster into match candidates. Pure: the loader reads, this decides.
 * A candidate is a CLAIMED (has a user to accept), publicly listed professional on the
 * workspace's active roster. Zone = their home city; rating = average of PUBLISHED reviews
 * (null when none); rotation = when they were last offered a matched job.
 */
import { isPublicCatalogProfile, type CatalogProfileRow } from "@/lib/offerings/business-catalog";

import type { MatchCandidate } from "./rules";

export type CandidateProfileRow = CatalogProfileRow & { user_id: string | null; home_city_text: string | null };
export type CandidateReviewRow = { talent_profile_id: string; rating: number | null; status: string | null };
export type CandidateOfferRow = { talent_profile_id: string; offered_at: string };

export function shapeCandidates(input: {
  profiles: readonly CandidateProfileRow[];
  reviews: readonly CandidateReviewRow[];
  offers: readonly CandidateOfferRow[];
}): MatchCandidate[] {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of input.reviews) {
    if (r.status !== "published" || typeof r.rating !== "number" || !Number.isFinite(r.rating)) continue;
    const s = sums.get(r.talent_profile_id) ?? { sum: 0, n: 0 };
    s.sum += r.rating;
    s.n += 1;
    sums.set(r.talent_profile_id, s);
  }
  const lastOffered = new Map<string, string>();
  for (const o of input.offers) {
    const prev = lastOffered.get(o.talent_profile_id);
    if (!prev || o.offered_at > prev) lastOffered.set(o.talent_profile_id, o.offered_at);
  }
  return input.profiles
    .filter((p) => p.user_id && isPublicCatalogProfile(p))
    .map((p) => {
      const s = sums.get(p.id);
      return {
        id: p.id,
        zones: p.home_city_text?.trim() ? [p.home_city_text.trim()] : [],
        rating: s ? s.sum / s.n : null,
        available: true,
        lastOfferedAt: lastOffered.get(p.id) ?? null,
      };
    });
}
