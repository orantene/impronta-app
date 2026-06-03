/**
 * Public read helpers for client→talent reviews.
 *
 * Plain server module (NOT "use server") so public pages + server components
 * can import it directly. Returns published reviews + a rating summary for a
 * talent profile.
 *
 * - Reviews are read with the anon public client; RLS exposes only
 *   status='published' rows to the public.
 * - Client display names live on `public.profiles`, which is self-or-staff
 *   SELECT under RLS, so the anon client cannot read them. We resolve a
 *   PUBLIC-SAFE first-name/initial via the service-role client (read-only,
 *   never exposing more than a first name). If the service client is
 *   unavailable we degrade to null names — never an error, never a leak.
 *
 * NEW columns/tables (talent_reviews, talent_profiles.rating_avg/count) are
 * read via `.returns<T>()` because database.types.ts was not regenerated this
 * wave.
 */

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { TalentRatingSummary, TalentReview } from "./review-types";

type ReviewRow = {
  id: string;
  talent_profile_id: string;
  booking_id: string | null;
  client_user_id: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  created_at: string;
};

/**
 * Reduce a stored display/first name to a public-safe label: first token only.
 * "María González" → "María". Returns null for blank input.
 */
function publicFirstName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return first || null;
}

async function resolveClientFirstNames(
  clientUserIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(clientUserIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const svc = createServiceRoleClient();
  if (!svc) return out;

  try {
    const { data } = await svc
      .from("profiles")
      .select("id, display_name")
      .in("id", ids)
      .returns<{ id: string; display_name: string | null }[]>();
    for (const row of data ?? []) {
      out.set(row.id, publicFirstName(row.display_name));
    }
  } catch {
    // Degrade silently — names just render as null.
  }
  return out;
}

/**
 * Published reviews for a talent profile, newest first. Public-safe.
 */
export async function loadTalentReviews(
  talentProfileId: string,
  limit = 12,
): Promise<TalentReview[]> {
  if (!talentProfileId) return [];
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("talent_reviews")
    .select(
      "id, talent_profile_id, booking_id, client_user_id, rating, body, status, created_at",
    )
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReviewRow[]>();

  if (error || !data || data.length === 0) return [];

  const names = await resolveClientFirstNames(data.map((r) => r.client_user_id));

  return data.map((r) => ({
    id: r.id,
    talentProfileId: r.talent_profile_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    clientName: names.get(r.client_user_id) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Average + count for a talent profile. Prefers the denormalized
 * talent_profiles.rating_avg / rating_count maintained by the AFTER trigger;
 * falls back to an aggregate over published reviews when those columns aren't
 * populated (e.g. pre-backfill). Returns { average: 0, count: 0 } when there
 * are no published reviews.
 */
export async function loadTalentRatingSummary(
  talentProfileId: string,
): Promise<TalentRatingSummary> {
  const empty: TalentRatingSummary = { average: 0, count: 0 };
  if (!talentProfileId) return empty;
  const supabase = createPublicSupabaseClient();
  if (!supabase) return empty;

  // Fast path — denormalized cache columns.
  const { data: profileRow } = await supabase
    .from("talent_profiles")
    .select("rating_avg, rating_count")
    .eq("id", talentProfileId)
    .returns<{ rating_avg: number | null; rating_count: number | null }[]>()
    .maybeSingle();

  const cachedCount = profileRow?.rating_count ?? null;
  if (typeof cachedCount === "number" && cachedCount > 0) {
    const avg = Number(profileRow?.rating_avg ?? 0);
    return {
      average: Number.isFinite(avg) ? Math.round(avg * 10) / 10 : 0,
      count: cachedCount,
    };
  }
  if (cachedCount === 0) return empty;

  // Fallback — aggregate published rows directly.
  const { data, error } = await supabase
    .from("talent_reviews")
    .select("rating")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .returns<{ rating: number }[]>();

  if (error || !data || data.length === 0) return empty;
  const sum = data.reduce((acc, r) => acc + (r.rating || 0), 0);
  const average = Math.round((sum / data.length) * 10) / 10;
  return { average, count: data.length };
}
