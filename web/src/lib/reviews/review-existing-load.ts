import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewableBooking } from "./review-types";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Load a client's own existing reviews for edit pre-fill.
 *
 * `talent_reviews.private_note` has NO column privilege for anon/authenticated
 * (migration 20261110070000), so selecting it through the client's session makes
 * Postgres reject the WHOLE select. The public columns are read through the user
 * session; the author's own note is read separately through the service-role
 * client, strictly scoped to `client_user_id = userId` and the given bookings.
 * A failed note read leaves `privateNote` null and never fails the list.
 */

/** Everything the edit form needs EXCEPT private_note (never selected via user session). */
export const EXISTING_REVIEW_PUBLIC_COLUMNS =
  "booking_id, talent_profile_id, rating, body, would_book_again, attr_professionalism, attr_skill, attr_communication, attr_reliability, traits, anon, published_at";

type ExistingReviewRow = {
  booking_id: string | null;
  talent_profile_id: string;
  rating: number;
  body: string | null;
  would_book_again: boolean | null;
  attr_professionalism: number | null;
  attr_skill: number | null;
  attr_communication: number | null;
  attr_reliability: number | null;
  traits: string[] | null;
  anon: boolean | null;
  published_at: string | null;
};

type PrivateNoteRow = {
  booking_id: string | null;
  talent_profile_id: string;
  private_note: string | null;
};

export type ExistingReview = NonNullable<ReviewableBooking["existingReview"]>;

export async function loadExistingReviewsByKey(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient | null,
  userId: string,
  bookingIds: string[],
): Promise<Map<string, ExistingReview>> {
  const out = new Map<string, ExistingReview>();
  if (bookingIds.length === 0) return out;

  const { data: existing, error: existingErr } = await userClient
    .from("talent_reviews")
    .select(EXISTING_REVIEW_PUBLIC_COLUMNS)
    .in("booking_id", bookingIds)
    .eq("client_user_id", userId)
    .returns<ExistingReviewRow[]>();

  if (existingErr) logServerError("reviews.loadExistingReviewsByKey", existingErr);
  const rows = existing ?? [];
  if (rows.length === 0) return out;

  const notes = new Map<string, string>();
  if (serviceClient) {
    try {
      const { data: noteRows, error } = await serviceClient
        .from("talent_reviews")
        .select("booking_id, talent_profile_id, private_note")
        .eq("client_user_id", userId)
        .in("booking_id", bookingIds)
        .returns<PrivateNoteRow[]>();
      if (!error) {
        for (const n of noteRows ?? []) {
          if (n.booking_id && n.private_note) {
            notes.set(`${n.booking_id}:${n.talent_profile_id}`, n.private_note);
          }
        }
      }
    } catch {
      // The note is a nicety; never fail the list over it.
    }
  }

  for (const e of rows) {
    const key = `${e.booking_id}:${e.talent_profile_id}`;
    out.set(key, {
      rating: e.rating,
      body: e.body,
      wouldBookAgain: e.would_book_again ?? null,
      attrProfessionalism: e.attr_professionalism ?? null,
      attrSkill: e.attr_skill ?? null,
      attrCommunication: e.attr_communication ?? null,
      attrReliability: e.attr_reliability ?? null,
      traits: Array.isArray(e.traits) ? e.traits : null,
      privateNote: notes.get(key) ?? null,
      anon: e.anon ?? false,
      publishedAt: e.published_at ?? null,
    });
  }
  return out;
}
