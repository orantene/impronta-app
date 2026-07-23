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
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type {
  ClientReview,
  RatingSummary,
  ReviewMediaItem,
  TalentRatingSummary,
  TalentReview,
  Testimonial,
} from "./review-types";

type SupabaseLike = NonNullable<ReturnType<typeof createPublicSupabaseClient>>;

type ReviewMediaRow = {
  id: string;
  review_id: string;
  bucket_id: string | null;
  storage_path: string | null;
  sort_order: number | null;
};

/**
 * Batch-load approved photos for a set of published reviews, keyed by review_id
 * (STANDING v3 item 5). RLS exposes only approved, non-deleted media of
 * published reviews to the anon client, so the same public client the reviews
 * were read with is enough. Public URLs come from the public media-public
 * bucket. Best-effort: any failure yields an empty map (reviews still render).
 */
async function loadReviewMediaMap(
  supabase: SupabaseLike,
  reviewIds: string[],
): Promise<Map<string, ReviewMediaItem[]>> {
  const out = new Map<string, ReviewMediaItem[]>();
  const ids = Array.from(new Set(reviewIds.filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from("talent_review_media")
      .select("id, review_id, bucket_id, storage_path, sort_order")
      .in("review_id", ids)
      .is("deleted_at", null)
      .eq("approval_state", "approved")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<ReviewMediaRow[]>();
    if (error || !data) return out;
    for (const m of data) {
      if (!m.storage_path) continue;
      const bucket = m.bucket_id || "media-public";
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(m.storage_path);
      const url = pub?.publicUrl;
      if (!url) continue;
      const list = out.get(m.review_id) ?? [];
      list.push({ id: m.id, url });
      out.set(m.review_id, list);
    }
  } catch {
    // best-effort — reviews render without media
  }
  return out;
}

type ReviewRow = {
  id: string;
  talent_profile_id: string;
  booking_id: string | null;
  client_user_id: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  created_at: string;
  anon?: boolean | null;
  reply_body?: string | null;
  reply_at?: string | null;
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

async function resolveFirstNames(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
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

/** Back-compat alias kept for the W7 talent-review read path. */
async function resolveClientFirstNames(
  clientUserIds: string[],
): Promise<Map<string, string | null>> {
  return resolveFirstNames(clientUserIds);
}

/**
 * Published reviews for a talent profile, newest first. Public-safe.
 */
export async function loadTalentReviews(
  talentProfileId: string,
  limit = 12,
  offset = 0,
): Promise<TalentReview[]> {
  if (!talentProfileId) return [];
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  const from = Math.max(0, offset);
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("talent_reviews")
    .select(
      "id, talent_profile_id, booking_id, client_user_id, rating, body, status, created_at, anon, reply_body, reply_at",
    )
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<ReviewRow[]>();

  if (error || !data || data.length === 0) return [];

  const [names, mediaByReview] = await Promise.all([
    resolveClientFirstNames(data.map((r) => r.client_user_id)),
    loadReviewMediaMap(supabase, data.map((r) => r.id)),
  ]);

  return data.map((r) => ({
    id: r.id,
    talentProfileId: r.talent_profile_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    clientName: r.anon ? null : names.get(r.client_user_id) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
    replyBody: r.reply_body ?? null,
    replyAt: r.reply_at ?? null,
    media: mediaByReview.get(r.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Invited testimonials (walled off from verified reviews).
//
// Testimonials live in public.tenant_testimonials — quotes attested/imported by
// agency staff. They are DISPLAY-ONLY: their optional `rating` must NEVER be
// blended into a talent's star average or any STANDING signal. This loader is a
// plain public read (anon client; RLS exposes only status='published'), mirrored
// on loadTalentReviews above.
// ---------------------------------------------------------------------------

type TestimonialRow = {
  id: string;
  author_name: string | null;
  author_role: string | null;
  body: string | null;
  rating: number | null;
  created_at: string;
};

/**
 * Published testimonials for a talent profile, newest first. Public-safe.
 * Returns [] when none (or when supabase is unconfigured). The optional rating
 * is carried through untouched for per-card display and is NEVER aggregated.
 */
export async function loadPublishedTestimonials(
  talentProfileId: string,
  limit = 12,
): Promise<Testimonial[]> {
  if (!talentProfileId) return [];
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tenant_testimonials")
    .select("id, author_name, author_role, body, rating, created_at")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<TestimonialRow[]>();

  if (error || !data || data.length === 0) return [];

  return data
    .filter((r) => (r.body ?? "").trim().length > 0)
    .map((r) => ({
      id: r.id,
      authorName: r.author_name?.trim() || null,
      authorRole: r.author_role?.trim() || null,
      body: (r.body ?? "").trim(),
      rating: typeof r.rating === "number" ? r.rating : null,
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

  // Star histogram + per-attribute means over the SAME published+verified rows
  // the public average is derived from (migration 20261110040000: public
  // aggregate = status='published' AND verified_paid). Computed in one grouped
  // read and merged onto whichever count/average path is taken below.
  const breakdown = await loadTalentRatingBreakdown(supabase, talentProfileId);

  // Fast path — denormalized cache columns.
  const { data: profileRow } = await supabase
    .from("talent_profiles")
    .select("rating_avg, rating_count, would_book_again_pct")
    .eq("id", talentProfileId)
    .returns<{ rating_avg: number | null; rating_count: number | null; would_book_again_pct: number | null }[]>()
    .maybeSingle();

  const cachedCount = profileRow?.rating_count ?? null;
  if (typeof cachedCount === "number" && cachedCount > 0) {
    const avg = Number(profileRow?.rating_avg ?? 0);
    return {
      average: Number.isFinite(avg) ? Math.round(avg * 10) / 10 : 0,
      count: cachedCount,
      wouldBookAgainPct: profileRow?.would_book_again_pct ?? null,
      distribution: breakdown.distribution,
      attrAverages: breakdown.attrAverages,
    };
  }
  if (cachedCount === 0) {
    return { ...empty, distribution: null, attrAverages: null };
  }

  // Fallback — aggregate published rows directly.
  const { data, error } = await supabase
    .from("talent_reviews")
    .select("rating")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .returns<{ rating: number }[]>();

  if (error || !data || data.length === 0) {
    return { ...empty, distribution: null, attrAverages: null };
  }
  const sum = data.reduce((acc, r) => acc + (r.rating || 0), 0);
  const average = Math.round((sum / data.length) * 10) / 10;
  return {
    average,
    count: data.length,
    distribution: breakdown.distribution,
    attrAverages: breakdown.attrAverages,
  };
}

type RatingBreakdownRow = {
  rating: number | null;
  attr_professionalism: number | null;
  attr_skill: number | null;
  attr_communication: number | null;
  attr_reliability: number | null;
};

/**
 * Star histogram (5..1) and per-attribute means over the published + verified
 * rows the public average uses. Returns both null when there are no such rows
 * (count 0), so a talent with no verified reviews shows no breakdown.
 */
async function loadTalentRatingBreakdown(
  supabase: NonNullable<ReturnType<typeof createPublicSupabaseClient>>,
  talentProfileId: string,
): Promise<{
  distribution: { stars: number; count: number }[] | null;
  attrAverages: TalentRatingSummary["attrAverages"];
}> {
  const { data, error } = await supabase
    .from("talent_reviews")
    .select(
      "rating, attr_professionalism, attr_skill, attr_communication, attr_reliability",
    )
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .eq("verified_paid", true)
    .returns<RatingBreakdownRow[]>();

  if (error || !data || data.length === 0) {
    return { distribution: null, attrAverages: null };
  }

  const counts = new Map<number, number>([
    [5, 0],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 0],
  ]);
  for (const r of data) {
    const star = Math.round(Number(r.rating));
    if (counts.has(star)) counts.set(star, (counts.get(star) ?? 0) + 1);
  }
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: counts.get(stars) ?? 0,
  }));

  const mean = (key: keyof RatingBreakdownRow): number | null => {
    let sum = 0;
    let n = 0;
    for (const r of data) {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        n += 1;
      }
    }
    return n === 0 ? null : Math.round((sum / n) * 10) / 10;
  };

  return {
    distribution,
    attrAverages: {
      professionalism: mean("attr_professionalism"),
      skill: mean("attr_skill"),
      communication: mean("attr_communication"),
      reliability: mean("attr_reliability"),
    },
  };
}

// ---------------------------------------------------------------------------
// Two-sided reviews (W8) read helpers.
//
// These read the NON-public client_reviews table (talent → client) + owner/admin
// views of talent_reviews. They use the authed server client so RLS scopes rows
// to the caller (subject client / author talent / staff). NEW tables/columns are
// read with .returns<T>().
// ---------------------------------------------------------------------------

type ClientReviewRow = {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  author_user_id: string;
  author_talent_profile_id: string | null;
  client_user_id: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  created_at: string;
};

type TalentReviewOwnerRow = ReviewRow & { reported_at: string | null };

function mapClientReviewRow(
  r: ClientReviewRow,
  authorNames: Map<string, string | null>,
): ClientReview {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    bookingId: r.booking_id,
    authorUserId: r.author_user_id,
    authorName: authorNames.get(r.author_user_id) ?? null,
    clientUserId: r.client_user_id,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
  };
}

/**
 * PUBLISHED talent → client reviews ABOUT a client (received reviews), newest
 * first. RLS exposes these rows only to the subject client, the author, or
 * tenant staff/platform — pass the relevant authed session implicitly via the
 * cached server client.
 */
export async function loadClientReviews(
  clientUserId: string,
  limit = 20,
): Promise<ClientReview[]> {
  if (!clientUserId) return [];
  const supabase = await getCachedServerSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("client_reviews")
    .select(
      "id, tenant_id, booking_id, author_user_id, author_talent_profile_id, client_user_id, rating, body, status, created_at",
    )
    .eq("client_user_id", clientUserId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ClientReviewRow[]>();

  if (error || !data || data.length === 0) return [];

  const authorNames = await resolveFirstNames(data.map((r) => r.author_user_id));
  return data.map((r) => mapClientReviewRow(r, authorNames));
}

/**
 * Average + count of PUBLISHED talent → client reviews about a client. Computed
 * on read (no denormalized cache for clients). Returns { average: 0, count: 0 }
 * when none are visible.
 */
export async function loadClientRatingSummary(
  clientUserId: string,
): Promise<RatingSummary> {
  const empty: RatingSummary = { average: 0, count: 0 };
  if (!clientUserId) return empty;
  const supabase = await getCachedServerSupabase();
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from("client_reviews")
    .select("rating")
    .eq("client_user_id", clientUserId)
    .eq("status", "published")
    .returns<{ rating: number }[]>();

  if (error || !data || data.length === 0) return empty;
  const sum = data.reduce((acc, r) => acc + (r.rating || 0), 0);
  const average = Math.round((sum / data.length) * 10) / 10;
  return { average, count: data.length };
}

/**
 * Client → talent reviews AUTHORED by a user ("reviews I gave"). Reads the
 * caller's own rows (RLS: client_user_id = auth.uid()) regardless of status, so
 * the author still sees an edited/hidden review they wrote.
 */
export async function loadReviewsAuthoredByUser(
  userId: string,
  limit = 50,
): Promise<TalentReview[]> {
  if (!userId) return [];
  const supabase = await getCachedServerSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("talent_reviews")
    .select(
      "id, talent_profile_id, booking_id, client_user_id, rating, body, status, created_at, reply_body, reply_at",
    )
    .eq("client_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReviewRow[]>();

  if (error || !data || data.length === 0) return [];

  const names = await resolveFirstNames(data.map((r) => r.client_user_id));
  return data.map((r) => ({
    id: r.id,
    talentProfileId: r.talent_profile_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    clientName: r.anon ? null : names.get(r.client_user_id) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
    replyBody: r.reply_body ?? null,
    replyAt: r.reply_at ?? null,
  }));
}

/**
 * ALL client → talent reviews for a talent profile INCLUDING hidden rows — for
 * the talent owner / admin to see their full received-reviews list with status.
 * RLS gates this to the profile owner or tenant staff/platform.
 */
export async function loadTalentReviewsForOwner(
  talentProfileId: string,
  limit = 100,
): Promise<TalentReview[]> {
  if (!talentProfileId) return [];
  const supabase = await getCachedServerSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("talent_reviews")
    .select(
      "id, talent_profile_id, booking_id, client_user_id, rating, body, status, created_at, reported_at, anon, reply_body, reply_at",
    )
    .eq("talent_profile_id", talentProfileId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<TalentReviewOwnerRow[]>();

  if (error || !data || data.length === 0) return [];

  const names = await resolveClientFirstNames(data.map((r) => r.client_user_id));
  return data.map((r) => ({
    id: r.id,
    talentProfileId: r.talent_profile_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    // An anonymous reviewer is anonymous to the talent too — blank the name so
    // the owner's own Reviews page renders "Verified client", matching public.
    clientName: r.anon ? null : names.get(r.client_user_id) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
    replyBody: r.reply_body ?? null,
    replyAt: r.reply_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Growth notes (private coaching) — owner-only read.
//
// `talent_reviews.private_note` is talent-only coaching feedback a client can
// leave alongside a review. RLS (talent_reviews_merged_select_public) exposes a
// review row to the subject talent (tp.user_id = auth.uid()), so this read MUST
// run as the authed owner via getCachedServerSupabase() — never the anon/public
// client. Returns the most recent non-empty notes, newest first.
// ---------------------------------------------------------------------------

/** One private coaching note left on a talent's own received review. */
export type OwnerPrivateNote = {
  reviewId: string;
  note: string;
  createdAt: string;
};

type PrivateNoteRow = {
  id: string;
  private_note: string | null;
  created_at: string;
};

/**
 * Recent non-empty `private_note` values on the talent's OWN received reviews,
 * newest first. private_note is column-privilege protected (migration
 * 20261110070000): anon + authenticated cannot SELECT it at all, so this read
 * runs on the SERVICE-ROLE client AFTER an explicit ownership check — the
 * authed caller must be the profile's owner (owner-only by contract: the UI
 * promises "Only you can see these"). Returns [] when none (or unauthorized).
 */
export async function loadOwnerPrivateNoteThemes(
  talentProfileId: string,
  limit = 6,
): Promise<OwnerPrivateNote[]> {
  if (!talentProfileId) return [];
  const supabase = await getCachedServerSupabase();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const svc = createServiceRoleClient();
  if (!svc) return [];

  // Ownership check — the caller must be the subject talent.
  const { data: profileRow } = await svc
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .returns<{ user_id: string | null }[]>()
    .maybeSingle();
  if (!profileRow?.user_id || profileRow.user_id !== user.id) return [];

  const { data, error } = await svc
    .from("talent_reviews")
    .select("id, private_note, created_at")
    .eq("talent_profile_id", talentProfileId)
    .not("private_note", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<PrivateNoteRow[]>();

  if (error || !data || data.length === 0) return [];

  return data
    .map((r) => ({
      reviewId: r.id,
      note: (r.private_note ?? "").trim(),
      createdAt: r.created_at,
    }))
    .filter((n) => n.note.length > 0);
}
